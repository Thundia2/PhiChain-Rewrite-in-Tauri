// ============================================================
// Onset Detector
//
// Analyzes audio to find onset points (sudden increases in
// spectral energy) that indicate where notes could be placed.
//
// Algorithm: Spectral Flux with adaptive peak picking.
// Runs entirely in the browser via Web Audio API.
//
// Reference implementations:
//   - librosa onset.py (Python)
//   - aubio onset (C)
//   - ChroMapper-AutoMapper (C#)
//
// Usage:
//   const markers = await detectOnsets(audioUrl, { sensitivity: 0.5 });
//   // markers = [{ time: 1.234, strength: 0.87 }, ...]
//
// Recent change: Created as new file for onset detection feature.
// ============================================================

// ============================================================
// CONFIGURABLE: Onset detection parameters
// These are the "knobs" that control the algorithm's behavior.
// ============================================================

/** FFT window size. 2048 @ 44.1kHz = ~46ms frames.
 *  Larger = better frequency resolution, worse time resolution.
 *  Must be a power of 2. */
const FFT_SIZE = 2048;

/** Hop between consecutive FFT windows, in samples.
 *  512 @ 44.1kHz = ~11.6ms resolution.
 *  Smaller = more frames = finer onset timing but slower. */
export const HOP_SIZE = 512;

/** Number of frames for the adaptive threshold mean window.
 *  Larger = less sensitive to sustained loudness changes.
 *  15 frames @ 512 hop @ 44.1kHz ≈ 175ms lookback.
 *  Matches librosa's pre_avg + post_avg ≈ 0.2s total. */
const MEAN_WINDOW = 15;

/** Delta range mapped from user's sensitivity slider.
 *  Threshold = running_mean + delta.
 *  sensitivity=0.0 → DELTA_MAX (very few onsets)
 *  sensitivity=1.0 → DELTA_MIN (many onsets)
 *  librosa's default delta is 0.07 on a [0,1] normalized envelope. */
const DELTA_MAX = 0.3;
const DELTA_MIN = 0.01;

/** Minimum milliseconds between consecutive onsets.
 *  Prevents double-triggers on a single transient.
 *  50ms = max 20 onsets/sec (faster than any rhythm game). */
const MIN_ONSET_INTERVAL_MS = 50;

/** Discard onsets weaker than this (post-normalization).
 *  Prevents near-silent noise from showing up as markers. */
const MIN_STRENGTH = 0.05;

// ============================================================
// Types
// ============================================================

export interface OnsetMarker {
  /** Time in seconds from the start of the audio file */
  time: number;
  /** Normalized strength 0.0-1.0 (1.0 = strongest onset in the file) */
  strength: number;
}

export interface OnsetDetectionOptions {
  /** User sensitivity: 0.0 (few markers) to 1.0 (many markers). Default 0.5. */
  sensitivity?: number;
}

// ============================================================
// Two-layer cache
// ============================================================

// Layer 1: Spectral flux per URL — the expensive part (FFT).
// Survives sensitivity changes so the slider feels instant.
export interface FluxCacheEntry {
  flux: Float32Array;
  sampleRate: number;
}
const fluxCache = new Map<string, FluxCacheEntry>();

// Layer 2: Final onset markers per URL+sensitivity.
const onsetCache = new Map<string, OnsetMarker[]>();

/** In-flight promises to avoid duplicate parallel FFT runs */
const pendingFluxComputation = new Map<string, Promise<FluxCacheEntry>>();

// ============================================================
// Public API
// ============================================================

/**
 * Detect onsets in an audio file.
 *
 * Uses a two-layer cache:
 *   1. Spectral flux is cached per URL (expensive FFT, runs once).
 *   2. Final markers are cached per URL+sensitivity (cheap peak picking).
 * This makes the sensitivity slider feel instant — only steps 3-4
 * re-run, not the full FFT pipeline.
 *
 * @param url     - Audio URL or blob URL (same as what audioEngine loads)
 * @param options - Detection parameters
 * @returns Array of onset markers sorted by time
 */
export async function detectOnsets(
  url: string,
  options: OnsetDetectionOptions = {},
): Promise<OnsetMarker[]> {
  const sensitivity = options.sensitivity ?? 0.5;
  const cacheKey = `${url}:${sensitivity.toFixed(2)}`;

  // Check layer 2: exact match for this sensitivity
  const cached = onsetCache.get(cacheKey);
  if (cached) return cached;

  // Ensure spectral flux is computed (layer 1)
  let fluxEntry = fluxCache.get(url);
  if (!fluxEntry) {
    // Check if FFT is already in progress for this URL
    let pending = pendingFluxComputation.get(url);
    if (!pending) {
      pending = computeFluxForUrl(url);
      pendingFluxComputation.set(url, pending);
    }
    try {
      fluxEntry = await pending;
    } finally {
      pendingFluxComputation.delete(url);
    }
  }

  // Steps 3-4: peak pick with this sensitivity (fast, <5ms)
  const markers = pickOnsetsFromFlux(fluxEntry, sensitivity);
  onsetCache.set(cacheKey, markers);
  return markers;
}

/** Clear onset cache (call when audio changes or project unloads). */
export function clearOnsetCache(url?: string): void {
  if (url) {
    fluxCache.delete(url);
    for (const key of onsetCache.keys()) {
      if (key.startsWith(url + ":")) onsetCache.delete(key);
    }
  } else {
    fluxCache.clear();
    onsetCache.clear();
  }
}

/**
 * Get or compute the spectral flux for an audio URL.
 * Returns the cached flux if available, otherwise decodes and computes.
 * Used by the calibration wizard to access raw flux data for region analysis.
 */
export async function getOrComputeFlux(url: string): Promise<FluxCacheEntry> {
  const cached = fluxCache.get(url);
  if (cached) return cached;

  let pending = pendingFluxComputation.get(url);
  if (!pending) {
    pending = computeFluxForUrl(url);
    pendingFluxComputation.set(url, pending);
  }
  try {
    return await pending;
  } finally {
    pendingFluxComputation.delete(url);
  }
}

// ============================================================
// Internal: Two-stage pipeline
// ============================================================

/**
 * Stage 1 (expensive): Decode audio → mono downmix → streaming STFT → spectral flux.
 * Runs once per audio file and is cached in fluxCache.
 */
async function computeFluxForUrl(url: string): Promise<FluxCacheEntry> {
  // ---- Step 0: Decode audio ----
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  let audioBuffer: AudioBuffer;
  if (typeof OfflineAudioContext !== "undefined") {
    // Use OfflineAudioContext for decoding — doesn't require user gesture
    const ctx = new OfflineAudioContext(1, 1, 44100);
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } else {
    // Fallback: standard AudioContext
    const ctx = new AudioContext();
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } finally {
      await ctx.close();
    }
  }

  // ---- Step 0b: Downmix to mono ----
  // Averaging all channels prevents missing onsets from panned instruments
  // (e.g., a hi-hat panned hard right would be silent in channel 0 alone).
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  let samples: Float32Array;
  if (numChannels === 1) {
    samples = audioBuffer.getChannelData(0);
  } else {
    const length = audioBuffer.length;
    samples = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        samples[i] += channelData[i];
      }
    }
    const scale = 1 / numChannels;
    for (let i = 0; i < length; i++) {
      samples[i] *= scale;
    }
  }

  // ---- Steps 1-2: Streaming STFT → Spectral flux ----
  // Computes STFT and spectral flux in a single pass, keeping only
  // the current and previous magnitude frames alive at any time.
  // This uses ~16KB instead of ~60MB for a 3-minute song.
  const flux = computeStreamingFlux(samples, FFT_SIZE, HOP_SIZE);

  const entry: FluxCacheEntry = { flux, sampleRate };
  fluxCache.set(url, entry);
  return entry;
}

/**
 * Stage 2 (cheap): Adaptive threshold → peak pick → normalize.
 * Runs in <5ms, so the sensitivity slider feels instant.
 */
export function pickOnsetsFromFlux(
  entry: FluxCacheEntry,
  sensitivity: number,
): OnsetMarker[] {
  const { flux, sampleRate } = entry;

  // ---- Step 3: Adaptive thresholding (running mean + delta) ----
  // Matches librosa's peak_pick approach (Boeck et al. 2012).
  // Higher delta = fewer onsets; lower delta = more onsets.
  //
  // Delta is scaled by the global mean flux so sensitivity works
  // regardless of the audio's absolute energy level. Without this,
  // the fixed delta range (0.01–0.3) would be negligible compared
  // to raw flux values that can be in the hundreds or thousands.
  const baseDelta = DELTA_MAX - sensitivity * (DELTA_MAX - DELTA_MIN);
  let globalMean = 0;
  for (let i = 0; i < flux.length; i++) globalMean += flux[i];
  globalMean = flux.length > 0 ? globalMean / flux.length : 1;
  const delta = baseDelta * Math.max(globalMean, 1);
  const threshold = computeAdaptiveThreshold(flux, MEAN_WINDOW, delta);

  // ---- Step 4: Peak picking ----
  const minIntervalFrames = Math.ceil(
    (MIN_ONSET_INTERVAL_MS / 1000) * sampleRate / HOP_SIZE,
  );
  const rawOnsets = pickPeaks(flux, threshold, minIntervalFrames);

  // ---- Step 5: Normalize strengths and convert to time ----
  let maxFlux = 0;
  for (const idx of rawOnsets) {
    if (flux[idx] > maxFlux) maxFlux = flux[idx];
  }

  const markers: OnsetMarker[] = [];
  for (const idx of rawOnsets) {
    const strength = maxFlux > 0 ? flux[idx] / maxFlux : 0;
    if (strength < MIN_STRENGTH) continue;
    markers.push({
      time: (idx * HOP_SIZE) / sampleRate,
      strength,
    });
  }

  return markers;
}

// ============================================================
// Internal: DSP Functions
// ============================================================

/**
 * Compute STFT and spectral flux in a single streaming pass.
 *
 * Instead of allocating all ~15,500 magnitude frames (~60MB for a
 * 3-minute song), this keeps only the current and previous frame
 * alive at any time, reducing peak memory to ~16KB regardless of
 * song length. The spectral flux array (~62KB for 3 minutes) is
 * the only large output.
 *
 * Since we only need magnitudes (not phase), and the Web Audio API
 * doesn't expose raw FFT (AnalyserNode returns smoothed dB values
 * with no hop control — unsuitable for spectral flux), we implement
 * a minimal real-valued FFT using the Cooley-Tukey algorithm.
 *
 * Performance note: this runs on the main thread. For songs >5
 * minutes, consider moving Stage 1 to a Web Worker for non-blocking
 * behavior (see ONSET_DETECTION_PLAN.md §9).
 */
function computeStreamingFlux(
  samples: Float32Array,
  fftSize: number,
  hopSize: number,
): Float32Array {
  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;
  if (numFrames <= 0) return new Float32Array(0);

  const hannWindow = createHannWindow(fftSize);
  const numBins = fftSize / 2 + 1;
  const flux = new Float32Array(numFrames);

  // Only two magnitude frames alive at any time (current + previous)
  let prevMag = new Float32Array(numBins);
  const currMag = new Float32Array(numBins);

  // Pre-allocate FFT working buffers
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;

    // Apply Hann window and copy samples into FFT input buffer
    for (let i = 0; i < fftSize; i++) {
      real[i] = (samples[offset + i] ?? 0) * hannWindow[i];
      imag[i] = 0;
    }

    // In-place FFT
    fft(real, imag);

    // Compute magnitude for positive frequencies only
    for (let i = 0; i < numBins; i++) {
      currMag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    // Compute half-wave rectified spectral flux against previous frame
    if (f > 0) {
      let sum = 0;
      for (let bin = 0; bin < numBins; bin++) {
        const diff = currMag[bin] - prevMag[bin];
        if (diff > 0) sum += diff; // Half-wave rectification: only energy increases
      }
      flux[f] = sum;
    }
    // flux[0] stays 0 (no previous frame to compare against)

    // Swap: copy current magnitudes into previous for next iteration
    prevMag.set(currMag);
  }

  return flux;
}

/** Hann window: w(n) = 0.5 * (1 - cos(2πn / (N-1))) */
function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * In-place Cooley-Tukey radix-2 FFT.
 *
 * Operates on separate real and imaginary arrays.
 * Input must be power-of-2 length.
 */
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Butterfly operations
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;

    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const theta = angle * j;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        const re = real[i + j + halfLen] * cos - imag[i + j + halfLen] * sin;
        const im = real[i + j + halfLen] * sin + imag[i + j + halfLen] * cos;

        real[i + j + halfLen] = real[i + j] - re;
        imag[i + j + halfLen] = imag[i + j] - im;
        real[i + j] += re;
        imag[i + j] += im;
      }
    }
  }
}

/**
 * Compute an adaptive threshold using a running mean + delta.
 *
 * The threshold at each frame is: mean(surrounding frames) + delta.
 * This matches the approach used by both librosa (peak_pick) and
 * madmom (OnsetPeakPickingProcessor), per Boeck et al. 2012 (ISMIR).
 *
 * Running mean adapts to local loudness — quiet sections get a lower
 * threshold, loud sections get a higher one. The delta offset controls
 * how far above the local mean a frame must be to count as an onset.
 *
 * Complexity: O(n) using a sliding window sum.
 */
function computeAdaptiveThreshold(
  flux: Float32Array,
  windowSize: number,
  delta: number,
): Float32Array {
  const threshold = new Float32Array(flux.length);
  const halfWindow = Math.floor(windowSize / 2);

  // Sliding window mean — O(n) total
  for (let i = 0; i < flux.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(flux.length, i + halfWindow + 1);

    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += flux[j];
    }
    const mean = sum / (end - start);
    threshold[i] = mean + delta;
  }

  return threshold;
}

/**
 * Pick peaks from the spectral flux that exceed the adaptive threshold.
 *
 * A frame is a peak if:
 *   1. Its flux exceeds the threshold at that frame
 *   2. It's a local maximum (flux[i] > flux[i-1] AND flux[i] >= flux[i+1])
 *   3. It's at least minInterval frames from the previous peak
 *
 * Returns an array of frame indices.
 */
function pickPeaks(
  flux: Float32Array,
  threshold: Float32Array,
  minInterval: number,
): number[] {
  const peaks: number[] = [];
  let lastPeakIdx = -minInterval; // Allow the very first frame

  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] <= threshold[i]) continue;         // Below threshold
    if (flux[i] < flux[i - 1]) continue;           // Not a local max (rising)
    if (flux[i] < flux[i + 1]) continue;           // Not a local max (falling)
    if (i - lastPeakIdx < minInterval) continue;    // Too close to previous peak

    peaks.push(i);
    lastPeakIdx = i;
  }

  return peaks;
}

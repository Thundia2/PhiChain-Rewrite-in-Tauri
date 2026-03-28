// ============================================================
// Waveform Analyzer
//
// Decodes audio and downsamples it into amplitude bins for
// visualization in the timeline. Results are cached per URL
// so analysis only runs once per audio file.
//
// Uses OfflineAudioContext when available; falls back to a
// simple fetch+decode path otherwise.
// ============================================================

/** Module-level cache: URL -> waveform data */
const waveformCache = new Map<string, Float32Array>();

/** Module-level cache for in-flight promises to avoid duplicate work */
const pendingAnalysis = new Map<string, Promise<Float32Array>>();

/**
 * Downsample an AudioBuffer into N amplitude bins.
 *
 * For each bin, we compute the RMS (root-mean-square) amplitude
 * of the samples that fall within that bin's time range. The result
 * is normalized to 0..1 where 1 = the loudest bin.
 *
 * @param audioBuffer - Decoded audio data
 * @param numBins - Number of output bins (e.g., 1000)
 * @returns Float32Array of length numBins with values in [0, 1]
 */
export function analyzeWaveform(
  audioBuffer: AudioBuffer,
  numBins: number,
): Float32Array {
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const totalSamples = channelData.length;
  const samplesPerBin = totalSamples / numBins;
  const result = new Float32Array(numBins);

  // Compute RMS for each bin
  let maxAmplitude = 0;
  for (let bin = 0; bin < numBins; bin++) {
    const startSample = Math.floor(bin * samplesPerBin);
    const endSample = Math.min(
      Math.floor((bin + 1) * samplesPerBin),
      totalSamples,
    );

    let sumOfSquares = 0;
    const count = endSample - startSample;
    if (count === 0) continue;

    for (let i = startSample; i < endSample; i++) {
      const sample = channelData[i];
      sumOfSquares += sample * sample;
    }

    const rms = Math.sqrt(sumOfSquares / count);
    result[bin] = rms;
    if (rms > maxAmplitude) maxAmplitude = rms;
  }

  // Normalize to 0..1
  if (maxAmplitude > 0) {
    for (let i = 0; i < numBins; i++) {
      result[i] = result[i] / maxAmplitude;
    }
  }

  return result;
}

/**
 * Load audio from a URL, decode it, and analyze the waveform.
 *
 * Results are cached so subsequent calls with the same URL
 * return instantly.
 *
 * @param url - URL or blob URL to load audio from
 * @param numBins - Number of amplitude bins to produce
 * @returns Promise resolving to a Float32Array of normalized amplitudes
 */
export async function loadWaveformFromUrl(
  url: string,
  numBins: number = 2000,
): Promise<Float32Array> {
  // Return cached result if available
  const cacheKey = `${url}:${numBins}`;
  const cached = waveformCache.get(cacheKey);
  if (cached) return cached;

  // Return pending promise if analysis is already in progress
  const pending = pendingAnalysis.get(cacheKey);
  if (pending) return pending;

  const promise = doAnalysis(url, numBins, cacheKey);
  pendingAnalysis.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    pendingAnalysis.delete(cacheKey);
  }
}

async function doAnalysis(
  url: string,
  numBins: number,
  cacheKey: string,
): Promise<Float32Array> {
  // Fetch the audio data
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  // Decode using OfflineAudioContext if available, otherwise AudioContext
  let audioBuffer: AudioBuffer;

  if (typeof OfflineAudioContext !== "undefined") {
    // OfflineAudioContext is preferred -- it doesn't need audio output hardware
    // We create a minimal context just for decoding
    const offlineCtx = new OfflineAudioContext(1, 1, 44100);
    audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
  } else if (typeof AudioContext !== "undefined") {
    // Fallback to regular AudioContext
    const ctx = new AudioContext();
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } finally {
      await ctx.close();
    }
  } else {
    // No Web Audio API available -- return empty data
    console.warn(
      "Waveform analysis unavailable: no Web Audio API (OfflineAudioContext or AudioContext)",
    );
    const empty = new Float32Array(numBins);
    waveformCache.set(cacheKey, empty);
    return empty;
  }

  const result = analyzeWaveform(audioBuffer, numBins);
  waveformCache.set(cacheKey, result);
  return result;
}

/**
 * Clear the waveform cache for a specific URL or all URLs.
 * Call this when audio is unloaded or changed.
 */
export function clearWaveformCache(url?: string): void {
  if (url) {
    // Clear all entries for this URL regardless of numBins
    for (const key of waveformCache.keys()) {
      if (key.startsWith(url + ":")) {
        waveformCache.delete(key);
      }
    }
  } else {
    waveformCache.clear();
  }
}

/**
 * Check if waveform data is cached for a given URL.
 */
export function isWaveformCached(url: string, numBins: number = 2000): boolean {
  return waveformCache.has(`${url}:${numBins}`);
}

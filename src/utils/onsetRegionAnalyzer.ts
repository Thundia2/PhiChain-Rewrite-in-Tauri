// ============================================================
// Onset Region Analyzer
//
// Analyzes spectral flux data to find 4 representative regions
// of a song for the onset calibration wizard:
//   DENSE  — heavy drums/drops (highest energy)
//   MEDIUM — typical content (~50th percentile)
//   SPARSE — intro/breakdown (~20th percentile)
//   QUIET  — near-silence (lowest non-zero energy)
//
// Pure computation utility — no React, no stores.
//
// Recent change: Created for onset calibration wizard feature.
// ============================================================

// ============================================================
// Types
// ============================================================

export type RegionLabel = "DENSE" | "MEDIUM" | "SPARSE" | "QUIET";

export interface OnsetRegion {
  /** Category label for display */
  label: RegionLabel;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Average spectral flux in this window (for sorting/display) */
  meanFlux: number;
  /** Index into the flux array where this region starts */
  fluxStartIdx: number;
  /** Index into the flux array where this region ends */
  fluxEndIdx: number;
}

// ============================================================
// Configuration
// ============================================================

/** Duration of each analysis window in seconds */
const WINDOW_DURATION_SEC = 6;

/** Minimum number of windows needed to produce any result */
const MIN_WINDOWS = 2;

// ============================================================
// Public API
// ============================================================

/**
 * Analyze spectral flux data and return up to 4 representative regions.
 *
 * Divides the flux into non-overlapping 6-second windows, ranks them
 * by mean flux, and picks windows at different density percentiles.
 *
 * @param flux       - Spectral flux array from onset detection (one value per frame)
 * @param sampleRate - Audio sample rate (e.g., 44100)
 * @param hopSize    - Hop size used during STFT (e.g., 512)
 * @param audioDuration - Total audio duration in seconds
 * @returns Array of 2-4 OnsetRegion objects, sorted by label order
 */
export function analyzeRegions(
  flux: Float32Array,
  sampleRate: number,
  hopSize: number,
  audioDuration: number,
): OnsetRegion[] {
  if (flux.length === 0 || audioDuration <= 0) return [];

  // Compute frames per window
  const framesPerWindow = Math.floor((WINDOW_DURATION_SEC * sampleRate) / hopSize);
  if (framesPerWindow <= 0) return [];

  // Divide flux into non-overlapping windows
  const windows: Array<{
    startIdx: number;
    endIdx: number;
    startTime: number;
    endTime: number;
    meanFlux: number;
  }> = [];

  for (let i = 0; i + framesPerWindow <= flux.length; i += framesPerWindow) {
    const endIdx = i + framesPerWindow;
    let sum = 0;
    for (let j = i; j < endIdx; j++) {
      sum += flux[j];
    }
    const mean = sum / framesPerWindow;

    // Skip completely silent windows (mean flux ≈ 0)
    if (mean < 1e-6) continue;

    const startTime = (i * hopSize) / sampleRate;
    const endTime = Math.min((endIdx * hopSize) / sampleRate, audioDuration);

    windows.push({ startIdx: i, endIdx, startTime, endTime, meanFlux: mean });
  }

  if (windows.length < MIN_WINDOWS) {
    // Not enough non-silent windows — return what we have
    return windows.map((w, i) => ({
      label: (["DENSE", "QUIET"] as RegionLabel[])[i] ?? "MEDIUM",
      startTime: w.startTime,
      endTime: w.endTime,
      meanFlux: w.meanFlux,
      fluxStartIdx: w.startIdx,
      fluxEndIdx: w.endIdx,
    }));
  }

  // Sort by mean flux descending for percentile picking
  const sorted = [...windows].sort((a, b) => b.meanFlux - a.meanFlux);

  // Pick 4 windows at different percentiles
  const picks: Array<{ window: typeof sorted[0]; label: RegionLabel }> = [];
  const usedIndices = new Set<number>();

  // Helper: find the closest unused window to a target percentile
  function pickAtPercentile(percentile: number, label: RegionLabel): void {
    const targetIdx = Math.round((sorted.length - 1) * percentile);
    // Search outward from target to find an unused window
    for (let offset = 0; offset < sorted.length; offset++) {
      for (const dir of [0, 1, -1]) {
        const idx = targetIdx + offset * (dir || 1);
        if (idx >= 0 && idx < sorted.length && !usedIndices.has(idx)) {
          picks.push({ window: sorted[idx], label });
          usedIndices.add(idx);
          return;
        }
      }
    }
  }

  // Pick in order of priority: Dense (top), Quiet (bottom), Medium (50%), Sparse (75%)
  pickAtPercentile(0, "DENSE");       // Highest energy
  pickAtPercentile(1, "QUIET");       // Lowest energy (non-silent)
  pickAtPercentile(0.5, "MEDIUM");    // Middle energy
  pickAtPercentile(0.75, "SPARSE");   // Lower-middle energy

  // Sort picks by label display order: DENSE → MEDIUM → SPARSE → QUIET
  const labelOrder: Record<RegionLabel, number> = { DENSE: 0, MEDIUM: 1, SPARSE: 2, QUIET: 3 };
  picks.sort((a, b) => labelOrder[a.label] - labelOrder[b.label]);

  return picks.map((p) => ({
    label: p.label,
    startTime: p.window.startTime,
    endTime: p.window.endTime,
    meanFlux: p.window.meanFlux,
    fluxStartIdx: p.window.startIdx,
    fluxEndIdx: p.window.endIdx,
  }));
}

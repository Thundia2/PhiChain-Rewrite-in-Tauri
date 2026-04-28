// ============================================================
// Onset Region Analyzer
//
// Divides a song's per-frame onset-probability array (100 fps
// from the Rust CNN pipeline) into non-overlapping N-second
// windows and picks 4 representative regions at different
// activation-density percentiles for the calibration dialog:
//
//   DENSE  — chorus/drop (top percentile of mean probability)
//   MEDIUM — typical content (~50th percentile)
//   SPARSE — verse / breakdown (~75th percentile, lower-middle)
//   QUIET  — near-silence (bottom percentile of non-zero mean)
//
// Pure computation utility — no React, no stores.
//
// Recent change: Rewritten for Phase C of onset plan (2026-04-20).
// Replaces the deleted flux-based version with one that consumes
// CNN salience directly from `getCachedOnsetResults()`. The old
// signature took a Float32Array of spectral flux; this one takes
// an OnsetResult[] since the new pipeline already emits per-frame
// probability at a known frame rate.
// ============================================================

import type { OnsetResult } from "./ipc";

export type RegionLabel = "DENSE" | "MEDIUM" | "SPARSE" | "QUIET";

export interface OnsetRegion {
  /** Category label for display. */
  label: RegionLabel;
  /** Start time in seconds (frame index / frame rate). */
  startTime: number;
  /** End time in seconds (exclusive). */
  endTime: number;
  /** Mean probability in this window — used for ranking + debug display. */
  meanProbability: number;
  /** Index into the input OnsetResult[] where this region starts. */
  frameStartIdx: number;
  /** Index into the input OnsetResult[] where this region ends (exclusive). */
  frameEndIdx: number;
}

/** How long each analysis window is, in seconds. Picked to be short enough
 *  that contrast between song sections is visible (verse vs chorus) but long
 *  enough that one loud kick doesn't dominate. 6 s is the old value and
 *  remains empirically good. */
const WINDOW_DURATION_SEC = 6;

/** Minimum number of non-silent windows required to produce any output.
 *  Short clips (< 12 s) fall below this and skip region analysis. */
const MIN_WINDOWS = 2;

/** Frames below this mean probability are treated as silence and excluded
 *  from percentile ranking (otherwise the ~10 s of intro silence would
 *  always be the QUIET pick, which isn't useful to audition). */
const SILENCE_PROBABILITY_FLOOR = 1e-4;

/** Display ordering for the output array — left to right in the 2×2 grid. */
const LABEL_ORDER: Record<RegionLabel, number> = {
  DENSE: 0,
  MEDIUM: 1,
  SPARSE: 2,
  QUIET: 3,
};

/**
 * Analyze per-frame CNN salience and return up to 4 representative regions.
 *
 * Divides the input into non-overlapping `WINDOW_DURATION_SEC`-wide windows,
 * drops silent windows (mean probability below SILENCE_PROBABILITY_FLOOR),
 * ranks the remaining by descending mean, and picks windows at 0%, 50%,
 * 75%, and 100% of the ranked list. The 0% pick is DENSE, 100% is QUIET.
 *
 * @param results   Per-frame onset probabilities (from getCachedOnsetResults).
 * @param frameRate Samples per second — 100 for the current pipeline.
 * @returns Between 0 and 4 OnsetRegion objects, ordered DENSE→MEDIUM→SPARSE→QUIET.
 */
export function analyzeRegions(
  results: readonly OnsetResult[],
  frameRate: number,
): OnsetRegion[] {
  if (results.length === 0 || frameRate <= 0) return [];

  const framesPerWindow = Math.floor(WINDOW_DURATION_SEC * frameRate);
  if (framesPerWindow <= 0 || results.length < framesPerWindow) return [];

  // Step 1: slide non-overlapping windows and compute mean probability per window.
  // We step by `framesPerWindow` (not overlapping) so regions don't alias each
  // other. The tail of the song (< one full window) is discarded — the
  // alternative is to include a partial-window at the end, but that window's
  // mean would be inflated by a small denominator and unfairly rank.
  const windows: Array<{
    startIdx: number;
    endIdx: number;
    startTime: number;
    endTime: number;
    meanProbability: number;
  }> = [];

  for (let i = 0; i + framesPerWindow <= results.length; i += framesPerWindow) {
    const endIdx = i + framesPerWindow;
    let sum = 0;
    for (let j = i; j < endIdx; j++) sum += results[j].probability;
    const mean = sum / framesPerWindow;

    if (mean < SILENCE_PROBABILITY_FLOOR) continue;

    windows.push({
      startIdx: i,
      endIdx,
      startTime: i / frameRate,
      endTime: endIdx / frameRate,
      meanProbability: mean,
    });
  }

  // Short or mostly-silent songs: return whatever we have, labeled by extremes.
  if (windows.length < MIN_WINDOWS) {
    return windows.map((w, idx) => ({
      label: (["DENSE", "QUIET"] as RegionLabel[])[idx] ?? "MEDIUM",
      startTime: w.startTime,
      endTime: w.endTime,
      meanProbability: w.meanProbability,
      frameStartIdx: w.startIdx,
      frameEndIdx: w.endIdx,
    }));
  }

  // Step 2: rank by mean probability descending so index 0 is DENSE.
  const ranked = [...windows].sort(
    (a, b) => b.meanProbability - a.meanProbability,
  );

  // Step 3: pick at four percentiles. We search outward from the target
  // percentile index to find an unused window — the outward search lets
  // two target percentiles collide on small songs without dropping a pick.
  const used = new Set<number>();
  const picks: Array<{ window: (typeof ranked)[number]; label: RegionLabel }> = [];

  function pickAt(percentile: number, label: RegionLabel): void {
    const target = Math.round((ranked.length - 1) * percentile);
    for (let offset = 0; offset < ranked.length; offset++) {
      // Check the target, then progressively +/- offset from it.
      for (const dir of offset === 0 ? [0] : [1, -1]) {
        const idx = target + dir * offset;
        if (idx >= 0 && idx < ranked.length && !used.has(idx)) {
          picks.push({ window: ranked[idx], label });
          used.add(idx);
          return;
        }
      }
    }
  }

  // Priority order matters: the top/bottom extremes should "claim" their
  // slots first so the middle picks never steal them. Pick DENSE (0%) and
  // QUIET (100%) first; then fill in MEDIUM (50%) and SPARSE (75%).
  pickAt(0.0, "DENSE");
  pickAt(1.0, "QUIET");
  pickAt(0.5, "MEDIUM");
  pickAt(0.75, "SPARSE");

  // Step 4: sort picks by display order so the UI renders DENSE→QUIET
  // left-to-right instead of by selection order.
  picks.sort((a, b) => LABEL_ORDER[a.label] - LABEL_ORDER[b.label]);

  return picks.map((p) => ({
    label: p.label,
    startTime: p.window.startTime,
    endTime: p.window.endTime,
    meanProbability: p.window.meanProbability,
    frameStartIdx: p.window.startIdx,
    frameEndIdx: p.window.endIdx,
  }));
}

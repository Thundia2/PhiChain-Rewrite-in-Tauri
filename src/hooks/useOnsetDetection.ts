// ============================================================
// useOnsetDetection — ML onset detection hook
//
// Runs CNN-based onset analysis via the Rust backend whenever
// audio is loaded and onset detection is enabled. Called from
// App.tsx so it's active regardless of which editor view
// (unified/classic/unrolled) is mounted.
//
// Recent change (Phase A of onset plan, 2026-04-20): Replaced the
// absolute-threshold + local-max + 50 ms-combine peak-picker with
// `peakPickT1` — rolling-median adaptive floor + local-max + density-
// budgeted top-K per 1-sec window with BPM-aware min-gap. The
// `onsetSensitivity` setting is no longer read anywhere in code; the
// new pipeline reads `onsetTargetDensity` / `onsetAbsFloor` /
// `onsetAdaptiveDelta` / `onsetMinDisplayStrength` from settingsStore.
// Snap-to-grid now runs BEFORE density selection (per §12.4 of the
// rewrite plan) to avoid burning two density-budget slots on two
// strong onsets that collapse to the same grid cell.
// ============================================================

import { useEffect, useCallback, useState } from "react";
import { useEditorStore } from "../stores/editorStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAudioStore } from "../stores/audioStore";
import { useChartStore } from "../stores/chartStore";
import { audioEngine } from "../audio/audioEngine";
import {
  detectOnsetsMl,
  writeTempAudio,
  isTauri,
  EXPECTED_ONSET_PIPELINE_VERSION,
} from "../utils/ipc";
import type { OnsetResult } from "../utils/ipc";
import { BpmList } from "../utils/bpmList";
import { beatToFloat } from "../types/chart";
import { snapBeat } from "../utils/beat";

// ── Module-level cache ──────────────────────────────────────────
// Lives outside React so it survives component re-renders, session
// restore cycles (musicLoaded false→true), and view switches.
// The Rust CNN pipeline (~1-3s) only re-runs when the actual music
// file changes, not when React dependencies trigger re-renders.

/** Full CNN probability array for the current music file. */
let _cachedResults: OnsetResult[] | null = null;

/**
 * Read-only accessor for the cached per-frame onset probability array.
 * Used by the onset calibration dialog (Phase C, 2026-04-20) so it can
 * render raw salience into its region-preview canvases without running
 * a second Rust inference pass. Returns `null` when detection has not
 * run on the current music file yet.
 *
 * Note: this is a snapshot, not a subscription. Callers needing live
 * updates can subscribe to `editorStore.onsetMarkers` — whenever markers
 * change, `_cachedResults` has also been updated.
 */
export function getCachedOnsetResults(): readonly OnsetResult[] | null {
  return _cachedResults;
}

/** Cache key — music path for disk projects, blob URL for imports. */
let _cachedMusicKey: string | null = null;

/** For imported charts: reuse the same temp file path if blob URL hasn't changed. */
let _cachedTempPath: string | null = null;

/** Monotonically increasing version counter — bumped when _cachedResults changes.
 *  Effect B watches this to know when to re-apply the threshold. */
let _cacheVersion = 0;

// ── Peak-picking parameters (Phase A rewrite) ──────────────────
// The old "absolute threshold + ±20 ms local max + 50 ms combine"
// picker fired ~9.5 events/sec on a 182 BPM song regardless of
// threshold: 42 % of madmom CNN frames have prob > 0.50, so threshold
// is non-selective. peakPickT1 replaces it with:
//   1) Rolling-median adaptive floor (suppresses sustained high-
//      activation regions) clamped from below by an absolute floor.
//   2) Local-maximum gate against the per-frame adaptive threshold.
//   3) Density-budgeted top-K per 1-second window, with a BPM-aware
//      min-gap so the picker never fires faster than a 16th note at
//      the chart's current tempo.

/** Frames to look back/ahead for local-maximum check. ±2 frames = ±20 ms. */
const PRE_MAX = 2;
const POST_MAX = 2;

/** Window size for the adaptive-threshold rolling median, in frames.
 *  100 frames = 1 second at 100 fps. */
const ADAPTIVE_WIN = 100;

/** Width of the density-budget window in frames (also 1 second). */
const DENSITY_WIN = 100;

// ── Peak picker (exported for unit tests) ───────────────────────

/**
 * Histogram-based rolling median + delta, producing a per-frame
 * adaptive threshold bounded below by `absFloor`. Mutates `out` in place.
 *
 * Quantizes probabilities to 256 buckets over [0, 1] — resolution is
 * 1/256 ≈ 0.004, well below any CNN-output granularity we care about.
 * Sliding-window O(n × 256) = ~2 ms for 18 000 frames, vs. the naive
 * Array.prototype.sort() per frame which would be O(n × w × log w)
 * and cost ~30 ms on the same input.
 *
 * Exported for src/__tests__/useOnsetDetection.test.ts.
 */
export function computeRollingMedianFloor(
  results: OnsetResult[],
  win: number,
  absFloor: number,
  delta: number,
  out: Float32Array,
): void {
  const n = results.length;
  if (n === 0) return;
  const BUCKETS = 256;
  const hist = new Int32Array(BUCKETS);
  // Pre-quantize probabilities so the sliding-window inner loop doesn't
  // re-multiply every call.
  const bucket = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const v = results[i].probability;
    const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor(v * BUCKETS)));
    bucket[i] = b;
  }
  const half = Math.floor(win / 2);
  let winSize = 0;
  let wLo = 0;
  let wHi = -1; // empty window

  for (let i = 0; i < n; i++) {
    const targetLo = Math.max(0, i - half);
    const targetHi = Math.min(n - 1, i + half);
    // Extend right edge: add frames one at a time until wHi matches.
    while (wHi < targetHi) {
      wHi++;
      hist[bucket[wHi]]++;
      winSize++;
    }
    // Contract left edge: remove frames until wLo matches.
    while (wLo < targetLo) {
      hist[bucket[wLo]]--;
      winSize--;
      wLo++;
    }
    // Median of the current window, reconstructed as bucket midpoint.
    // For an even window size this returns the upper-median bucket — fine
    // for thresholding, where exact median isn't load-bearing.
    let median = 0;
    if (winSize > 0) {
      const target = winSize >> 1;
      let running = 0;
      for (let b = 0; b < BUCKETS; b++) {
        running += hist[b];
        if (running > target) {
          median = (b + 0.5) / BUCKETS;
          break;
        }
      }
    }
    out[i] = Math.max(absFloor, median + delta);
  }
}

/**
 * T1 peak-picker. Pure function — no React state, safe to call from tests
 * or any other context. Replaces the legacy absolute-threshold picker.
 *
 * Pipeline:
 *   1) Adaptive floor = max(absFloor, rollingMedian(p) + adaptiveDelta).
 *   2) Candidates = frames where prob >= floor AND prob is the strict max
 *      within ±2 frames.
 *   3) (Optional) Collapse candidates by `snapFrameToCell`: when snap-to-
 *      grid is active, multiple candidates that fall in the same grid cell
 *      merge into one (highest-salience winner) BEFORE the density budget.
 *      This is §12.4 of the rewrite plan — doing it after would burn
 *      density-budget slots on picks that visually collapse.
 *   4) Density budget: per 1-sec window, pick up to `round(targetPerSec)`
 *      candidates by descending salience, enforcing a BPM-aware min-gap
 *      (`60000 / (bpm * 8)` ms → 16th-note period at the current tempo).
 *
 * Exported for src/__tests__/useOnsetDetection.test.ts.
 */
export function peakPickT1(
  results: OnsetResult[],
  absFloor: number,
  adaptiveDelta: number,
  targetPerSec: number,
  bpmAtTime: (t: number) => number,
  snapFrameToCell?: (frame: number) => string | null,
): OnsetResult[] {
  const n = results.length;
  if (n === 0) return [];

  // Step 1: adaptive floor.
  const floor = new Float32Array(n);
  computeRollingMedianFloor(results, ADAPTIVE_WIN, absFloor, adaptiveDelta, floor);

  // Step 2: local-maximum candidates above the adaptive floor.
  let candidates: { idx: number; prob: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = results[i].probability;
    if (p < floor[i]) continue;
    const lo = Math.max(0, i - PRE_MAX);
    const hi = Math.min(n - 1, i + POST_MAX);
    let isMax = true;
    for (let j = lo; j <= hi; j++) {
      if (j !== i && results[j].probability > p) {
        isMax = false;
        break;
      }
    }
    if (isMax) candidates.push({ idx: i, prob: p });
  }

  // Step 3 (optional): snap-to-grid pre-reduction.
  if (snapFrameToCell) {
    const byCell = new Map<string, { idx: number; prob: number }>();
    for (const c of candidates) {
      const cell = snapFrameToCell(c.idx);
      if (cell === null) continue;
      const existing = byCell.get(cell);
      if (!existing || c.prob > existing.prob) byCell.set(cell, c);
    }
    candidates = [...byCell.values()].sort((a, b) => a.idx - b.idx);
  }

  // Step 4: density-budgeted top-K per 1-sec window.
  const targetK = Math.max(1, Math.round(targetPerSec));
  const picks: OnsetResult[] = [];
  let lastPickFrame = -Infinity;

  for (let wStart = 0; wStart < n; wStart += DENSITY_WIN) {
    const wEnd = Math.min(wStart + DENSITY_WIN, n);
    // Single small sort per window — typical in-window candidate count is < 20
    // even on dense songs, so this is O(C log C) with C≈20 per window.
    const inWindow = candidates
      .filter((c) => c.idx >= wStart && c.idx < wEnd)
      .sort((a, b) => b.prob - a.prob);
    const chosen: { idx: number; prob: number }[] = [];
    for (const c of inWindow) {
      const tSec = c.idx / 100;
      const bpm = Math.max(1, bpmAtTime(tSec));
      // 16th-note period at `bpm`, expressed in 10-ms frames; floor at 2 so
      // we never produce picks faster than ~50 ms apart.
      const minGapFrames = Math.max(2, Math.round(60000 / (bpm * 8) / 10));
      if (c.idx - lastPickFrame < minGapFrames) continue;
      if (chosen.some((x) => Math.abs(x.idx - c.idx) < minGapFrames)) continue;
      chosen.push(c);
      if (chosen.length >= targetK) break;
    }
    // Emit in frame order so downstream code can binary-search by beat.
    chosen.sort((a, b) => a.idx - b.idx);
    for (const c of chosen) {
      picks.push(results[c.idx]);
      lastPickFrame = c.idx;
    }
  }

  return picks;
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * Shared hook that runs ML onset detection and applies threshold filtering.
 *
 * Split into two effects:
 *   Effect A (heavy): Detects onsets via Rust when music file changes.
 *   Effect B (instant): Applies threshold + peak-picking + beat conversion
 *                        when sensitivity/cache changes. <1ms.
 */
export function useOnsetDetection(): void {
  const onsetEnabled = useSettingsStore((s) => s.onsetDetectionEnabled);
  const onsetSnapToGrid = useSettingsStore((s) => s.onsetSnapToGrid);
  // Phase A: four new settings drive the peak-picker. `onsetSensitivity` is
  // no longer read anywhere — deprecated, kept in settingsStore for one
  // release for schema-compat with existing settings.json files.
  const onsetTargetDensity = useSettingsStore((s) => s.onsetTargetDensity);
  const onsetAbsFloor = useSettingsStore((s) => s.onsetAbsFloor);
  const onsetAdaptiveDelta = useSettingsStore((s) => s.onsetAdaptiveDelta);
  const onsetMinDisplayStrength = useSettingsStore((s) => s.onsetMinDisplayStrength);
  // Phase B: subscribe to the per-chart override so moving the density
  // slider (which writes chart.onset_target_density via updateChartField)
  // triggers a peak-picker re-run.
  const chartOnsetTargetDensity = useChartStore((s) => s.chart.onset_target_density);
  const musicLoaded = useAudioStore((s) => s.musicLoaded);

  // Local state to bridge Effect A → Effect B. When detection completes,
  // cacheVersion bumps, triggering Effect B to re-apply the threshold.
  const [cacheVersion, setCacheVersion] = useState(_cacheVersion);

  // ── Effect A: Heavy detection (only when music changes) ────────
  useEffect(() => {
    if (!onsetEnabled || !musicLoaded || !isTauri()) {
      if (!onsetEnabled) {
        useEditorStore.getState().setOnsetMarkers(null);
      }
      return;
    }

    // Small debounce to handle musicLoaded false→true restore cycles
    const timer = setTimeout(async () => {
      if (!useAudioStore.getState().musicLoaded) return;

      const cs = useChartStore.getState();

      // ── Resolve music file path + cache key ──
      let absoluteMusicPath: string | null = null;
      let cacheKey: string | null = null;

      if (cs.musicPath) {
        // Disk project — musicPath is already absolute, stable across calls.
        absoluteMusicPath = cs.musicPath;
        cacheKey = cs.musicPath;
      } else {
        // Imported chart — audio is a blob URL with no disk file.
        // Use the blob URL as cache key (stable), and reuse the temp
        // file if the blob URL hasn't changed.
        const musicUrl = audioEngine.getCurrentUrl();
        if (musicUrl) {
          cacheKey = musicUrl; // blob URL is stable across view switches
          if (_cachedMusicKey === cacheKey && _cachedTempPath) {
            // Cache hit — reuse existing temp file
            absoluteMusicPath = _cachedTempPath;
          } else {
            // Cache miss — write new temp file
            try {
              const response = await fetch(musicUrl);
              const audioBytes = new Uint8Array(await response.arrayBuffer());
              const { getAudioFormat } = await import("../utils/chartSessions");
              const ext = getAudioFormat() ?? "mp3";
              absoluteMusicPath = await writeTempAudio(audioBytes, ext);
              _cachedTempPath = absoluteMusicPath;
            } catch (err) {
              console.warn("Failed to write temp audio for onset detection:", err);
            }
          }
        }
      }

      if (!absoluteMusicPath || !cacheKey) return;

      // ── Check module-level cache ──
      if (_cachedMusicKey === cacheKey && _cachedResults !== null) {
        // Cache hit — CNN results already available. Just bump version
        // so Effect B re-applies the threshold (in case markers were
        // cleared by session restore).
        setCacheVersion(++_cacheVersion);
        return;
      }

      // ── Cache miss — invoke Rust CNN pipeline ──
      useEditorStore.getState().setOnsetAnalyzing(true);
      try {
        const bundle = await detectOnsetsMl(absoluteMusicPath);
        // Verify the Rust pipeline version matches what the frontend expects.
        // A mismatch means the user is running skewed binary/frontend builds
        // (typical after a partial upgrade); we discard the results so no
        // wrong-shape data pollutes the salience cache.
        if (bundle.version !== EXPECTED_ONSET_PIPELINE_VERSION) {
          console.warn(
            `Onset pipeline version mismatch: backend=${bundle.version}, ` +
            `frontend=${EXPECTED_ONSET_PIPELINE_VERSION}. Clearing cache and ignoring.`,
          );
          _cachedResults = null;
          _cachedMusicKey = null;
          useEditorStore.getState().setOnsetMarkers(null);
          useEditorStore.getState().setOnsetAnalyzing(false);
          return;
        }
        _cachedResults = bundle.frames;
        _cachedMusicKey = cacheKey;
        _cacheVersion++;
        setCacheVersion(_cacheVersion);
      } catch (err) {
        console.warn("ML onset detection failed:", err);
        useEditorStore.getState().setOnsetAnalyzing(false);
      }
    }, 150);

    return () => clearTimeout(timer);
    // Only re-run when music actually loads or onset toggle changes.
    // Sensitivity/snapToGrid are handled by Effect B (instant).
  }, [onsetEnabled, musicLoaded]);

  // ── Effect B: Instant peak-picking + beat conversion ──
  const applyThreshold = useCallback(() => {
    if (!onsetEnabled || !_cachedResults || _cachedResults.length === 0) {
      useEditorStore.getState().setOnsetMarkers(null);
      useEditorStore.getState().setOnsetAnalyzing(false);
      return;
    }

    const cs = useChartStore.getState();
    const bl = new BpmList(cs.chart.bpm_list);
    const density = useEditorStore.getState().density;

    // Per-chart density override (Phase B): if the chart has explicitly set
    // `onset_target_density`, that wins; otherwise fall back to the global
    // settingsStore default (`onsetTargetDensity`). Both are numbers in the
    // same [0.5, 8.0] range. `chartOnsetTargetDensity` is a closed-over
    // subscription — included in the useCallback deps so moving the slider
    // re-runs the picker.
    const effectiveTargetDensity =
      chartOnsetTargetDensity ?? onsetTargetDensity;

    // If snap-to-grid is on, prepare a frame-to-cell-key function that
    // peakPickT1 uses BEFORE its density budget so we don't spend two
    // budget slots on events that collapse to the same grid cell.
    // §12.4 of the rewrite plan.
    const snapFrameToCell = onsetSnapToGrid
      ? (frame: number) => {
          const tSec = frame / 100; // 100 fps → seconds
          const beat = bl.beatAtFloat(tSec - cs.chart.offset);
          const snapped = beatToFloat(snapBeat(beat, density));
          // Quantize to 4 decimal places so floating jitter doesn't
          // produce spurious distinct keys.
          return String(Math.round(snapped * 10000));
        }
      : undefined;

    // Peak-picking: adaptive-floor + local-max + density-budgeted top-K.
    // Silent-region suppression is handled by the Rust backend's RMS gate
    // (onset_ml.rs:689-709), not by the picker.
    const peaks = peakPickT1(
      _cachedResults,
      onsetAbsFloor,
      onsetAdaptiveDelta,
      effectiveTargetDensity,
      (t) => bl.bpmAtTime(t),
      snapFrameToCell,
    );

    // Convert picks (frame-indexed, audio-time seconds) to chart-beat markers.
    // When snap is on, we use the snapped beat so markers land exactly on the
    // grid; otherwise we keep the raw-time beat position.
    let beatMarkers = peaks.map((r) => {
      const rawBeat = bl.beatAtFloat(r.time - cs.chart.offset);
      const beat = onsetSnapToGrid
        ? beatToFloat(snapBeat(rawBeat, density))
        : rawBeat;
      return { beat, strength: r.probability };
    });

    // Apply the visual min-strength filter. Runs after selection so the
    // density budget decides WHICH events win; this filter just hides weak
    // markers without re-running the picker. Defaults to 0 (no filtering).
    if (onsetMinDisplayStrength > 0) {
      beatMarkers = beatMarkers.filter(
        (bm) => bm.strength >= onsetMinDisplayStrength,
      );
    }

    // Sort by beat for binary search in renderer.
    beatMarkers.sort((a, b) => a.beat - b.beat);

    useEditorStore.getState().setOnsetMarkers(beatMarkers);
    useEditorStore.getState().setOnsetAnalyzing(false);
  }, [
    onsetEnabled,
    onsetSnapToGrid,
    onsetTargetDensity,
    chartOnsetTargetDensity,
    onsetAbsFloor,
    onsetAdaptiveDelta,
    onsetMinDisplayStrength,
  ]);

  useEffect(() => {
    applyThreshold();
  }, [applyThreshold, cacheVersion]);
}

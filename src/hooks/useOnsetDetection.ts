// ============================================================
// useOnsetDetection — ML onset detection hook
//
// Runs CNN-based onset analysis via the Rust backend whenever
// audio is loaded and onset detection is enabled. Called from
// App.tsx so it's active regardless of which editor view
// (unified/classic/unrolled) is mounted.
//
// Recent change (bug audit #7): Removed leftover DEBUG
// `console.warn` from Effect A that fired on every onsetEnabled /
// musicLoaded change. It was from a "ghost song" debug session
// and cluttered the console during normal editing.
// ============================================================

import { useEffect, useCallback, useState } from "react";
import { useEditorStore } from "../stores/editorStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAudioStore } from "../stores/audioStore";
import { useChartStore } from "../stores/chartStore";
import { audioEngine } from "../audio/audioEngine";
import { detectOnsetsMl, writeTempAudio, isTauri } from "../utils/ipc";
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

/** Cache key — music path for disk projects, blob URL for imports. */
let _cachedMusicKey: string | null = null;

/** For imported charts: reuse the same temp file path if blob URL hasn't changed. */
let _cachedTempPath: string | null = null;

/** Monotonically increasing version counter — bumped when _cachedResults changes.
 *  Effect B watches this to know when to re-apply the threshold. */
let _cacheVersion = 0;

// ── Peak-picking parameters ─────────────────────────────────────
// Absolute threshold + local-max + combine. No adaptive threshold —
// adaptive thresholding (prob >= localMean + delta) causes empty gaps
// in sections with sustained CNN activation because localMean + delta
// exceeds the max possible probability. Tested against 5 synthetic
// CNN output patterns: clean sparse, dense busy, sustained noise,
// quiet→loud transitions, and very-dense onsets.

/** Frames to look back/ahead for local-maximum check. ±2 frames = ±20ms.
 *  A peak must be the highest probability in a 50ms window. */
const PRE_MAX = 2;
const POST_MAX = 2;

/** Minimum frames between consecutive detected onsets. 5 frames = 50ms.
 *  Prevents double-triggers and limits max rate to 20 onsets/sec. */
const COMBINE = 5;

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
  const onsetSensitivity = useSettingsStore((s) => s.onsetSensitivity);
  const onsetSnapToGrid = useSettingsStore((s) => s.onsetSnapToGrid);
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
        const results = await detectOnsetsMl(absoluteMusicPath);
        _cachedResults = results;
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

  // ── Effect B: Instant threshold + peak-picking + beat conversion ──
  const applyThreshold = useCallback(() => {
    if (!onsetEnabled || !_cachedResults || _cachedResults.length === 0) {
      useEditorStore.getState().setOnsetMarkers(null);
      useEditorStore.getState().setOnsetAnalyzing(false);
      return;
    }

    const cs = useChartStore.getState();

    // ── Step 1+2: Peak-picking (absolute threshold + local max + combine) ──
    //
    // Sensitivity mapping (absolute probability threshold):
    //   sensitivity=0   → threshold 0.65 (strict, only strong CNN spikes)
    //   sensitivity=0.3 → threshold 0.50 (default, matches madmom's exact default)
    //   sensitivity=1   → threshold 0.15 (permissive, catches soft onsets)
    //
    // This approach NEVER produces empty gaps — if the CNN reports high
    // activation, peaks will be detected. The local-max filter (±20ms)
    // ensures only the strongest frame per cluster passes, and the
    // combine filter (50ms) prevents double-triggers.
    // Silent regions are handled by the Rust backend's RMS energy gate
    // (step 5.5 in onset_ml.rs), not by the threshold here.
    const threshold = 0.65 - onsetSensitivity * 0.50;
    const results = _cachedResults;
    const n = results.length;
    const peaks: OnsetResult[] = [];
    let lastPeakIdx = -COMBINE - 1; // Allow first peak unconditionally

    for (let i = 0; i < n; i++) {
      const prob = results[i].probability;

      // 1. Absolute threshold gate
      if (prob < threshold) continue;

      // 2. Local maximum check: must be >= all neighbors in [i-PRE_MAX, i+POST_MAX]
      let isMax = true;
      const maxStart = Math.max(0, i - PRE_MAX);
      const maxEnd = Math.min(n - 1, i + POST_MAX);
      for (let j = maxStart; j <= maxEnd; j++) {
        if (j !== i && results[j].probability > prob) {
          isMax = false;
          break;
        }
      }
      if (!isMax) continue;

      // 3. Combine: enforce minimum inter-onset interval (50ms)
      if (i - lastPeakIdx < COMBINE) continue;

      peaks.push(results[i]);
      lastPeakIdx = i;
    }

    // ── Step 3: Convert time → beat ──
    const bl = new BpmList(cs.chart.bpm_list);
    const density = useEditorStore.getState().density;
    let beatMarkers = peaks.map((r) => ({
      beat: bl.beatAtFloat(r.time - cs.chart.offset),
      strength: r.probability,
    }));

    // ── Step 4: Optionally snap to beat grid ──
    if (onsetSnapToGrid) {
      const byBeat = new Map<number, { beat: number; strength: number }>();
      for (const bm of beatMarkers) {
        const snapped = beatToFloat(snapBeat(bm.beat, density));
        const key = Math.round(snapped * 10000);
        const existing = byBeat.get(key);
        if (!existing || bm.strength > existing.strength) {
          byBeat.set(key, { beat: snapped, strength: bm.strength });
        }
      }
      beatMarkers = [...byBeat.values()];
    }

    // Sort by beat for binary search in renderer
    beatMarkers.sort((a, b) => a.beat - b.beat);

    useEditorStore.getState().setOnsetMarkers(beatMarkers);
    useEditorStore.getState().setOnsetAnalyzing(false);
  }, [onsetEnabled, onsetSensitivity, onsetSnapToGrid]);

  useEffect(() => {
    applyThreshold();
  }, [applyThreshold, cacheVersion]);
}

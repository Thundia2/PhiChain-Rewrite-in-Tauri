// ============================================================
// useOnsetDetection — Shared onset detection hook
//
// Runs onset analysis whenever audio is loaded and onset
// detection is enabled. Called from App.tsx so it's active
// regardless of which editor view (unified/classic/unrolled)
// is mounted.
//
// Recent change: Extracted from Timeline.tsx to fix onset
// markers not appearing in unified/unrolled editor views.
// ============================================================

import { useEffect } from "react";
import { useEditorStore } from "../stores/editorStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAudioStore } from "../stores/audioStore";
import { useChartStore } from "../stores/chartStore";
import { audioEngine } from "../audio/audioEngine";
import { detectOnsets } from "../utils/onsetDetector";
import { BpmList } from "../utils/bpmList";
import { beatToFloat } from "../types/chart";
import { snapBeat } from "../utils/beat";

/**
 * Shared hook that triggers onset detection analysis.
 *
 * Subscribes to onset settings and audio state. When onset
 * detection is enabled and audio is loaded, runs the spectral
 * flux algorithm and writes beat-mapped markers to editorStore.
 *
 * The two-layer cache in onsetDetector.ts makes sensitivity
 * slider changes instant (<5ms) — only the cheap peak-picking
 * stage re-runs, not the full FFT pipeline.
 */
export function useOnsetDetection(): void {
  // These subscriptions trigger the useEffect when settings change
  const onsetEnabled = useSettingsStore((s) => s.onsetDetectionEnabled);
  const onsetSensitivity = useSettingsStore((s) => s.onsetSensitivity);
  const onsetSnapToGrid = useSettingsStore((s) => s.onsetSnapToGrid);
  const musicLoaded = useAudioStore((s) => s.musicLoaded);

  useEffect(() => {
    if (!onsetEnabled) {
      useEditorStore.getState().setOnsetMarkers(null);
      return;
    }

    // Debounce sensitivity changes (200ms) so the slider doesn't
    // re-run peak picking on every pixel of movement.
    const timer = setTimeout(() => {
      const audioState = useAudioStore.getState();
      if (!audioState.musicLoaded) return;

      const musicUrl = audioEngine.getCurrentUrl();
      if (!musicUrl) return;

      const es = useEditorStore.getState();
      es.setOnsetAnalyzing(true);

      detectOnsets(musicUrl, { sensitivity: onsetSensitivity }).then((markers) => {
        // Convert time → beat using BpmList
        const cs = useChartStore.getState();
        const bl = new BpmList(cs.chart.bpm_list);
        const density = useEditorStore.getState().density;
        let beatMarkers = markers.map((m) => ({
          beat: bl.beatAtFloat(m.time - cs.chart.offset),
          strength: m.strength,
        }));

        // Optionally snap to beat grid
        if (onsetSnapToGrid) {
          const byBeat = new Map<number, { beat: number; strength: number }>();
          for (const bm of beatMarkers) {
            const snapped = beatToFloat(snapBeat(bm.beat, density));
            const key = Math.round(snapped * 10000); // Quantize to avoid float issues
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
      }).catch(() => {
        useEditorStore.getState().setOnsetAnalyzing(false);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [onsetEnabled, onsetSensitivity, onsetSnapToGrid, musicLoaded]);
}

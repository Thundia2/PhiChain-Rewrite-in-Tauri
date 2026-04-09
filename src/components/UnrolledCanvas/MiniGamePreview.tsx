// ============================================================
// Mini Game Preview — Small inset game preview canvas
//
// Rendered as an absolute-positioned overlay in the top-right
// corner of the UnrolledCanvas. Uses a second GameRenderer
// instance at low resolution (160×120) to show the selected
// line in its actual game-space position/rotation with notes
// falling toward the line.
//
// Read-only — no mouse interaction. Toggleable via the
// showMiniPreview state in editorStore (G key in unrolled mode).
//
// Recent change: Created as part of the Unrolled Editor feature.
// ============================================================

import { useRef, useEffect, useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GameRenderer } from "../../canvas/gameRenderer";
import { BpmList } from "../../utils/bpmList";

// ============================================================
// Configurable dimensions for the mini preview
// ============================================================
const MINI_WIDTH = 160;
const MINI_HEIGHT = 120;

export function MiniGamePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const rafRef = useRef<number>(0);

  const chart = useChartStore((s) => s.chart);
  const isLoaded = useChartStore((s) => s.isLoaded);
  const bpmList = useMemo(() => new BpmList(chart.bpm_list), [chart.bpm_list]);
  const bpmListRef = useRef(bpmList);
  useEffect(() => { bpmListRef.current = bpmList; }, [bpmList]);

  // ---- Initialize renderer + animation loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution (no DPR scaling — it's a small preview)
    canvas.width = MINI_WIDTH;
    canvas.height = MINI_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rendererRef.current = new GameRenderer(ctx);

    const animate = () => {
      const renderer = rendererRef.current;
      if (!renderer) { rafRef.current = requestAnimationFrame(animate); return; }

      const cs = useChartStore.getState();
      const es = useEditorStore.getState();
      const as_ = useAudioStore.getState();
      const ss = useSettingsStore.getState();

      if (!cs.isLoaded) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const bl = bpmListRef.current;
      const currentTime = as_.currentTime;

      // Audio latency compensation for game preview visuals
      const effectiveOffset = cs.chart.offset + ss.audioLatencyMs / 1000;

      renderer.render(
        cs.chart.lines,
        bl,
        currentTime,
        effectiveOffset,
        MINI_WIDTH,
        MINI_HEIGHT,
        {
          noteSize: ss.noteSize,
          backgroundDim: ss.backgroundDim,
          illustrationImage: cs.illustrationImage,
          selectedLineIndex: es.selectedLineIndex,
          selectedNoteIndices: es.selectedNoteIndices,
          showFcApIndicator: false,
          isFcValid: false,
          multiHighlight: false,
          anchorMarkerVisibility: "never",
          showHud: false,
          hideNotes: false,
        },
      );

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isLoaded]);

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: MINI_WIDTH,
        height: MINI_HEIGHT,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.12)",
        overflow: "hidden",
        // Subtle glass-like background
        background: "rgba(14, 22, 41, 0.7)",
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        pointerEvents: "none", // read-only — clicks pass through
        zIndex: 10,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: MINI_WIDTH,
          height: MINI_HEIGHT,
          display: "block",
        }}
      />
      {/* Label at the bottom */}
      <span
        style={{
          position: "absolute",
          bottom: 2,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 8,
          color: "rgba(255,255,255,0.3)",
          fontFamily: "monospace",
          pointerEvents: "none",
        }}
      >
        Game preview
      </span>
    </div>
  );
}

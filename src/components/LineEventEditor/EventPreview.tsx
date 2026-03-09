// ============================================================
// Event Preview — Dedicated game preview for the event editor
//
// Shows only the target line by default. Toggleable to show
// all lines and/or notes for context.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GameRenderer } from "../../canvas/gameRenderer";
import { BpmList } from "../../utils/bpmList";

interface EventPreviewProps {
  lineIndex: number;
}

export function EventPreview({ lineIndex }: EventPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const bpmListRef = useRef<BpmList | null>(null);
  const bpmListDataRef = useRef<unknown>(null);

  // ---- Canvas sizing ----
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  // ---- Initialize renderer ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rendererRef.current = new GameRenderer(ctx);
    resizeCanvas();

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container) {
      observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [resizeCanvas]);

  // ---- Render loop ----
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    function frame() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !renderer) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const cs = useChartStore.getState();
      const { currentTime } = useAudioStore.getState();
      const es = useEditorStore.getState();
      const ss = useSettingsStore.getState();

      // Rebuild BpmList if changed
      if (bpmListDataRef.current !== cs.chart.bpm_list) {
        bpmListDataRef.current = cs.chart.bpm_list;
        bpmListRef.current = new BpmList(cs.chart.bpm_list);
      }
      const bpmList = bpmListRef.current!;

      // Determine which lines to render
      const showAllLines = es.eventEditorShowAllLines;
      const showNotes = es.eventEditorShowNotes;
      const lines = showAllLines ? cs.chart.lines : [cs.chart.lines[lineIndex]].filter(Boolean);

      renderer.render(
        lines,
        bpmList,
        currentTime,
        cs.chart.offset,
        rect.width,
        rect.height,
        {
          noteSize: ss.noteSize,
          backgroundDim: 0.8,
          illustrationImage: cs.illustrationImage,
          hideNotes: !showNotes,
          anchorMarkerVisibility: "always",
          highlightLineIndex: showAllLines ? lineIndex : null,
        },
      );

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lineIndex]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: "#000" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

// ============================================================
// Keyframe Strip — Horizontal beat-axis strip
//
// Shows event keyframes as colored diamonds along a beat axis.
// Users click/drag to scrub the event editor beat position.
// Scroll to pan, ctrl+scroll to zoom.
// ============================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../types/chart";
import type { LineEvent, LineEventKind } from "../../types/chart";

// Event colors matching the timeline
const EVENT_COLORS: Record<LineEventKind, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
};

interface KeyframeStripProps {
  lineIndex: number;
}

export function KeyframeStrip({ lineIndex }: KeyframeStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Viewport state: [startBeat, beatsPerScreen]
  const [viewStart, setViewStart] = useState(0);
  const [viewRange, setViewRange] = useState(16);

  const isDragging = useRef(false);

  const beatToPixel = useCallback((beat: number, canvasWidth: number) => {
    return ((beat - viewStart) / viewRange) * canvasWidth;
  }, [viewStart, viewRange]);

  const pixelToBeat = useCallback((px: number, canvasWidth: number) => {
    return viewStart + (px / canvasWidth) * viewRange;
  }, [viewStart, viewRange]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderFrame = () => {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      const cs = useChartStore.getState();
      const es = useEditorStore.getState();
      const line = cs.chart.lines[lineIndex];
      if (!line) {
        rafRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const { width, height } = canvas;

      // ---- Clear ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, width, height);

      // ---- Beat grid lines ----
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      const startBeatFloor = Math.floor(viewStart);
      const endBeatCeil = Math.ceil(viewStart + viewRange);
      for (let b = startBeatFloor; b <= endBeatCeil; b++) {
        const px = beatToPixel(b, width);
        if (px < 0 || px > width) continue;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();

        // Beat number label
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(b), px, height - 3);
      }

      // ---- Event keyframe diamonds ----
      const diamondSize = 5;
      const kinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];
      const laneHeight = (height - 14) / kinds.length; // Leave room for labels

      for (let ki = 0; ki < kinds.length; ki++) {
        const kind = kinds[ki];
        const cy = 4 + laneHeight * (ki + 0.5);

        // Kind label
        ctx.fillStyle = EVENT_COLORS[kind];
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(kind.charAt(0).toUpperCase(), 3, cy + 3);

        // Draw keyframes
        const events = line.events.filter((e) => e.kind === kind);
        for (const event of events) {
          const startBeat = beatToFloat(event.start_beat);
          const endBeat = beatToFloat(event.end_beat);
          const startPx = beatToPixel(startBeat, width);
          const endPx = beatToPixel(endBeat, width);

          // Don't draw if completely off screen
          if (endPx < 0 || startPx > width) continue;

          // Draw event span bar
          const isTransition = "transition" in event.value;
          ctx.fillStyle = isTransition
            ? EVENT_COLORS[kind] + "30"
            : EVENT_COLORS[kind] + "18";
          const barStart = Math.max(startPx, 0);
          const barEnd = Math.min(endPx, width);
          ctx.fillRect(barStart, cy - laneHeight * 0.35, barEnd - barStart, laneHeight * 0.7);

          // Draw start diamond
          if (startPx >= -5 && startPx <= width + 5) {
            ctx.fillStyle = EVENT_COLORS[kind];
            ctx.beginPath();
            ctx.moveTo(startPx, cy - diamondSize);
            ctx.lineTo(startPx + diamondSize, cy);
            ctx.lineTo(startPx, cy + diamondSize);
            ctx.lineTo(startPx - diamondSize, cy);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // ---- Playhead ----
      const currentBeat = es.eventEditorCurrentBeat;
      const playheadPx = beatToPixel(currentBeat, width);

      if (playheadPx >= 0 && playheadPx <= width) {
        ctx.strokeStyle = "#ff5555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadPx, 0);
        ctx.lineTo(playheadPx, height);
        ctx.stroke();

        // Playhead triangle
        ctx.fillStyle = "#ff5555";
        ctx.beginPath();
        ctx.moveTo(playheadPx - 5, 0);
        ctx.lineTo(playheadPx + 5, 0);
        ctx.lineTo(playheadPx, 6);
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lineIndex, viewStart, viewRange, beatToPixel]);

  // Click to set beat position
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const beat = pixelToBeat(mouseX, canvas.width);
    useEditorStore.getState().setEventEditorBeat(Math.max(0, beat));

    // Also seek audio to this beat
    const cs = useChartStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const time = bpmList.timeAt(beat) + cs.chart.offset;
    useAudioStore.getState().seek(time);

    isDragging.current = true;
  }, [pixelToBeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const beat = pixelToBeat(mouseX, canvas.width);
    useEditorStore.getState().setEventEditorBeat(Math.max(0, beat));

    const cs = useChartStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const time = bpmList.timeAt(beat) + cs.chart.offset;
    useAudioStore.getState().seek(time);
  }, [pixelToBeat]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Scroll to pan, ctrl+scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      setViewRange((prev) => Math.max(2, Math.min(200, prev * factor)));
    } else {
      // Pan
      const delta = (e.deltaY / 100) * (viewRange / 8);
      setViewStart((prev) => Math.max(-2, prev + delta));
    }
  }, [viewRange]);

  // Global mouse up
  useEffect(() => {
    const handler = () => { isDragging.current = false; };
    window.addEventListener("mouseup", handler);
    return () => window.removeEventListener("mouseup", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full relative"
      style={{ height: "80px", borderTop: "1px solid var(--border-primary)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: "crosshair" }}
      />
    </div>
  );
}

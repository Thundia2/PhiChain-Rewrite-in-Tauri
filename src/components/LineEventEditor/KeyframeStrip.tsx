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
import { EVENT_COLORS } from "./EventEditorToolbar";

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
      const activeLayer = es.eventEditorActiveLayer;
      const allKinds: LineEventKind[] = [
        "x", "y", "rotation", "opacity", "speed",
        "scale_x", "scale_y", "color", "text", "incline",
      ];

      // Determine which events to display based on active layer
      let displayEvents: LineEvent[];
      if (activeLayer >= 0 && line.event_layers && line.event_layers[activeLayer]) {
        // Show events from the selected layer
        const layer = line.event_layers[activeLayer];
        displayEvents = [
          ...layer.move_x_events,
          ...layer.move_y_events,
          ...layer.rotate_events,
          ...layer.alpha_events,
          ...layer.speed_events,
        ];
      } else {
        displayEvents = line.events;
      }

      // Filter to kinds that have events (to avoid empty lanes)
      const activeKinds = allKinds.filter((kind) =>
        displayEvents.some((e) => e.kind === kind)
      );
      // Always show the core 5 kinds
      const coreKinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];
      const kinds = [...new Set([...coreKinds, ...activeKinds])];

      const laneHeight = (height - 14) / kinds.length; // Leave room for labels

      const KIND_SHORT: Record<string, string> = {
        x: "X", y: "Y", rotation: "R", opacity: "O", speed: "S",
        scale_x: "SX", scale_y: "SY", color: "C", text: "T", incline: "I",
      };

      for (let ki = 0; ki < kinds.length; ki++) {
        const kind = kinds[ki];
        const cy = 4 + laneHeight * (ki + 0.5);

        // Kind label
        ctx.fillStyle = EVENT_COLORS[kind] || "#888";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(KIND_SHORT[kind] || kind.charAt(0).toUpperCase(), 3, cy + 3);

        // Draw keyframes
        const events = displayEvents.filter((e) => e.kind === kind);
        for (const event of events) {
          const startBeat = beatToFloat(event.start_beat);
          const endBeat = beatToFloat(event.end_beat);
          const startPx = beatToPixel(startBeat, width);
          const endPx = beatToPixel(endBeat, width);

          // Don't draw if completely off screen
          if (endPx < 0 || startPx > width) continue;

          // Draw event span bar
          const isTransition = "transition" in event.value || "color_transition" in event.value;
          const kindColor = EVENT_COLORS[kind] || "#888";
          ctx.fillStyle = isTransition
            ? kindColor + "30"
            : kindColor + "18";
          const barStart = Math.max(startPx, 0);
          const barEnd = Math.min(endPx, width);
          ctx.fillRect(barStart, cy - laneHeight * 0.35, barEnd - barStart, laneHeight * 0.7);

          // Draw start diamond
          if (startPx >= -5 && startPx <= width + 5) {
            ctx.fillStyle = kindColor;
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

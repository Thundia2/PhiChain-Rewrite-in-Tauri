// ============================================================
// Curve Graph — Visual easing curve editor canvas
//
// Renders easing curves, keyframe diamonds, grid, and playhead.
// Supports: click to select, drag to move keyframes, zoom/pan,
// double-click to create events.
//
// Recent change: Added multi-line overlay support. When timeline
// overlay is enabled, ghost curves from overlayLines are drawn
// behind the main line's curves for cross-line comparison.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat, floatToBeat } from "../../types/chart";
import { renderCurveGraph, type OverlayLine } from "./CurveGraphRenderer";
import {
  type CurveViewport,
  computeAutoRange,
  hitTestKeyframeDiamond,
  xToBeat,
  yToValue,
} from "./curveEditorUtils";

interface CurveGraphProps {
  isPopout?: boolean;
}

export function CurveGraph({ isPopout }: CurveGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const viewportRef = useRef<CurveViewport>({
    beatStart: 0,
    beatEnd: 32,
    valueMin: -100,
    valueMax: 100,
  });

  const height = useEditorStore((s) => isPopout ? 400 : s.curveEditorHeight);
  // Subscribe to trigger re-renders when these values change (used in render loop via getState)
  useEditorStore((s) => s.curveEditorVisibleLanes);
  useEditorStore((s) => s.curveEditorNormalized);
  const hoveredKeyframe = useEditorStore((s) => s.curveEditorHoveredKeyframe);
  useEditorStore((s) => s.selectedEventIndices);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function frame() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const w = rect.width;
      const h = isPopout ? rect.height : useEditorStore.getState().curveEditorHeight;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Get data
      const cs = useChartStore.getState();
      const es = useEditorStore.getState();
      const { currentTime } = useAudioStore.getState();
      const bpmList = new BpmList(cs.chart.bpm_list);
      const currentBeat = bpmList.beatAtFloat(Math.max(0, currentTime - cs.chart.offset));

      const lineIndex = es.selectedLineIndex;
      const line = lineIndex !== null ? cs.chart.lines[lineIndex] : null;
      const events = line ? line.events : [];

      // Auto-range
      const autoRange = computeAutoRange(events, es.curveEditorVisibleLanes);
      const vr = es.curveEditorValueRange ?? autoRange;

      // Sync beat range with the KeyframeBar viewport
      // For now, use a sensible default based on the chart
      let maxBeat = 32;
      for (const e of events) {
        maxBeat = Math.max(maxBeat, beatToFloat(e.end_beat) + 4);
      }

      viewportRef.current = {
        beatStart: Math.max(0, currentBeat - maxBeat * 0.1),
        beatEnd: Math.min(maxBeat, currentBeat + maxBeat * 0.9),
        valueMin: vr.min,
        valueMax: vr.max,
      };

      // If playing, auto-scroll to keep playhead visible
      const vp = viewportRef.current;
      const beatWindow = vp.beatEnd - vp.beatStart;
      if (currentBeat < vp.beatStart || currentBeat > vp.beatEnd) {
        vp.beatStart = Math.max(0, currentBeat - beatWindow * 0.2);
        vp.beatEnd = vp.beatStart + beatWindow;
      }

      // Build overlay lines from the timeline overlay system
      // Reuses the existing timelineOverlayLines state from editorStore
      const overlayData: OverlayLine[] = [];
      if (es.timelineOverlayEnabled && es.timelineOverlayLines.length > 0) {
        const OVERLAY_COLORS = ["#ff6b6b", "#51cf66", "#ffd43b", "#cc5de8", "#4dabf7", "#38d9a9", "#ffa94d", "#748ffc"];
        for (let oi = 0; oi < es.timelineOverlayLines.length; oi++) {
          const overlayIdx = es.timelineOverlayLines[oi];
          // Don't overlay the currently selected line on itself
          if (overlayIdx === lineIndex) continue;
          const overlayLine = cs.chart.lines[overlayIdx];
          if (overlayLine) {
            overlayData.push({
              events: overlayLine.events,
              color: OVERLAY_COLORS[oi % OVERLAY_COLORS.length],
              label: overlayLine.name,
            });
          }
        }
      }

      renderCurveGraph(ctx, {
        events,
        visibleLanes: es.curveEditorVisibleLanes,
        viewport: vp,
        canvasWidth: w,
        canvasHeight: h,
        currentBeat,
        selectedEventIndices: es.selectedEventIndices,
        hoveredKeyframe: es.curveEditorHoveredKeyframe,
        normalized: es.curveEditorNormalized,
        overlayLines: overlayData.length > 0 ? overlayData : undefined,
        overlayOpacity: es.timelineOverlayOpacity,
      });

      ctx.restore();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPopout]);

  // Mouse interactions
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const lineIndex = es.selectedLineIndex;
    const line = lineIndex !== null ? cs.chart.lines[lineIndex] : null;
    if (!line) return;

    const dragState = es.curveEditorDragState;
    if (dragState) {
      // Dragging a keyframe
      const vp = viewportRef.current;
      const h = isPopout ? 400 : es.curveEditorHeight;
      const newValue = yToValue(mouseY, vp, h);

      const event = line.events[dragState.eventIndex];
      if (!event) return;

      if ("constant" in event.value) {
        cs.editEvent(lineIndex!, dragState.eventIndex, {
          value: { constant: newValue },
        });
      } else if ("transition" in event.value) {
        const tv = event.value.transition;
        if (dragState.handle === "start") {
          cs.editEvent(lineIndex!, dragState.eventIndex, {
            value: { transition: { start: newValue, end: tv.end, easing: tv.easing } },
          });
        } else {
          cs.editEvent(lineIndex!, dragState.eventIndex, {
            value: { transition: { start: tv.start, end: newValue, easing: tv.easing } },
          });
        }
      }
      return;
    }

    // Hover detection
    const h = isPopout ? 400 : es.curveEditorHeight;
    const w = rect.width;
    const hit = hitTestKeyframeDiamond(
      mouseX, mouseY, line.events, es.curveEditorVisibleLanes,
      viewportRef.current, w, h,
    );
    es.setCurveEditorHoveredKeyframe(hit);
  }, [isPopout]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const lineIndex = es.selectedLineIndex;
    const line = lineIndex !== null ? cs.chart.lines[lineIndex] : null;
    if (!line) return;

    const h = isPopout ? 400 : es.curveEditorHeight;
    const w = rect.width;

    const hit = hitTestKeyframeDiamond(
      mouseX, mouseY, line.events, es.curveEditorVisibleLanes,
      viewportRef.current, w, h,
    );

    if (hit) {
      // Select the event
      es.setEventSelection([hit.eventIndex]);

      // Start drag
      const event = line.events[hit.eventIndex];
      let startValue = 0;
      if ("constant" in event.value) startValue = event.value.constant;
      else if ("transition" in event.value) {
        startValue = hit.handle === "start" ? event.value.transition.start : event.value.transition.end;
      }

      es.setCurveEditorDragState({
        eventIndex: hit.eventIndex,
        kind: hit.kind,
        handle: hit.handle,
        startMouseX: mouseX,
        startMouseY: mouseY,
        startBeat: beatToFloat(hit.handle === "start" ? event.start_beat : event.end_beat),
        startValue,
      });
    }
  }, [isPopout]);

  const handleMouseUp = useCallback(() => {
    useEditorStore.getState().setCurveEditorDragState(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const lineIndex = es.selectedLineIndex;
    if (lineIndex === null) return;

    const h = isPopout ? 400 : es.curveEditorHeight;
    const w = rect.width;
    const vp = viewportRef.current;

    const beat = xToBeat(mouseX, vp, w);
    const value = yToValue(mouseY, vp, h);

    // Create a constant event at the clicked position for the first visible lane
    const activeLane = es.curveEditorVisibleLanes[0] || "x";
    cs.addEvent(lineIndex, {
      kind: activeLane,
      start_beat: floatToBeat(beat),
      end_beat: floatToBeat(beat + 1),
      value: { constant: value },
    });
  }, [isPopout]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;

    if (e.ctrlKey || e.metaKey) {
      // Zoom X (beat axis)
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const beatCenter = (vp.beatStart + vp.beatEnd) / 2;
      const halfRange = ((vp.beatEnd - vp.beatStart) / 2) * factor;
      vp.beatStart = Math.max(0, beatCenter - halfRange);
      vp.beatEnd = beatCenter + halfRange;
    } else {
      // Zoom Y (value axis)
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const valueCenter = (vp.valueMin + vp.valueMax) / 2;
      const halfRange = ((vp.valueMax - vp.valueMin) / 2) * factor;
      vp.valueMin = valueCenter - halfRange;
      vp.valueMax = valueCenter + halfRange;
      useEditorStore.getState().setCurveEditorValueRange({ min: vp.valueMin, max: vp.valueMax });
    }
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: isPopout ? "100%" : height,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: hoveredKeyframe ? "grab" : "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
    </div>
  );
}

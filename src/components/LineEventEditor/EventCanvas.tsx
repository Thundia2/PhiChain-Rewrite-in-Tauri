// ============================================================
// Event Canvas — Interactive 2D canvas for line manipulation
//
// Users drag the judgment line to change X/Y position,
// or grab the rotation handle to change the rotation angle.
// Changes create/update events at the current beat.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { EventCanvasRenderer } from "../../canvas/eventCanvasRenderer";
import { evaluateLineEvents } from "../../canvas/events";
import { BpmList } from "../../utils/bpmList";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat, floatToBeat } from "../../types/chart";
import type { LineEvent, LineEventKind, Beat } from "../../types/chart";

interface EventCanvasProps {
  lineIndex: number;
}

/**
 * Find the event of a given kind that is active at the given beat.
 * Returns the event's index in the full events array.
 */
function findActiveEventIndex(
  events: LineEvent[],
  kind: LineEventKind,
  beat: number,
): number {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== kind) continue;
    const start = beatToFloat(e.start_beat);
    const end = beatToFloat(e.end_beat);
    if (beat >= start && beat <= end) return i;
  }
  return -1;
}

/**
 * Commit a drag result by creating or updating events.
 */
function commitValue(lineIndex: number, kind: LineEventKind, newValue: number, currentBeat: number) {
  const cs = useChartStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return;

  const activeIdx = findActiveEventIndex(line.events, kind, currentBeat);

  if (activeIdx >= 0) {
    const event = line.events[activeIdx];
    if ("constant" in event.value) {
      // Update the constant value
      cs.editEvent(lineIndex, activeIdx, { value: { constant: newValue } });
    } else if ("transition" in event.value) {
      // Split the transition event at the current beat
      const splitBeat = floatToBeat(currentBeat);
      const newEvents: LineEvent[] = [
        {
          kind: event.kind,
          start_beat: event.start_beat,
          end_beat: splitBeat,
          value: {
            transition: {
              start: event.value.transition.start,
              end: newValue,
              easing: event.value.transition.easing,
            },
          },
        },
        {
          kind: event.kind,
          start_beat: splitBeat,
          end_beat: event.end_beat,
          value: { constant: newValue },
        },
      ];
      cs.replaceEvent(lineIndex, activeIdx, newEvents);
    }
  } else {
    // No active event — create a new constant event
    const snappedBeat = floatToBeat(currentBeat);
    const farBeat: Beat = [1000, 0, 1];
    cs.addEvent(lineIndex, {
      kind,
      start_beat: snappedBeat,
      end_beat: farBeat,
      value: { constant: newValue },
    });
  }
}

export function EventCanvas({ lineIndex }: EventCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<EventCanvasRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state (local to this component for immediate feedback)
  const dragRef = useRef<{
    type: "translate" | "rotate";
    startMouseX: number;
    startMouseY: number;
    startCanvasX: number;
    startCanvasY: number;
    startRotation: number; // degrees
    currentX: number;
    currentY: number;
    currentRotation: number; // degrees
  } | null>(null);

  // Get current beat from editor store or audio
  const getCurrentBeat = useCallback(() => {
    const { currentTime, isPlaying } = useAudioStore.getState();
    const es = useEditorStore.getState();
    if (isPlaying) {
      const cs = useChartStore.getState();
      const bpmList = new BpmList(cs.chart.bpm_list);
      return bpmList.beatAtFloat(currentTime - cs.chart.offset);
    }
    return es.eventEditorCurrentBeat;
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rendererRef.current = new EventCanvasRenderer(ctx);

    const renderFrame = () => {
      const cs = useChartStore.getState();
      const line = cs.chart.lines[lineIndex];
      if (!line) {
        rafRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // Resize canvas to container
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      const currentBeat = getCurrentBeat();
      const drag = dragRef.current;
      const snapDeg = useSettingsStore.getState().rotationSnapDegrees;

      rendererRef.current!.render({
        line,
        currentBeat,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        dragPreview: drag ? {
          x: drag.currentX,
          y: drag.currentY,
          rotation: drag.currentRotation,
        } : null,
        rotationSnapDegrees: snapDeg,
        isRotationDragging: drag?.type === "rotate",
      });

      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [lineIndex, getCurrentBeat]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cs = useChartStore.getState();
    const line = cs.chart.lines[lineIndex];
    if (!line) return;

    const currentBeat = getCurrentBeat();
    const state = evaluateLineEvents(line.events, currentBeat);

    const screenX = renderer.canvasToScreenX(state.x, canvas.width);
    const screenY = renderer.canvasToScreenY(state.y, canvas.height);

    // Check rotation handle first (smaller target, higher priority)
    if (renderer.hitTestRotationHandle(mouseX, mouseY, screenX, screenY, state.rotation, canvas.width)) {
      const rotDeg = (state.rotation * 180) / Math.PI;
      dragRef.current = {
        type: "rotate",
        startMouseX: mouseX,
        startMouseY: mouseY,
        startCanvasX: state.x,
        startCanvasY: state.y,
        startRotation: rotDeg,
        currentX: state.x,
        currentY: state.y,
        currentRotation: rotDeg,
      };
      return;
    }

    // Check translate handle or line body
    if (
      renderer.hitTestTranslateHandle(mouseX, mouseY, screenX, screenY) ||
      renderer.hitTestLineBody(mouseX, mouseY, screenX, screenY, state.rotation, canvas.width)
    ) {
      dragRef.current = {
        type: "translate",
        startMouseX: mouseX,
        startMouseY: mouseY,
        startCanvasX: state.x,
        startCanvasY: state.y,
        startRotation: (state.rotation * 180) / Math.PI,
        currentX: state.x,
        currentY: state.y,
        currentRotation: (state.rotation * 180) / Math.PI,
      };
      return;
    }
  }, [lineIndex, getCurrentBeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    const drag = dragRef.current;
    if (!canvas || !renderer || !drag) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (drag.type === "translate") {
      // Convert mouse delta to canvas coordinate delta
      const deltaScreenX = mouseX - drag.startMouseX;
      const deltaScreenY = mouseY - drag.startMouseY;
      const deltaCanvasX = (deltaScreenX / canvas.width) * CANVAS_WIDTH;
      const deltaCanvasY = -(deltaScreenY / canvas.height) * CANVAS_HEIGHT;

      drag.currentX = drag.startCanvasX + deltaCanvasX;
      drag.currentY = drag.startCanvasY + deltaCanvasY;
    } else if (drag.type === "rotate") {
      // Compute angle from line center to mouse
      const centerScreenX = renderer.canvasToScreenX(drag.startCanvasX, canvas.width);
      const centerScreenY = renderer.canvasToScreenY(drag.startCanvasY, canvas.height);
      const angle = Math.atan2(mouseY - centerScreenY, mouseX - centerScreenX);
      let angleDeg = (angle * 180) / Math.PI;

      // Apply angle snapping if enabled
      const snapDeg = useSettingsStore.getState().rotationSnapDegrees;
      if (snapDeg > 0) {
        angleDeg = Math.round(angleDeg / snapDeg) * snapDeg;
      }

      drag.currentRotation = angleDeg;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    const currentBeat = getCurrentBeat();

    if (drag.type === "translate") {
      // Commit X and Y if they changed
      if (Math.abs(drag.currentX - drag.startCanvasX) > 0.5) {
        commitValue(lineIndex, "x", Math.round(drag.currentX * 10) / 10, currentBeat);
      }
      // Re-fetch state after X commit to avoid stale data
      if (Math.abs(drag.currentY - drag.startCanvasY) > 0.5) {
        commitValue(lineIndex, "y", Math.round(drag.currentY * 10) / 10, currentBeat);
      }
    } else if (drag.type === "rotate") {
      if (Math.abs(drag.currentRotation - drag.startRotation) > 0.5) {
        commitValue(lineIndex, "rotation", Math.round(drag.currentRotation * 10) / 10, currentBeat);
      }
    }

    dragRef.current = null;
  }, [lineIndex, getCurrentBeat]);

  // Also handle mouse up outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragRef.current) {
        handleMouseUp();
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [handleMouseUp]);

  // Change cursor based on hover
  const handleMouseMoveHover = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      handleMouseMove(e);
      return;
    }

    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cs = useChartStore.getState();
    const line = cs.chart.lines[lineIndex];
    if (!line) return;

    const currentBeat = getCurrentBeat();
    const state = evaluateLineEvents(line.events, currentBeat);
    const screenX = renderer.canvasToScreenX(state.x, canvas.width);
    const screenY = renderer.canvasToScreenY(state.y, canvas.height);

    if (renderer.hitTestRotationHandle(mouseX, mouseY, screenX, screenY, state.rotation, canvas.width)) {
      canvas.style.cursor = "grab";
    } else if (
      renderer.hitTestTranslateHandle(mouseX, mouseY, screenX, screenY) ||
      renderer.hitTestLineBody(mouseX, mouseY, screenX, screenY, state.rotation, canvas.width)
    ) {
      canvas.style.cursor = "move";
    } else {
      canvas.style.cursor = "default";
    }
  }, [lineIndex, getCurrentBeat, handleMouseMove]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveHover}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (canvasRef.current) canvasRef.current.style.cursor = "default";
        }}
      />
    </div>
  );
}

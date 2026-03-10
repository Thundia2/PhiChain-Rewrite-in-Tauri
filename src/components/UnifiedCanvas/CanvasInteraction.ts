// ============================================================
// Canvas Interaction — State Machine for Unified Canvas
//
// Pure logic module for the interaction state machine.
// No React, no DOM — just pure functions that take current state
// and events, returning new state and side effects.
//
// State machine:
//   IDLE → DRAGGING_TRANSLATE (mousedown on translate handle)
//   IDLE → DRAGGING_ROTATE   (mousedown on rotation handle)
//   IDLE → PLACING_NOTE      (mousedown with place tool)
//   IDLE → DRAG_SELECTING    (mousedown on empty space + select tool)
//   IDLE → PANNING           (middle mouse or space+drag)
//
// commitValue() — ported from EventCanvas.tsx — creates/updates
// events when a drag operation completes.
// ============================================================

import { useChartStore } from "../../stores/chartStore";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat, floatToBeat } from "../../types/chart";
import type { LineEvent, LineEventKind, Beat, Note } from "../../types/chart";

// ============================================================
// Drag State Types
// ============================================================

export interface TranslateDragState {
  type: "translate";
  lineIndex: number;
  startMouseX: number;
  startMouseY: number;
  startCanvasX: number; // Phigros coordinate X at drag start
  startCanvasY: number; // Phigros coordinate Y at drag start
  currentCanvasX: number;
  currentCanvasY: number;
  startRotationDeg: number; // Initial rotation in degrees (for ghost preview)
}

export interface RotateDragState {
  type: "rotate";
  lineIndex: number;
  lineScreenX: number; // Screen position of line center (for angle calc)
  lineScreenY: number;
  startCanvasX: number; // Phigros coords (for ghost line)
  startCanvasY: number;
  startRotationDeg: number;
  currentRotationDeg: number;
}

export interface PanDragState {
  type: "pan";
  startMouseX: number;
  startMouseY: number;
  startOffsetX: number;
  startOffsetY: number;
}

export interface DragSelectState {
  type: "drag_select";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface NoteDragState {
  type: "note_drag";
  lineIndex: number;
  noteIndices: number[];
  startMouseX: number;
  startMouseY: number;
  /** Snapshot of original note positions for computing deltas */
  originalNotes: Array<{ beat: Beat; x: number }>;
  /** Line screen position at drag start (for coordinate transforms) */
  lineScreenX: number;
  lineScreenY: number;
  /** Line rotation in radians (from RenderResult) */
  lineRotation: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Pre-computed: approximate pixels per beat for perpendicular movement */
  pixelsPerBeat: number;
  /** Whether the dragged notes are on the "above" side of the line.
   *  Determines perpendicular→beat sign: above notes render at -rawY,
   *  so dragging away from the line (negative localPerp) = later beat. */
  above: boolean;
  /** Current deltas (for preview during drag) */
  deltaBeat: number;
  deltaX: number;
}

export interface HoldPlacementDragState {
  type: "hold_placement";
  lineIndex: number;
  noteIndex: number;
  /** Float beat where the hold note head was placed */
  headBeat: number;
  /** Whether the note is above the line */
  above: boolean;
}

export interface HoldResizeDragState {
  type: "hold_resize";
  lineIndex: number;
  noteIndex: number;
  /** Float beat where the hold note head is */
  headBeat: number;
  /** Whether the note is above the line */
  above: boolean;
}

export type DragState =
  | TranslateDragState
  | RotateDragState
  | PanDragState
  | DragSelectState
  | NoteDragState
  | HoldPlacementDragState
  | HoldResizeDragState
  | null;

// ============================================================
// commitValue — Create/update events for a drag result
//
// Ported from EventCanvas.tsx's commitValue() function.
// Handles three cases:
//   1. Active event with constant value → update it
//   2. Active event with transition value → split at current beat
//   3. No active event → create new constant event
// ============================================================

/**
 * Find the event of a given kind that is active at the given beat.
 * Returns the event's index in the full events array.
 */
export function findActiveEventIndex(
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
 * Commit a drag result by creating or updating events at the current beat.
 *
 * @param lineIndex - Index of the line being edited
 * @param kind - Event property being changed (x, y, rotation, etc.)
 * @param newValue - New value to commit
 * @param currentBeat - Current beat as a float
 */
export function commitValue(
  lineIndex: number,
  kind: LineEventKind,
  newValue: number,
  currentBeat: number,
): void {
  const cs = useChartStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return;

  const activeIdx = findActiveEventIndex(line.events, kind, currentBeat);

  if (activeIdx >= 0) {
    const event = line.events[activeIdx];
    if ("constant" in event.value) {
      // Case 1: Update the constant value
      cs.editEvent(lineIndex, activeIdx, { value: { constant: newValue } });
    } else if ("transition" in event.value) {
      // Case 2: Split the transition event at the current beat
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
    // Case 3: No active event — create a new constant event
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

// ============================================================
// Coordinate Conversion Helpers
// ============================================================

/**
 * Convert a screen pixel delta to Phigros canvas coordinate delta.
 * Used during translate drags to map mouse movement to line position changes.
 */
export function screenDeltaToCanvasDelta(
  deltaScreenX: number,
  deltaScreenY: number,
  canvasWidth: number,
  canvasHeight: number,
): { dx: number; dy: number } {
  return {
    dx: (deltaScreenX / canvasWidth) * CANVAS_WIDTH,
    dy: -(deltaScreenY / canvasHeight) * CANVAS_HEIGHT,
  };
}

/**
 * Compute the rotation angle (in degrees) from a line's center to a mouse position.
 * Used during rotation drags.
 */
export function computeRotationAngle(
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
  snapDegrees: number,
): number {
  const angle = Math.atan2(mouseY - lineScreenY, mouseX - lineScreenX);
  let angleDeg = (angle * 180) / Math.PI;

  // Apply snapping
  if (snapDegrees > 0) {
    angleDeg = Math.round(angleDeg / snapDegrees) * snapDegrees;
  }

  return angleDeg;
}

// ============================================================
// Translate Drag Operations
// ============================================================

/**
 * Start a translate drag on the selected line.
 */
export function startTranslateDrag(
  lineIndex: number,
  mouseX: number,
  mouseY: number,
  canvasX: number,
  canvasY: number,
  rotationDeg: number,
): TranslateDragState {
  return {
    type: "translate",
    lineIndex,
    startMouseX: mouseX,
    startMouseY: mouseY,
    startCanvasX: canvasX,
    startCanvasY: canvasY,
    currentCanvasX: canvasX,
    currentCanvasY: canvasY,
    startRotationDeg: rotationDeg,
  };
}

/**
 * Update a translate drag with new mouse position.
 */
export function updateTranslateDrag(
  drag: TranslateDragState,
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
): TranslateDragState {
  const { dx, dy } = screenDeltaToCanvasDelta(
    mouseX - drag.startMouseX,
    mouseY - drag.startMouseY,
    canvasWidth,
    canvasHeight,
  );
  return {
    ...drag,
    currentCanvasX: drag.startCanvasX + dx,
    currentCanvasY: drag.startCanvasY + dy,
  };
}

/**
 * Finish a translate drag — commits X and Y values if they changed.
 */
export function finishTranslateDrag(
  drag: TranslateDragState,
  currentBeat: number,
): void {
  const threshold = 0.5; // Minimum change to commit

  if (Math.abs(drag.currentCanvasX - drag.startCanvasX) > threshold) {
    commitValue(
      drag.lineIndex, "x",
      Math.round(drag.currentCanvasX * 10) / 10,
      currentBeat,
    );
  }

  if (Math.abs(drag.currentCanvasY - drag.startCanvasY) > threshold) {
    commitValue(
      drag.lineIndex, "y",
      Math.round(drag.currentCanvasY * 10) / 10,
      currentBeat,
    );
  }
}

// ============================================================
// Rotation Drag Operations
// ============================================================

/**
 * Start a rotation drag on the selected line.
 */
export function startRotateDrag(
  lineIndex: number,
  lineScreenX: number,
  lineScreenY: number,
  canvasX: number,
  canvasY: number,
  rotationDeg: number,
): RotateDragState {
  return {
    type: "rotate",
    lineIndex,
    lineScreenX,
    lineScreenY,
    startCanvasX: canvasX,
    startCanvasY: canvasY,
    startRotationDeg: rotationDeg,
    currentRotationDeg: rotationDeg,
  };
}

/**
 * Update a rotation drag with new mouse position.
 *
 * computeRotationAngle returns a screen-space angle (from atan2).
 * Phigros stores rotation such that the renderer applies ctx.rotate(-state.rotation),
 * so screen_angle = -phigros_rotation → phigros_rotation = -screen_angle.
 * We negate the screen angle to store as Phigros rotation degrees.
 */
export function updateRotateDrag(
  drag: RotateDragState,
  mouseX: number,
  mouseY: number,
  snapDegrees: number,
): RotateDragState {
  const screenAngleDeg = computeRotationAngle(
    mouseX, mouseY,
    drag.lineScreenX, drag.lineScreenY,
    snapDegrees,
  );
  return {
    ...drag,
    currentRotationDeg: -screenAngleDeg, // Negate: screen → Phigros rotation space
  };
}

/**
 * Finish a rotation drag — commits the rotation value if it changed.
 */
export function finishRotateDrag(
  drag: RotateDragState,
  currentBeat: number,
): void {
  const threshold = 0.5;

  if (Math.abs(drag.currentRotationDeg - drag.startRotationDeg) > threshold) {
    commitValue(
      drag.lineIndex, "rotation",
      Math.round(drag.currentRotationDeg * 10) / 10,
      currentBeat,
    );
  }
}

// ============================================================
// Pan Operations (viewport-based)
// ============================================================

/**
 * Start a pan drag (middle mouse or space+drag).
 */
export function startPanDrag(
  mouseX: number,
  mouseY: number,
  currentOffsetX: number,
  currentOffsetY: number,
): PanDragState {
  return {
    type: "pan",
    startMouseX: mouseX,
    startMouseY: mouseY,
    startOffsetX: currentOffsetX,
    startOffsetY: currentOffsetY,
  };
}

/**
 * Compute new viewport offsets during a pan drag.
 */
export function computePanOffset(
  drag: PanDragState,
  mouseX: number,
  mouseY: number,
): { offsetX: number; offsetY: number } {
  return {
    offsetX: drag.startOffsetX + (mouseX - drag.startMouseX),
    offsetY: drag.startOffsetY + (mouseY - drag.startMouseY),
  };
}

// ============================================================
// Drag Selection
// ============================================================

/**
 * Start a drag selection rectangle.
 */
export function startDragSelect(
  mouseX: number,
  mouseY: number,
): DragSelectState {
  return {
    type: "drag_select",
    startX: mouseX,
    startY: mouseY,
    currentX: mouseX,
    currentY: mouseY,
  };
}

/**
 * Update the drag selection rectangle.
 */
export function updateDragSelect(
  drag: DragSelectState,
  mouseX: number,
  mouseY: number,
): DragSelectState {
  return {
    ...drag,
    currentX: mouseX,
    currentY: mouseY,
  };
}

// ============================================================
// Note Drag Operations
// ============================================================

/**
 * Start a note drag for moving selected notes.
 *
 * @param lineIndex - Index of the line the notes belong to
 * @param noteIndices - Indices of the selected notes being dragged
 * @param notes - The actual note data for snapshot
 * @param mouseX - Starting mouse X in screen pixels
 * @param mouseY - Starting mouse Y in screen pixels
 * @param lineScreenX - Line center X in screen pixels
 * @param lineScreenY - Line center Y in screen pixels
 * @param lineRotation - Line rotation in radians
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param bpm - Current BPM for scale calculation
 * @param speed - Current speed at the playhead for scale calculation
 */
export function startNoteDrag(
  lineIndex: number,
  noteIndices: number[],
  notes: Note[],
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
  lineRotation: number,
  canvasWidth: number,
  canvasHeight: number,
  bpm: number,
  speed: number,
): NoteDragState {
  // Compute approximate pixels per beat:
  // rawY = speed * timeDelta * distanceScale
  // timeDelta (per beat) = 60 / bpm
  // distanceScale = canvasHeight * (120 / 900)
  // So: pixelsPerBeat = speed * (60/bpm) * canvasHeight * (120/900)
  const distanceScale = canvasHeight * (120.0 / 900.0);
  const pixelsPerBeat = Math.max(1, speed * (60 / bpm) * distanceScale);

  // Determine whether selected notes are above or below the line.
  // Use the first selected note's side (typically all selected notes are on the same side).
  const above = noteIndices.length > 0 ? (notes[noteIndices[0]]?.above ?? true) : true;

  return {
    type: "note_drag",
    lineIndex,
    noteIndices,
    startMouseX: mouseX,
    startMouseY: mouseY,
    originalNotes: noteIndices.map((idx) => ({
      beat: [...notes[idx].beat] as Beat,
      x: notes[idx].x,
    })),
    lineScreenX,
    lineScreenY,
    lineRotation,
    canvasWidth,
    canvasHeight,
    pixelsPerBeat,
    above,
    deltaBeat: 0,
    deltaX: 0,
  };
}

/**
 * Update a note drag with the current mouse position.
 * Computes delta in beat and X from the original positions.
 */
export function updateNoteDrag(
  drag: NoteDragState,
  mouseX: number,
  mouseY: number,
  density: number,
): NoteDragState {
  // Compute screen delta
  const dxScreen = mouseX - drag.startMouseX;
  const dyScreen = mouseY - drag.startMouseY;

  // Rotate into line-local space using R(+rot), the correct inverse of
  // the renderer's ctx.rotate(-rot) screen transform.
  // lx = dx*cos(rot) - dy*sin(rot)
  // ly = dx*sin(rot) + dy*cos(rot)
  const cos = Math.cos(drag.lineRotation);
  const sin = Math.sin(drag.lineRotation);
  const localParallel = dxScreen * cos - dyScreen * sin;   // along line (X direction)
  const localPerp = dxScreen * sin + dyScreen * cos;       // perpendicular (beat direction)

  // Convert parallel movement to Phigros X delta
  const deltaX = (localParallel / drag.canvasWidth) * CANVAS_WIDTH;

  // Convert perpendicular movement to beat delta.
  // The sign depends on whether notes are above or below the line:
  //   above: screenNoteY = -rawY → dragging away from line (negative localPerp) = later beat
  //   below: screenNoteY = +rawY → dragging away from line (positive localPerp) = later beat
  // So for above notes we negate localPerp before dividing by pixelsPerBeat.
  const rawDeltaBeat = (drag.above ? -localPerp : localPerp) / drag.pixelsPerBeat;

  // Snap delta to grid
  const snappedDeltaBeat = Math.round(rawDeltaBeat * density) / density;

  return {
    ...drag,
    deltaBeat: snappedDeltaBeat,
    deltaX: Math.round(deltaX),
  };
}

/**
 * Finish a note drag — commits the position changes using batchEditNotes.
 */
export function finishNoteDrag(
  drag: NoteDragState,
  density: number,
): void {
  // Skip if no meaningful change
  if (Math.abs(drag.deltaBeat) < 0.001 && Math.abs(drag.deltaX) < 1) return;

  const cs = useChartStore.getState();
  const line = cs.chart.lines[drag.lineIndex];
  if (!line) return;

  const edits = drag.noteIndices.map((noteIndex, i) => {
    const orig = drag.originalNotes[i];
    const newBeatFloat = beatToFloat(orig.beat) + drag.deltaBeat;
    const newBeat = floatToBeat(Math.max(0, newBeatFloat), Math.max(density, 32));

    return {
      noteIndex,
      changes: {
        beat: newBeat,
        x: orig.x + drag.deltaX,
      } as Partial<Note>,
    };
  });

  cs.batchEditNotes(drag.lineIndex, edits);
}

// ============================================================
// Cursor Helper
// ============================================================

/**
 * Determine the appropriate cursor style based on what's under the mouse.
 */
export type CursorStyle = "default" | "move" | "grab" | "grabbing" | "crosshair" | "pointer";

export function getCursorForPosition(
  isOverRotationHandle: boolean,
  isOverTranslateHandle: boolean,
  isOverLineBody: boolean,
  isDragging: boolean,
  activeTool: string,
): CursorStyle {
  if (isDragging) return "grabbing";
  if (isOverRotationHandle) return "grab";
  if (isOverTranslateHandle) return "move";
  if (isOverLineBody) return "move";
  if (activeTool === "tap" || activeTool === "drag" || activeTool === "flick" || activeTool === "hold") {
    return "crosshair";
  }
  return "default";
}

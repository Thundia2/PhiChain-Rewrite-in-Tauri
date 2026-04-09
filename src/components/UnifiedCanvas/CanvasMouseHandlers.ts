// ============================================================
// Canvas Mouse Handlers — Pure Logic for Unified Canvas
//
// Extracted from UnifiedCanvas.tsx (6.1 refactor). Each function
// takes pre-fetched state as explicit parameters and returns a
// result object. The caller in UnifiedCanvas.tsx performs all
// store mutations and ref assignments based on the return.
//
// Design principles:
//   1. Return data, not side effects
//   2. No React refs as parameters
//   3. No Zustand store access
//   4. Explicit parameters per function
//
// Recent change: Added startEraserDrag() and updateEraserDrag()
// for drag-to-erase feature (Feature B). Eraser now starts a drag
// state that accumulates hit notes, batch-deleting on mouseUp.
// ============================================================

import type { RenderedLineInfo } from "../../canvas/gameRenderer";
import type { Line, Note, NoteKind, Beat } from "../../types/chart";
import type { PatternShape } from "../../types/notePattern";
import type { Bookmark } from "../../types/bookmark";
import type { BpmList } from "../../utils/bpmList";
import type { PendingNote } from "../../stores/editorStore";
import type { TranslateDragState, RotateDragState, EraserDragState } from "./CanvasInteraction";
import { CANVAS_WIDTH, beatToFloat, floatToBeat } from "../../types/chart";
import { startTranslateDrag, startRotateDrag } from "./CanvasInteraction";
import { hitTestRotationHandle, hitTestTranslateHandle, hitTestLineBody } from "./CanvasOverlays";
import { evaluateLineEventsWithLayers } from "../../canvas/events";
import { screenToLineLocal, projectClickToNote, computeGhostNote } from "./NoteProjection";
import { snapBeat } from "../../utils/beat";
import { snapX } from "../../utils/xSnap";
import { generateNotePattern as generateNotePatternForCanvas } from "../../utils/notePatternGenerator";

// ============================================================
// Tool → NoteKind mapping (moved from UnifiedCanvas.tsx)
// ============================================================

export const TOOL_TO_NOTE_KIND: Record<string, NoteKind> = {
  place_tap: "tap",
  place_drag: "drag",
  place_flick: "flick",
  place_hold: "hold",
};

export function isPlaceTool(tool: string): boolean {
  return tool in TOOL_TO_NOTE_KIND;
}

// ============================================================
// Return type definitions
// ============================================================

/** Result from tryHandleDrag — rotation or translate drag initiated */
export type HandleDragResult =
  | { type: "rotate"; drag: RotateDragState; interactionMode: "dragging_rotate" }
  | { type: "translate"; drag: TranslateDragState; interactionMode: "dragging_translate" };

/** Result from tryNoteHit — describes what action to take on a note click */
export type NoteHitAction =
  | {
      // Already-selected note clicked without modifier → caller starts drag
      type: "start_note_drag";
      lineIndex: number;
      noteIndices: number[];
      notes: Note[];
      mouseX: number; mouseY: number;
      lineScreenX: number; lineScreenY: number;
      lineRotation: number;
      canvasWidth: number; canvasHeight: number;
      bpmAtCurrent: number;
      currentSpeed: number;
    }
  | {
      // Hold note tail region clicked → caller starts hold resize
      type: "start_hold_resize";
      lineIndex: number;
      noteIndex: number;
      headBeat: number;
      above: boolean;
    }
  | {
      // Note clicked without modifier → select it
      type: "select";
      noteIndex: number;
    }
  | {
      // Note ctrl/cmd-clicked → toggle selection
      type: "toggle";
      noteIndex: number;
    };

/** Result from tryNotePlacement */
export interface NotePlacementAction {
  note: Note;
  needsHoldDrag: boolean;
  /** Beat where the hold note head was placed (only when needsHoldDrag) */
  headBeat: number;
  /** Whether the note is above the line (only when needsHoldDrag) */
  above: boolean;
}

/** Result from tryStepRecordPlace and handleStepRecordStream */
export interface StepRecordPlaceResult {
  note: Note;
  snappedX: number;
}

/** Result from captureRecordKeyframe */
export interface RecordKeyframeResult {
  beat: number;
  x?: number;
  y?: number;
}

/** Ghost note for pattern preview */
export interface PatternGhost {
  x: number;
  beat: number;
  kind: string;
  above: boolean;
}

// ============================================================
// handleMouseDown helpers
// ============================================================

/**
 * Try to initiate a handle drag (rotation or translate) on the selected line.
 * Hit-tests the rotation handle first (higher priority — smaller target),
 * then the translate handle or line body.
 *
 * Returns HandleDragResult with the drag state and interaction mode,
 * or null if no handle was hit.
 */
export function tryHandleDrag(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  chartLine: Line,
  currentBeat: number,
  canvasWidth: number,
): HandleDragResult | null {
  const screenRotation = -lineInfo.rotation;

  // Check rotation handle first (higher priority — smaller target)
  if (hitTestRotationHandle(
    mouseX, mouseY,
    lineInfo.screenX, lineInfo.screenY,
    screenRotation, canvasWidth,
  )) {
    const state = evaluateLineEventsWithLayers(
      chartLine.events, chartLine.event_layers, currentBeat,
    );
    const rotDeg = (lineInfo.rotation * 180) / Math.PI;
    const drag = startRotateDrag(
      lineInfo.lineIndex,
      lineInfo.screenX, lineInfo.screenY,
      state.x, state.y, rotDeg,
    );
    return { type: "rotate", drag, interactionMode: "dragging_rotate" };
  }

  // Check translate handle or line body
  if (
    hitTestTranslateHandle(mouseX, mouseY, lineInfo.screenX, lineInfo.screenY) ||
    hitTestLineBody(mouseX, mouseY, lineInfo.screenX, lineInfo.screenY, screenRotation, canvasWidth)
  ) {
    const state = evaluateLineEventsWithLayers(
      chartLine.events, chartLine.event_layers, currentBeat,
    );
    const rotDeg = (state.rotation * 180) / Math.PI;
    const drag = startTranslateDrag(
      lineInfo.lineIndex,
      mouseX, mouseY,
      state.x, state.y, rotDeg,
    );
    return { type: "translate", drag, interactionMode: "dragging_translate" };
  }

  return null;
}

/**
 * Try to place a note in step recording mode.
 * Converts the click to line-local coordinates, applies X snap,
 * and creates a note at the current step beat.
 */
export function tryStepRecordPlace(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  noteKind: NoteKind,
  currentStepBeat: number,
  density: number,
  xSnapEnabled: boolean,
  lanes: number,
  canvasWidth: number,
): StepRecordPlaceResult | null {
  const local = screenToLineLocal(
    mouseX, mouseY,
    lineInfo.screenX, lineInfo.screenY,
    lineInfo.rotation, canvasWidth,
  );

  // X position with snap (reuses lanes for divisions)
  const rawX = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, local.noteX));
  const x = xSnapEnabled && lanes > 0
    ? snapX(rawX, lanes)
    : Math.round(rawX);

  // Beat from the step counter (not mouse position or playhead)
  const beat = snapBeat(currentStepBeat, density);

  const newNote: Note = {
    kind: noteKind,
    above: local.above,
    beat,
    x,
    speed: 1,
  };
  if (noteKind === "hold") {
    newNote.hold_beat = [0, 1, density] as Beat;
  }

  return { note: newNote, snappedX: x };
}

/**
 * Convert pattern ghost notes into real Note objects for batch insertion.
 * Called when the user clicks to commit the current pattern preview.
 */
export function tryPatternCommit(
  ghostNotes: Array<{ x: number; beat: number; kind: string; above: boolean }>,
  density: number,
): Note[] {
  return ghostNotes.map((g) => ({
    beat: floatToBeat(g.beat, density) as Beat,
    x: Math.round(g.x),
    kind: g.kind as NoteKind,
    above: g.above,
    speed: 1,
  }));
}

/**
 * Try to place a note using the active placement tool (tap/drag/flick/hold).
 * Supports both beat-sync mode (beat from playhead) and normal mode
 * (beat from perpendicular distance to line).
 */
export function tryNotePlacement(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  line: Line,
  tool: string,
  bpmList: BpmList,
  canvasWidth: number,
  canvasHeight: number,
  beatSyncPlacement: boolean,
  density: number,
  xSnapEnabled: boolean,
  lanes: number,
  currentBeat: number,
  currentTime: number,
): NotePlacementAction | null {
  const noteKind = TOOL_TO_NOTE_KIND[tool];
  if (!noteKind) return null;

  let placement: { beat: Beat; x: number; above: boolean } | null = null;

  if (beatSyncPlacement) {
    // Beat-sync mode: beat from playhead, X and above from click
    const local = screenToLineLocal(
      mouseX, mouseY,
      lineInfo.screenX, lineInfo.screenY,
      lineInfo.rotation, canvasWidth,
    );
    const beat = snapBeat(currentBeat, density);
    const rawX = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, local.noteX));
    const x = xSnapEnabled && lanes > 0
      ? snapX(rawX, lanes)
      : Math.round(rawX);
    placement = { beat, x, above: local.above };
  } else {
    // Normal mode: beat from perpendicular distance
    placement = projectClickToNote(
      mouseX, mouseY,
      lineInfo.screenX, lineInfo.screenY,
      lineInfo.rotation,
      line,
      currentTime,
      bpmList,
      canvasWidth, canvasHeight,
      density,
      xSnapEnabled ? lanes : 0,
    );
  }

  if (!placement) return null;

  const newNote: Note = {
    kind: noteKind,
    above: placement.above,
    beat: placement.beat,
    x: placement.x,
    speed: 1,
  };
  if (noteKind === "hold") {
    newNote.hold_beat = [0, 1, density] as Beat;
  }

  // For hold notes in normal mode, signal that a hold placement drag is needed
  const needsHoldDrag = noteKind === "hold" && !beatSyncPlacement;

  return {
    note: newNote,
    needsHoldDrag,
    headBeat: beatToFloat(placement.beat),
    above: placement.above,
  };
}

/**
 * Try to hit-test notes on the selected line.
 * Returns a NoteHitAction describing what the caller should do, or null
 * if no note was hit.
 *
 * Priority order:
 *   1. Already-selected hold note tail region → start_hold_resize
 *   2. Already-selected note → start_note_drag
 *   3. Ctrl/Cmd click → toggle selection
 *   4. Regular click → select note
 */
export function tryNoteHit(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  line: Line,
  selectedNoteIndices: number[],
  bpmList: BpmList,
  canvasWidth: number,
  canvasHeight: number,
  currentBeat: number,
  currentTime: number,
  isMultiSelect: boolean,
): NoteHitAction | null {
  // Iterate notes in reverse order (top-most first)
  for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
    const noteInfo = lineInfo.notes[j];
    const dx = mouseX - noteInfo.screenX;
    const dy = mouseY - noteInfo.screenY;
    const halfW = Math.max(noteInfo.width / 2, 12);
    const halfH = Math.max(noteInfo.height / 2, 12);

    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;

    // Note was hit — determine action based on selection state

    // Already selected + not multi-select → start drag or hold resize
    if (selectedNoteIndices.includes(noteInfo.noteIndex) && !isMultiSelect) {
      const note = line.notes[noteInfo.noteIndex];

      // Hold note resize: check if click is in tail region
      if (
        note && note.kind === "hold" && note.hold_beat &&
        selectedNoteIndices.length === 1
      ) {
        const clickLocal = screenToLineLocal(
          mouseX, mouseY,
          lineInfo.screenX, lineInfo.screenY,
          lineInfo.rotation, canvasWidth,
        );
        const headLocal = screenToLineLocal(
          noteInfo.screenX, noteInfo.screenY,
          lineInfo.screenX, lineInfo.screenY,
          lineInfo.rotation, canvasWidth,
        );
        if (clickLocal.perpDistance > headLocal.perpDistance) {
          return {
            type: "start_hold_resize",
            lineIndex: lineInfo.lineIndex,
            noteIndex: noteInfo.noteIndex,
            headBeat: beatToFloat(note.beat),
            above: note.above,
          };
        }
      }

      // Regular note move drag — compute speed and BPM at current beat
      const speedEvents = line.events.filter((ev) => ev.kind === "speed");
      let currentSpeed = 1;
      for (const se of speedEvents) {
        if (beatToFloat(se.start_beat) <= currentBeat && currentBeat <= beatToFloat(se.end_beat)) {
          if ("constant" in se.value) currentSpeed = se.value.constant;
          else if ("transition" in se.value) currentSpeed = se.value.transition.start;
          break;
        }
      }
      const bpmAtCurrent = bpmList.bpmAtTime(currentTime);

      return {
        type: "start_note_drag",
        lineIndex: lineInfo.lineIndex,
        noteIndices: selectedNoteIndices,
        notes: line.notes,
        mouseX, mouseY,
        lineScreenX: lineInfo.screenX,
        lineScreenY: lineInfo.screenY,
        lineRotation: lineInfo.rotation,
        canvasWidth, canvasHeight,
        bpmAtCurrent,
        currentSpeed,
      };
    }

    // Multi-select (ctrl/cmd click) → toggle
    if (isMultiSelect) {
      return { type: "toggle", noteIndex: noteInfo.noteIndex };
    }

    // Regular click → select
    return { type: "select", noteIndex: noteInfo.noteIndex };
  }

  return null;
}

/**
 * Try to hit-test bookmark diamond markers on the canvas.
 * Returns the bookmark ID if one was hit, or null.
 */
export function tryBookmarkHit(
  mouseX: number,
  mouseY: number,
  bookmarks: Bookmark[],
  visibilityRange: number,
  currentBeat: number,
  renderLines: RenderedLineInfo[],
  canvasWidth: number,
): string | null {
  for (const bm of bookmarks) {
    const bmBeat = bm.beat[0] + bm.beat[1] / bm.beat[2];
    if (Math.abs(bmBeat - currentBeat) > visibilityRange) continue;

    const lineInfo = renderLines.find((l) => l.lineIndex === bm.lineIndex);
    if (!lineInfo) continue;

    // Position the bookmark along the line
    const bmXPos = (bm.x / CANVAS_WIDTH) * canvasWidth;
    const cosR = Math.cos(-lineInfo.rotation);
    const sinR = Math.sin(-lineInfo.rotation);
    const bmSX = lineInfo.screenX + bmXPos * cosR * lineInfo.scaleX;
    const bmSY = lineInfo.screenY + bmXPos * sinR * lineInfo.scaleY;

    const dx = mouseX - bmSX;
    const dy = mouseY - bmSY;
    if (Math.abs(dx) <= 12 && Math.abs(dy) <= 12) {
      return bm.id;
    }
  }

  return null;
}

/**
 * Try to delete a note under the eraser tool cursor.
 * Returns the line and note index of the hit note, or null.
 */
export function tryEraserDelete(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
): { lineIndex: number; noteIndex: number } | null {
  for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
    const noteInfo = lineInfo.notes[j];
    const dx = mouseX - noteInfo.screenX;
    const dy = mouseY - noteInfo.screenY;
    const halfW = Math.max(noteInfo.width / 2, 12);
    const halfH = Math.max(noteInfo.height / 2, 12);
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
      return { lineIndex: lineInfo.lineIndex, noteIndex: noteInfo.noteIndex };
    }
  }
  return null;
}

/**
 * Start an eraser drag on mousedown.
 * Immediately adds the first hit note (if any) to the set.
 * Returns the drag state and the index of the first hit note (or null).
 */
export function startEraserDrag(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
): { drag: EraserDragState; firstHit: number | null } {
  const hitNoteIndices = new Set<number>();
  let firstHit: number | null = null;

  // Hit-test notes in reverse order (top-most first)
  for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
    const noteInfo = lineInfo.notes[j];
    const dx = mouseX - noteInfo.screenX;
    const dy = mouseY - noteInfo.screenY;
    const halfW = Math.max(noteInfo.width / 2, 12);
    const halfH = Math.max(noteInfo.height / 2, 12);
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
      hitNoteIndices.add(noteInfo.noteIndex);
      firstHit = noteInfo.noteIndex;
      break; // Only add one note per position
    }
  }

  return {
    drag: {
      type: "eraser_drag",
      lineIndex: lineInfo.lineIndex,
      hitNoteIndices,
    },
    firstHit,
  };
}

/**
 * Update an eraser drag during mousemove.
 * Tests the current position against notes and adds any new hits.
 * Returns true if a new note was hit (for visual feedback).
 * Uses slightly wider hit area (14 vs 12) for better drag tolerance.
 */
export function updateEraserDrag(
  drag: EraserDragState,
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
): boolean {
  let newHit = false;
  for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
    const noteInfo = lineInfo.notes[j];
    if (drag.hitNoteIndices.has(noteInfo.noteIndex)) continue; // Already hit

    const dx = mouseX - noteInfo.screenX;
    const dy = mouseY - noteInfo.screenY;
    const halfW = Math.max(noteInfo.width / 2, 14); // Slightly wider hit area for drag
    const halfH = Math.max(noteInfo.height / 2, 14);
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
      drag.hitNoteIndices.add(noteInfo.noteIndex);
      newHit = true;
    }
  }
  return newHit;
}

// ============================================================
// handleMouseMove helpers
// ============================================================

/**
 * Capture a record-mode keyframe from the current mouse position.
 * Called when recordMode is active and audio is playing.
 * Returns null if the keyframe would duplicate the last recorded beat.
 */
export function captureRecordKeyframe(
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentBeat: number,
  channels: { x: boolean; y: boolean; rotation: boolean },
  lastRecordedBeat: number | null,
  recordSnapToDensity: boolean,
  density: number,
): RecordKeyframeResult | null {
  // Convert mouse position to canvas coordinates
  const canvasX = (mouseX / canvasWidth - 0.5) * 1350;
  const canvasY = (0.5 - mouseY / canvasHeight) * 900;

  const beat = recordSnapToDensity
    ? beatToFloat(snapBeat(currentBeat, density))
    : currentBeat;

  // Only add if different from last keyframe (avoid duplicates at same beat)
  if (lastRecordedBeat !== null && Math.abs(lastRecordedBeat - beat) <= 0.01) {
    return null;
  }

  const kf: RecordKeyframeResult = { beat };
  if (channels.x) kf.x = canvasX;
  if (channels.y) kf.y = canvasY;

  return kf;
}

/**
 * Handle step-record hold-to-stream: place notes as the mouse
 * crosses X-snap boundaries while the button is held.
 * Returns a note to add if a snap boundary was crossed, or null.
 */
export function handleStepRecordStream(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  noteKind: NoteKind,
  currentStepBeat: number,
  density: number,
  lanes: number,
  lastSnapX: number | null,
  canvasWidth: number,
): StepRecordPlaceResult | null {
  const local = screenToLineLocal(
    mouseX, mouseY,
    lineInfo.screenX, lineInfo.screenY,
    lineInfo.rotation, canvasWidth,
  );
  const rawX = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, local.noteX));
  const snappedX = snapX(rawX, lanes);

  // Only place a note if we crossed to a NEW snap position
  if (lastSnapX === null || snappedX === lastSnapX) {
    return null;
  }

  const beat = snapBeat(currentStepBeat, density);
  const newNote: Note = {
    kind: noteKind,
    above: local.above,
    beat,
    x: snappedX,
    speed: 1,
  };
  if (noteKind === "hold") {
    newNote.hold_beat = [0, 1, density] as Beat;
  }

  return { note: newNote, snappedX };
}

/**
 * Compute the step-record ghost note preview from the current mouse position.
 * Always returns a PendingNote for the caller to set on the editor store.
 */
export function computeStepRecordGhost(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  noteKind: NoteKind,
  currentStepBeat: number,
  density: number,
  xSnapEnabled: boolean,
  lanes: number,
  canvasWidth: number,
): PendingNote {
  const local = screenToLineLocal(
    mouseX, mouseY,
    lineInfo.screenX, lineInfo.screenY,
    lineInfo.rotation, canvasWidth,
  );
  const rawX = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, local.noteX));
  const x = xSnapEnabled && lanes > 0
    ? snapX(rawX, lanes)
    : Math.round(rawX);
  const beat = snapBeat(currentStepBeat, density);

  return { beat, x, kind: noteKind, above: local.above };
}

/**
 * Compute pattern ghost notes from the pattern config anchored at
 * the current playhead beat. Encapsulates the generateNotePattern
 * call with its type casts.
 * Returns [] on failure (matching current try/catch behavior).
 */
export function computePatternGhosts(
  patternConfig: {
    shape: string; noteCount: number; startX: number; endX: number;
    noteKind: string; above: boolean; cycles: number; amplitude: number;
    stairWidth: number; arcHeight: number; expression: string;
  },
  anchorBeat: number,
): PatternGhost[] {
  const fullConfig = {
    ...patternConfig,
    startBeat: anchorBeat,
    endBeat: anchorBeat + Math.max(1, patternConfig.noteCount / 4),
    speed: 1, fake: false, holdDuration: 1,
  };
  try {
    const notes = generateNotePatternForCanvas({
      ...fullConfig,
      noteKind: fullConfig.noteKind as NoteKind,
      shape: fullConfig.shape as PatternShape,
    });
    return notes.map((n: { x: number; beat: [number, number, number]; above: boolean }) => ({
      x: n.x,
      beat: n.beat[0] + n.beat[1] / n.beat[2],
      kind: patternConfig.noteKind,
      above: patternConfig.above,
    }));
  } catch {
    return [];
  }
}

/**
 * Compute the placement ghost note preview for the active placement tool.
 * Supports both beat-sync mode (ghost at playhead beat) and normal mode
 * (ghost from perpendicular distance via computeGhostNote).
 */
export function computePlacementGhost(
  mouseX: number,
  mouseY: number,
  lineInfo: RenderedLineInfo,
  line: Line,
  tool: string,
  bpmList: BpmList,
  canvasWidth: number,
  canvasHeight: number,
  beatSyncPlacement: boolean,
  density: number,
  xSnapEnabled: boolean,
  lanes: number,
  currentBeat: number,
  currentTime: number,
): PendingNote | null {
  const noteKind = TOOL_TO_NOTE_KIND[tool];
  if (!noteKind) return null;

  if (beatSyncPlacement) {
    // Beat-sync mode: ghost at current playhead beat
    const local = screenToLineLocal(
      mouseX, mouseY,
      lineInfo.screenX, lineInfo.screenY,
      lineInfo.rotation, canvasWidth,
    );
    const beat = snapBeat(currentBeat, density);
    const rawX = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, local.noteX));
    const x = xSnapEnabled && lanes > 0
      ? snapX(rawX, lanes)
      : Math.round(rawX);
    return { beat, x, kind: noteKind, above: local.above };
  } else {
    // Normal mode: ghost from perpendicular distance
    const ghostResult = computeGhostNote(
      mouseX, mouseY,
      lineInfo.screenX, lineInfo.screenY,
      lineInfo.rotation,
      line,
      currentTime,
      bpmList,
      canvasWidth, canvasHeight,
      density,
      noteKind,
      xSnapEnabled ? lanes : 0,
    );
    if (!ghostResult) return null;
    return {
      beat: ghostResult.beat,
      x: ghostResult.x,
      kind: ghostResult.kind as NoteKind,
      above: ghostResult.above,
    };
  }
}

// ============================================================
// Timeline Canvas Renderer
//
// Draws the note timeline — the central editing workspace.
//
// Layout (left to right):
//   [Beat#] [Note Area with lane guides]
//
// Event columns have been removed — events are now edited
// in the dedicated Line Event Editor tab.
//
// The timeline scrolls vertically (beats go from bottom to top).
// The indicator line shows the current playback position.
// ============================================================

import type { Note, LineEvent, CurveNoteTrack } from "../types/chart";
import { CANVAS_WIDTH, beatToFloat } from "../types/chart";
import { generateCurveNotes } from "../utils/curveNoteTrack";
import type { DragSelectionRect, PendingNote } from "../stores/editorStore";

// ============================================================
// CONFIGURABLE: Layout constants
// ============================================================

/** Width of the beat number gutter on the left */
const BEAT_GUTTER_WIDTH = 36;

/** Base pixels per beat (multiplied by zoom) */
const BASE_PX_PER_BEAT = 80;

/** Note width in timeline pixels */
const NOTE_TL_WIDTH = 16;

/** Note height in timeline pixels */
const NOTE_TL_HEIGHT = 6;

/** Hold note body width */
const HOLD_TL_WIDTH = 12;

// ============================================================
// Color palette
// ============================================================

const NOTE_COLORS: Record<string, string> = {
  tap: "#48b5ff",
  drag: "#ffd24a",
  flick: "#ff4a6a",
  hold: "#4aff7a",
};

/** Event colors exported for use by KeyframeStrip */
export const EVENT_COLORS: Record<string, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
};

const SELECTION_COLOR = "#90ee90";

// ============================================================
// Renderer
// ============================================================

export interface TimelineRenderParams {
  notes: Note[];
  events: LineEvent[];
  curveNoteTracks?: CurveNoteTrack[];
  currentBeat: number;
  zoom: number;
  density: number;
  lanes: number;
  noteSideFilter: "all" | "above" | "below";
  selectedNoteIndices: number[];
  scrollBeat: number; // The beat at the bottom of the viewport
  canvasWidth: number;
  canvasHeight: number;
  dragSelectionRect?: DragSelectionRect | null;
  pendingNote?: PendingNote | null;
}

export class TimelineRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Get the note area dimensions given a canvas width */
  static getNoteAreaBounds(canvasWidth: number) {
    const noteAreaLeft = BEAT_GUTTER_WIDTH;
    const noteAreaRight = canvasWidth;
    const noteAreaWidth = Math.max(noteAreaRight - noteAreaLeft, 1);
    return { noteAreaLeft, noteAreaRight, noteAreaWidth };
  }

  /** Convert a beat value to a Y pixel position on screen */
  static beatToY(
    beat: number,
    scrollBeat: number,
    zoom: number,
    canvasHeight: number,
  ): number {
    const pxPerBeat = BASE_PX_PER_BEAT * zoom;
    // Bottom of canvas = scrollBeat, going up = increasing beats
    return canvasHeight - (beat - scrollBeat) * pxPerBeat;
  }

  /** Convert a Y pixel position to a beat value */
  static yToBeat(
    y: number,
    scrollBeat: number,
    zoom: number,
    canvasHeight: number,
  ): number {
    const pxPerBeat = BASE_PX_PER_BEAT * zoom;
    return scrollBeat + (canvasHeight - y) / pxPerBeat;
  }

  /** Convert a note's x position (-675..675) to a pixel X in the note area */
  static noteXToPixel(
    noteX: number,
    noteAreaLeft: number,
    noteAreaWidth: number,
  ): number {
    return noteAreaLeft + ((noteX / CANVAS_WIDTH) + 0.5) * noteAreaWidth;
  }

  /** Convert a pixel X in the note area to a note x position (-675..675) */
  static pixelToNoteX(
    pixelX: number,
    noteAreaLeft: number,
    noteAreaWidth: number,
  ): number {
    return ((pixelX - noteAreaLeft) / noteAreaWidth - 0.5) * CANVAS_WIDTH;
  }

  render(params: TimelineRenderParams) {
    const {
      notes, currentBeat, zoom, density, lanes,
      noteSideFilter, selectedNoteIndices,
      scrollBeat, canvasWidth, canvasHeight,
    } = params;
    const ctx = this.ctx;
    const pxPerBeat = BASE_PX_PER_BEAT * zoom;
    const { noteAreaLeft, noteAreaWidth } =
      TimelineRenderer.getNoteAreaBounds(canvasWidth);

    // ---- Clear ----
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ---- Visible beat range ----
    const minBeat = scrollBeat;
    const maxBeat = scrollBeat + canvasHeight / pxPerBeat;

    // ---- Beat grid ----
    this.drawBeatGrid(ctx, minBeat, maxBeat, density, pxPerBeat, scrollBeat, canvasWidth, canvasHeight);

    // ---- Lane guides ----
    this.drawLaneGuides(ctx, lanes, noteAreaLeft, noteAreaWidth, canvasHeight);

    // ---- Notes ----
    const selectedSet = new Set(selectedNoteIndices);

    for (let idx = 0; idx < notes.length; idx++) {
      const note = notes[idx];
      if (noteSideFilter === "above" && !note.above) continue;
      if (noteSideFilter === "below" && note.above) continue;

      const beat = beatToFloat(note.beat);
      if (beat < minBeat - 2 || beat > maxBeat + 2) continue;
      const isSelected = selectedSet.has(idx);
      this.drawNote(ctx, note, beat, isSelected, scrollBeat, zoom, noteAreaLeft, noteAreaWidth, canvasHeight);
    }

    // ---- Curve note track notes (semi-transparent) ----
    if (params.curveNoteTracks) {
      for (const track of params.curveNoteTracks) {
        if (track.from == null || track.to == null) continue;
        const fromIdx = typeof track.from === "number" ? track.from : parseInt(track.from as string);
        const toIdx = typeof track.to === "number" ? track.to : parseInt(track.to as string);
        const fromNote = notes[fromIdx];
        const toNote = notes[toIdx];
        if (!fromNote || !toNote) continue;

        const curveNotes = generateCurveNotes(fromNote, toNote, track);
        for (const cn of curveNotes) {
          const cnBeat = beatToFloat(cn.beat);
          if (cnBeat < minBeat - 2 || cnBeat > maxBeat + 2) continue;
          ctx.globalAlpha = 0.25;
          this.drawNote(ctx, cn, cnBeat, false, scrollBeat, zoom, noteAreaLeft, noteAreaWidth, canvasHeight);
          ctx.globalAlpha = 1;
        }
      }
    }

    // ---- Pending/ghost note ----
    if (params.pendingNote) {
      const pn = params.pendingNote;
      const pnBeat = beatToFloat(pn.beat);
      const pnY = TimelineRenderer.beatToY(pnBeat, scrollBeat, zoom, canvasHeight);
      const pnX = TimelineRenderer.noteXToPixel(pn.x, noteAreaLeft, noteAreaWidth);
      const color = NOTE_COLORS[pn.kind] ?? "#fff";

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      ctx.fillRect(pnX - NOTE_TL_WIDTH / 2, pnY - NOTE_TL_HEIGHT / 2, NOTE_TL_WIDTH, NOTE_TL_HEIGHT);
      ctx.globalAlpha = 1;
    }

    // ---- Drag selection rectangle ----
    if (params.dragSelectionRect) {
      const r = params.dragSelectionRect;
      const rx = Math.min(r.x1, r.x2);
      const ry = Math.min(r.y1, r.y2);
      const rw = Math.abs(r.x2 - r.x1);
      const rh = Math.abs(r.y2 - r.y1);

      ctx.fillStyle = "rgba(144, 238, 144, 0.12)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(144, 238, 144, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // ---- Indicator line (current playback position) ----
    const indicatorY = TimelineRenderer.beatToY(currentBeat, scrollBeat, zoom, canvasHeight);
    if (indicatorY >= 0 && indicatorY <= canvasHeight) {
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, indicatorY);
      ctx.lineTo(canvasWidth, indicatorY);
      ctx.stroke();

      // Small triangle indicator
      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, indicatorY - 5);
      ctx.lineTo(BEAT_GUTTER_WIDTH + 8, indicatorY);
      ctx.lineTo(BEAT_GUTTER_WIDTH, indicatorY + 5);
      ctx.fill();
    }

    // ---- Separator line: beat gutter right edge ----
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BEAT_GUTTER_WIDTH, 0);
    ctx.lineTo(BEAT_GUTTER_WIDTH, canvasHeight);
    ctx.stroke();
  }

  private drawBeatGrid(
    ctx: CanvasRenderingContext2D,
    minBeat: number, maxBeat: number,
    density: number, pxPerBeat: number,
    scrollBeat: number,
    canvasWidth: number, canvasHeight: number,
  ) {
    const step = density > 0 ? 1 / density : 1;
    const startBeat = Math.floor(minBeat * density) / density;

    for (let b = startBeat; b <= maxBeat + step; b += step) {
      const y = TimelineRenderer.beatToY(b, scrollBeat, pxPerBeat / BASE_PX_PER_BEAT, canvasHeight);
      if (y < 0 || y > canvasHeight) continue;

      const isWholeBeat = Math.abs(b - Math.round(b)) < 0.001;

      ctx.strokeStyle = isWholeBeat
        ? "rgba(255, 255, 255, 0.25)"
        : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = isWholeBeat ? 1 : 0.5;

      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Beat number label
      if (isWholeBeat) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round(b).toString(), BEAT_GUTTER_WIDTH - 4, y);
      }
    }
  }

  private drawLaneGuides(
    ctx: CanvasRenderingContext2D,
    lanes: number,
    noteAreaLeft: number, noteAreaWidth: number,
    canvasHeight: number,
  ) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 0.5;

    for (let i = 1; i < lanes; i++) {
      const x = noteAreaLeft + (i / lanes) * noteAreaWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Center lane (brighter)
    const centerX = noteAreaLeft + noteAreaWidth / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvasHeight);
    ctx.stroke();
  }

  private drawNote(
    ctx: CanvasRenderingContext2D,
    note: Note,
    beat: number,
    isSelected: boolean,
    scrollBeat: number, zoom: number,
    noteAreaLeft: number, noteAreaWidth: number,
    canvasHeight: number,
  ) {
    const y = TimelineRenderer.beatToY(beat, scrollBeat, zoom, canvasHeight);
    const x = TimelineRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);
    const color = NOTE_COLORS[note.kind] ?? "#fff";

    // Draw hold body first (behind the note head)
    if (note.kind === "hold" && note.hold_beat) {
      const holdEndBeat = beat + beatToFloat(note.hold_beat);
      const holdEndY = TimelineRenderer.beatToY(holdEndBeat, scrollBeat, zoom, canvasHeight);
      const bodyHeight = y - holdEndY; // y goes down, beats go up

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - HOLD_TL_WIDTH / 2,
        holdEndY,
        HOLD_TL_WIDTH,
        Math.max(bodyHeight, 1),
      );
      ctx.globalAlpha = 1;
    }

    // Note head
    ctx.fillStyle = color;
    ctx.globalAlpha = note.above ? 0.9 : 0.6; // Below notes are dimmer
    ctx.fillRect(
      x - NOTE_TL_WIDTH / 2,
      y - NOTE_TL_HEIGHT / 2,
      NOTE_TL_WIDTH,
      NOTE_TL_HEIGHT,
    );

    // Flick arrow indicator
    if (note.kind === "flick") {
      ctx.beginPath();
      ctx.moveTo(x - 4, y - NOTE_TL_HEIGHT / 2);
      ctx.lineTo(x, y - NOTE_TL_HEIGHT / 2 - 5);
      ctx.lineTo(x + 4, y - NOTE_TL_HEIGHT / 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Selection highlight
    if (isSelected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        x - NOTE_TL_WIDTH / 2 - 2,
        y - NOTE_TL_HEIGHT / 2 - 2,
        NOTE_TL_WIDTH + 4,
        NOTE_TL_HEIGHT + 4,
      );
    }

    ctx.globalAlpha = 1;
  }
}

export { BEAT_GUTTER_WIDTH, BASE_PX_PER_BEAT };

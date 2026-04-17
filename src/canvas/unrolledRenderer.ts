// ============================================================
// Unrolled Canvas Renderer
//
// Draws the "unrolled" note editing view — a linearized 2D grid
// where X = note position on the line (-675..675) and Y = beat.
// This eliminates the non-linear distance computation of the
// game renderer, making note placement intuitive and precise.
//
// Recent change (bug audit #3 + #14):
//   1. drawBeatGrid: replaced floating-point accumulation
//      `for (let b = startBeat; b <= maxBeat + step; b += step)`
//      with integer-indexed iteration `for (let i = ...; i++)` so
//      grid lines don't drift out of alignment with note snap
//      positions as scrollBeat grows. TimelineRenderer already had
//      this fix; unrolled was missed in the dd7871d audit.
//   2. Wrapped the pending-note `setLineDash([4,4])` block in
//      try/finally so an exception can't leave the dash pattern
//      set for subsequent draws that frame.
// ============================================================

import type { Note, CurveNoteTrack } from "../types/chart";
import { CANVAS_WIDTH, beatToFloat } from "../types/chart";
import { generateCurveNotes } from "../utils/curveNoteTrack";
import type { DragSelectionRect, PendingNote } from "../stores/editorStore";
import {
  BEAT_GUTTER_WIDTH,
  BASE_PX_PER_BEAT,
  PLAYHEAD_COLOR,
  SELECTED_COLOR,
  ABOVE_NOTE_COLORS,
  BELOW_NOTE_COLORS,
} from "../constants/canvasConstants";

// ============================================================
// Renderer-specific sizing (only the unrolled view uses these)
// ============================================================

/** Note rectangle width — wider than TimelineRenderer's 16px (more horizontal space) */
const NOTE_WIDTH = 24;

/** Note rectangle height — slightly taller than TimelineRenderer's 6px */
const NOTE_HEIGHT = 8;

/** Hold note body width */
const HOLD_WIDTH = 18;

/** Drag handle size (small square on selected notes) */
const DRAG_HANDLE_SIZE = 5;

// ============================================================
// Overlay note rendering (ghost notes from other lines)
// ============================================================

export interface UnrolledOverlayLine {
  notes: Note[];
  lineIndex: number;
  color: string;
}

// ============================================================
// Render parameters
// ============================================================

export interface UnrolledRenderParams {
  notes: Note[];
  curveNoteTracks?: CurveNoteTrack[];
  currentBeat: number;
  zoom: number;
  density: number;
  verticalLines: number;
  noteSideFilter: "all" | "above" | "below";
  selectedNoteIndices: number[];
  scrollBeat: number;
  canvasWidth: number;
  canvasHeight: number;
  dragSelectionRect?: DragSelectionRect | null;
  pendingNote?: PendingNote | null;
  overlayLines?: UnrolledOverlayLine[];
  overlayOpacity?: number;
  /** Detected onset markers to show as horizontal lines */
  onsetMarkers?: { beat: number; strength: number }[] | null;
  /** Opacity multiplier for onset markers (from settings) */
  onsetOpacity?: number;
}

// ============================================================
// Renderer
// ============================================================

export class UnrolledRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  // ---- Static coordinate conversion methods ----

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

  // ---- Main render method ----

  render(params: UnrolledRenderParams) {
    const {
      notes, currentBeat, zoom, density, verticalLines,
      noteSideFilter, selectedNoteIndices,
      scrollBeat, canvasWidth, canvasHeight,
    } = params;
    const ctx = this.ctx;
    const pxPerBeat = BASE_PX_PER_BEAT * zoom;
    const { noteAreaLeft, noteAreaWidth } =
      UnrolledRenderer.getNoteAreaBounds(canvasWidth);

    // ---- Clear with dark background ----
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#0e1629";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ---- Visible beat range ----
    const minBeat = scrollBeat;
    const maxBeat = scrollBeat + canvasHeight / pxPerBeat;

    // ---- Beat grid ----
    this.drawBeatGrid(ctx, minBeat, maxBeat, density, pxPerBeat, scrollBeat, canvasWidth, canvasHeight);

    // ---- Lane guides ----
    this.drawLaneGuides(ctx, verticalLines, noteAreaLeft, noteAreaWidth, canvasHeight);

    // ---- Region labels (ABOVE / BELOW) ----
    this.drawRegionLabels(ctx, noteAreaLeft, noteAreaWidth, canvasHeight);

    // ---- Judgment line visual (faint horizontal bar at beat 0 if visible) ----
    this.drawJudgmentLine(ctx, scrollBeat, zoom, canvasWidth, canvasHeight);

    // ---- Onset markers (behind notes, after grid) ----
    if (params.onsetMarkers && params.onsetMarkers.length > 0) {
      this.drawOnsetMarkers(
        ctx, params.onsetMarkers,
        minBeat, maxBeat, scrollBeat, zoom,
        canvasWidth, canvasHeight,
        params.onsetOpacity ?? 0.6,
      );
    }

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

    // ---- Curve note track generated notes (semi-transparent) ----
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

    // ---- Overlay notes from other lines (dashed outlines) ----
    if (params.overlayLines && params.overlayLines.length > 0) {
      const overlayAlpha = params.overlayOpacity ?? 0.3;

      for (const overlay of params.overlayLines) {
        for (const note of overlay.notes) {
          const nBeat = beatToFloat(note.beat);
          if (nBeat < minBeat - 2 || nBeat > maxBeat + 2) continue;

          const nY = UnrolledRenderer.beatToY(nBeat, scrollBeat, zoom, canvasHeight);
          const nX = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

          ctx.save();
          ctx.globalAlpha = overlayAlpha;
          ctx.setLineDash([3, 3]);

          // Dashed outline in the overlay line's color
          ctx.strokeStyle = overlay.color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(
            nX - NOTE_WIDTH / 2,
            nY - NOTE_HEIGHT / 2,
            NOTE_WIDTH,
            NOTE_HEIGHT,
          );

          // Faint fill
          ctx.fillStyle = overlay.color;
          ctx.globalAlpha = overlayAlpha * 0.3;
          ctx.fillRect(
            nX - NOTE_WIDTH / 2,
            nY - NOTE_HEIGHT / 2,
            NOTE_WIDTH,
            NOTE_HEIGHT,
          );

          // Hold note body
          if (note.kind === "hold" && note.hold_beat) {
            const holdEnd = nBeat + beatToFloat(note.hold_beat);
            const holdEndY = UnrolledRenderer.beatToY(holdEnd, scrollBeat, zoom, canvasHeight);
            ctx.globalAlpha = overlayAlpha * 0.4;
            ctx.fillRect(
              nX - HOLD_WIDTH / 2,
              Math.min(nY, holdEndY),
              HOLD_WIDTH,
              Math.abs(holdEndY - nY),
            );
          }

          ctx.restore();
        }
      }
    }

    // ---- Pending/ghost note ----
    if (params.pendingNote) {
      const pn = params.pendingNote;
      const pnBeat = beatToFloat(pn.beat);
      const pnY = UnrolledRenderer.beatToY(pnBeat, scrollBeat, zoom, canvasHeight);
      const pnX = UnrolledRenderer.noteXToPixel(pn.x, noteAreaLeft, noteAreaWidth);
      const colorMap = pn.above ? ABOVE_NOTE_COLORS : BELOW_NOTE_COLORS;
      const color = colorMap[pn.kind] ?? "#fff";

      // Bug audit #14: wrap setLineDash in try/finally so an exception
      // in strokeRect can't leak the dash pattern into subsequent
      // draw calls within this frame.
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.fillRect(pnX - NOTE_WIDTH / 2, pnY - NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      try {
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(pnX - NOTE_WIDTH / 2, pnY - NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT);
      } finally {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // ---- Drag selection rectangle ----
    if (params.dragSelectionRect) {
      const r = params.dragSelectionRect;
      const rx = Math.min(r.x1, r.x2);
      const ry = Math.min(r.y1, r.y2);
      const rw = Math.abs(r.x2 - r.x1);
      const rh = Math.abs(r.y2 - r.y1);

      ctx.fillStyle = "rgba(50, 205, 50, 0.10)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(50, 205, 50, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // ---- Playhead indicator (current beat) ----
    const indicatorY = UnrolledRenderer.beatToY(currentBeat, scrollBeat, zoom, canvasHeight);
    if (indicatorY >= -10 && indicatorY <= canvasHeight + 10) {
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, indicatorY);
      ctx.lineTo(canvasWidth, indicatorY);
      ctx.stroke();

      // Small triangle indicator on the gutter edge
      ctx.fillStyle = PLAYHEAD_COLOR;
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

  // ---- Private drawing helpers ----

  private drawBeatGrid(
    ctx: CanvasRenderingContext2D,
    minBeat: number, maxBeat: number,
    density: number, pxPerBeat: number,
    scrollBeat: number,
    canvasWidth: number, canvasHeight: number,
  ) {
    // Bug audit #3: use integer indexing to avoid floating-point drift.
    // The previous loop `for (let b = startBeat; b <= maxBeat + step; b += step)`
    // accumulated ulp errors on each iteration; with density=8 (step=0.125)
    // over a few hundred iterations the grid visibly slipped off the
    // positions where notes actually snap. Iterating with an integer
    // counter and computing `b = i / density` keeps every computed beat
    // mathematically equal to a true snap position (same approach that
    // dd7871d applied to timelineRenderer).
    const safeDensity = density > 0 ? density : 1;
    const step = 1 / safeDensity;

    // Integer bounds in "snap units" — one unit = 1/density beats.
    const iStart = Math.floor(minBeat * safeDensity);
    const iEnd = Math.ceil((maxBeat + step) * safeDensity);

    for (let i = iStart; i <= iEnd; i++) {
      const b = i / safeDensity;
      const y = UnrolledRenderer.beatToY(b, scrollBeat, pxPerBeat / BASE_PX_PER_BEAT, canvasHeight);
      if (y < 0 || y > canvasHeight) continue;

      // Whole-beat check via integer modulo — exact, no ε fuzz needed.
      const isWholeBeat = i % safeDensity === 0;

      ctx.strokeStyle = isWholeBeat
        ? "rgba(255, 255, 255, 0.22)"
        : "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = isWholeBeat ? 1 : 0.5;

      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Beat number label
      if (isWholeBeat) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        // i / safeDensity is a whole integer when isWholeBeat — safe to render directly.
        ctx.fillText((i / safeDensity).toString(), BEAT_GUTTER_WIDTH - 4, y);
      }
    }
  }

  private drawLaneGuides(
    ctx: CanvasRenderingContext2D,
    verticalLines: number,
    noteAreaLeft: number, noteAreaWidth: number,
    canvasHeight: number,
  ) {
    if (verticalLines < 2) return;

    // Draw lines at actual snap positions: i/(N-1) for i = 0..N-1
    // Center line is emphasised ONLY when N is odd (X=0 is a real snap point)
    const isOdd = Number.isInteger(verticalLines) && verticalLines % 2 === 1;
    const centerIdx = (verticalLines - 1) / 2;

    ctx.lineWidth = 0.5;
    for (let i = 0; i < verticalLines; i++) {
      const t = i / (verticalLines - 1);
      const x = noteAreaLeft + t * noteAreaWidth;

      if (i === 0 || i === verticalLines - 1) {
        // Edge lines — slightly brighter than interior
        ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      } else if (isOdd && i === centerIdx) {
        // Center line — only when N is odd (real snap point at X=0)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      } else {
        // Regular interior grid line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
  }

  /** Draw faint "ABOVE" / "BELOW" region labels at the top of the canvas */
  private drawRegionLabels(
    ctx: CanvasRenderingContext2D,
    noteAreaLeft: number, noteAreaWidth: number,
    _canvasHeight: number,
  ) {
    ctx.save();
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.globalAlpha = 0.15;

    // "ABOVE" on the left half, "BELOW" on the right half
    // (this is a visual hint — actual above/below is controlled by Shift key)
    const mid = noteAreaLeft + noteAreaWidth / 2;
    ctx.fillStyle = ABOVE_NOTE_COLORS.tap;
    ctx.fillText("ABOVE", noteAreaLeft + (mid - noteAreaLeft) / 2, 4);
    ctx.fillStyle = BELOW_NOTE_COLORS.tap;
    ctx.fillText("BELOW", mid + (noteAreaLeft + noteAreaWidth - mid) / 2, 4);

    ctx.restore();
  }

  /** Draw a faint judgment line at beat 0 if visible */
  private drawJudgmentLine(
    ctx: CanvasRenderingContext2D,
    scrollBeat: number, zoom: number,
    canvasWidth: number, canvasHeight: number,
  ) {
    const y = UnrolledRenderer.beatToY(0, scrollBeat, zoom, canvasHeight);
    if (y < 0 || y > canvasHeight) return;

    // Thick white bar representing the judgment line
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(BEAT_GUTTER_WIDTH, y - 1.5, canvasWidth - BEAT_GUTTER_WIDTH, 3);

    // Label
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillText("JUDGMENT LINE", BEAT_GUTTER_WIDTH + 4, y - 4);
  }

  /**
   * Draw onset detection markers as horizontal lines across the note area.
   * Same logic as TimelineRenderer — amber lines with strength-scaled opacity.
   */
  private drawOnsetMarkers(
    ctx: CanvasRenderingContext2D,
    markers: { beat: number; strength: number }[],
    minBeat: number,
    maxBeat: number,
    scrollBeat: number,
    zoom: number,
    canvasWidth: number,
    canvasHeight: number,
    opacity: number,
  ) {
    // Binary search for the first visible marker
    let lo = 0;
    let hi = markers.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (markers[mid].beat < minBeat - 0.5) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    for (let i = lo; i < markers.length; i++) {
      const marker = markers[i];
      if (marker.beat > maxBeat + 0.5) break;

      const y = UnrolledRenderer.beatToY(marker.beat, scrollBeat, zoom, canvasHeight);
      if (y < -2 || y > canvasHeight + 2) continue;

      const alpha = marker.strength * opacity;
      if (alpha < 0.02) continue;

      ctx.strokeStyle = `rgba(255, 170, 50, ${alpha})`;
      ctx.lineWidth = Math.max(1, marker.strength * 2.5);

      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Small triangle marker on the left edge for strong onsets
      if (marker.strength > 0.3) {
        ctx.fillStyle = `rgba(255, 170, 50, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(BEAT_GUTTER_WIDTH - 4, y - 2);
        ctx.lineTo(BEAT_GUTTER_WIDTH, y);
        ctx.lineTo(BEAT_GUTTER_WIDTH - 4, y + 2);
        ctx.fill();
      }
    }
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
    const y = UnrolledRenderer.beatToY(beat, scrollBeat, zoom, canvasHeight);
    const x = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

    // Choose color based on above/below state
    const colorMap = note.above ? ABOVE_NOTE_COLORS : BELOW_NOTE_COLORS;
    const color = colorMap[note.kind] ?? "#fff";

    // Draw hold body first (behind the note head)
    if (note.kind === "hold" && note.hold_beat) {
      const holdEndBeat = beat + beatToFloat(note.hold_beat);
      const holdEndY = UnrolledRenderer.beatToY(holdEndBeat, scrollBeat, zoom, canvasHeight);
      const bodyHeight = y - holdEndY; // y goes down, beats go up

      ctx.globalAlpha = 0.30;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - HOLD_WIDTH / 2,
        holdEndY,
        HOLD_WIDTH,
        Math.max(bodyHeight, 1),
      );
      ctx.globalAlpha = 1;

      // Hold tail cap
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - HOLD_WIDTH / 2, holdEndY - 1, HOLD_WIDTH, 3);
      ctx.globalAlpha = 1;
    }

    // Note head rectangle
    ctx.fillStyle = color;
    ctx.globalAlpha = note.above ? 0.9 : 0.85;
    ctx.fillRect(
      x - NOTE_WIDTH / 2,
      y - NOTE_HEIGHT / 2,
      NOTE_WIDTH,
      NOTE_HEIGHT,
    );

    // Flick arrow indicator (upward triangle)
    if (note.kind === "flick") {
      ctx.beginPath();
      ctx.moveTo(x - 5, y - NOTE_HEIGHT / 2);
      ctx.lineTo(x, y - NOTE_HEIGHT / 2 - 6);
      ctx.lineTo(x + 5, y - NOTE_HEIGHT / 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }

    // Below-line indicator: small ▼ below the note
    if (!note.above) {
      ctx.font = "7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillText("\u25BC", x, y + NOTE_HEIGHT / 2 + 1);
    }

    // Selection highlight (green outline + drag handles)
    if (isSelected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = SELECTED_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        x - NOTE_WIDTH / 2 - 2,
        y - NOTE_HEIGHT / 2 - 2,
        NOTE_WIDTH + 4,
        NOTE_HEIGHT + 4,
      );

      // Drag handle: small filled square at the center of the note
      ctx.fillStyle = SELECTED_COLOR;
      ctx.fillRect(
        x - DRAG_HANDLE_SIZE / 2,
        y - DRAG_HANDLE_SIZE / 2,
        DRAG_HANDLE_SIZE,
        DRAG_HANDLE_SIZE,
      );

      // Hold tail drag handle
      if (note.kind === "hold" && note.hold_beat) {
        const holdEndBeat = beat + beatToFloat(note.hold_beat);
        const holdEndY = UnrolledRenderer.beatToY(holdEndBeat, scrollBeat, zoom, canvasHeight);
        ctx.fillStyle = SELECTED_COLOR;
        ctx.fillRect(
          x - DRAG_HANDLE_SIZE / 2,
          holdEndY - DRAG_HANDLE_SIZE / 2,
          DRAG_HANDLE_SIZE,
          DRAG_HANDLE_SIZE,
        );
        // Highlight the tail cap
        ctx.strokeStyle = SELECTED_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - HOLD_WIDTH / 2 - 1, holdEndY - 2, HOLD_WIDTH + 2, 4);
      }
    }

    ctx.globalAlpha = 1;
  }
}

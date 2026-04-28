// ============================================================
// Unrolled Canvas Renderer
//
// Draws the "unrolled" note editing view — a linearized 2D grid
// where X = note position on the line (-675..675) and Y = beat.
// This eliminates the non-linear distance computation of the
// game renderer, making note placement intuitive and precise.
//
// Recent change: per-line events are now rendered alongside notes,
// using EVENT_COLORS for kind-based color coding. Three layers:
//   - Span tint (faint wash from start_beat → end_beat)        [opt-in via settings]
//   - Boundary lines (solid at start, dashed at end)
//   - Gutter diamonds with single-letter kind labels
// Notes and events both honor independent tri-state visibility
// (all / ghost / none) — see LayerVisibility in editorStore.
//
// The below-note ▼ glyph was removed; above/below differentiation
// continues via the ABOVE_NOTE_COLORS vs BELOW_NOTE_COLORS palette
// split (see constants/canvasConstants.ts).
//
// Bug audit references kept from earlier passes:
//   #3:  drawBeatGrid uses integer-indexed iteration (vs ulp-drifting
//        float accumulation) so grid lines stay snap-aligned.
//   #14: pending-note setLineDash wrapped in try/finally so an
//        exception can't leak the dash pattern into later draws.
// ============================================================

import type { Note, CurveNoteTrack, LineEvent, LineEventKind } from "../types/chart";
import { CANVAS_WIDTH, beatToFloat } from "../types/chart";
import { generateCurveNotes } from "../utils/curveNoteTrack";
import type { DragSelectionRect, PendingNote, LayerVisibility } from "../stores/editorStore";
import {
  BEAT_GUTTER_WIDTH,
  BASE_PX_PER_BEAT,
  PLAYHEAD_COLOR,
  SELECTED_COLOR,
  ABOVE_NOTE_COLORS,
  BELOW_NOTE_COLORS,
} from "../constants/canvasConstants";
import { EVENT_COLORS } from "../constants/eventColors";

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

/**
 * Extra width added to the beat gutter when events are visible, to
 * fit per-event diamond markers. The base BEAT_GUTTER_WIDTH (36 px)
 * is shared with TimelineRenderer and intentionally untouched in
 * canvasConstants.ts; this extension is unrolled-only.
 */
export const EVENT_GUTTER_EXTRA = 22;

/** Half-size of the event diamond marker rendered in the gutter. */
const EVENT_DIAMOND_HALF = 4;

/** Hit-test slop around an event diamond, in px. */
export const EVENT_DIAMOND_HIT_RADIUS = 6;

/** Globalalpha multiplier applied to a layer when its visibility === "ghost". */
const GHOST_ALPHA = 0.3;

/**
 * Single-letter kind tag drawn next to the gutter diamond. Mirrors
 * KIND_SHORT in constants/eventConfig.ts but kept local so unrolledRenderer
 * doesn't pull in that file's React-flavored constants.
 */
const EVENT_KIND_LETTER: Record<LineEventKind, string> = {
  x: "X", y: "Y", rotation: "R", opacity: "O", speed: "S",
  scale_x: "x", scale_y: "y", color: "C", text: "T", incline: "I", gif: "G",
};

/**
 * Compute the effective beat-gutter width for the unrolled view given
 * the current event visibility. When events are hidden, the gutter
 * collapses back to the shared base width so no horizontal space is
 * wasted; when events are visible (all or ghost), it expands to hold
 * the per-event diamonds.
 */
export function effectiveGutterWidth(eventVisibility: LayerVisibility): number {
  return eventVisibility === "none"
    ? BEAT_GUTTER_WIDTH
    : BEAT_GUTTER_WIDTH + EVENT_GUTTER_EXTRA;
}

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
  // ---- Events ----
  /** Per-line events for the active line. Pass [] to suppress event drawing. */
  events?: LineEvent[];
  /** Indices into `events` that are currently selected; gets a white outline. */
  selectedEventIndices?: number[];
  /** Visibility for the notes layer. Default "all". */
  noteVisibility?: LayerVisibility;
  /** Visibility for the events layer. Default "all". */
  eventVisibility?: LayerVisibility;
  /** Whether to draw the faint full-width tint between event start and end. */
  showEventSpanTints?: boolean;
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

  /**
   * Get the note area dimensions given a canvas width.
   *
   * The optional `gutterWidth` lets the unrolled view widen the beat
   * gutter to hold per-event diamonds (see effectiveGutterWidth above).
   * Defaults to BEAT_GUTTER_WIDTH so callers that don't care about
   * events still get the historical layout.
   *
   * NOTE: callers in UnrolledCanvas.tsx that hit-test mouse coords
   * MUST pass the same gutterWidth used at render time, otherwise
   * note hit-tests will skew by EVENT_GUTTER_EXTRA pixels.
   */
  static getNoteAreaBounds(canvasWidth: number, gutterWidth: number = BEAT_GUTTER_WIDTH) {
    const noteAreaLeft = gutterWidth;
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
    const noteVisibility: LayerVisibility = params.noteVisibility ?? "all";
    const eventVisibility: LayerVisibility = params.eventVisibility ?? "all";
    const gutterWidth = effectiveGutterWidth(eventVisibility);
    const { noteAreaLeft, noteAreaWidth } =
      UnrolledRenderer.getNoteAreaBounds(canvasWidth, gutterWidth);

    // ---- Clear with dark background ----
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#0e1629";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ---- Visible beat range ----
    const minBeat = scrollBeat;
    const maxBeat = scrollBeat + canvasHeight / pxPerBeat;

    // ---- Beat grid ----
    this.drawBeatGrid(ctx, minBeat, maxBeat, density, pxPerBeat, scrollBeat, canvasWidth, canvasHeight, gutterWidth);

    // ---- Lane guides ----
    this.drawLaneGuides(ctx, verticalLines, noteAreaLeft, noteAreaWidth, canvasHeight);

    // ---- Region labels (ABOVE / BELOW) ----
    this.drawRegionLabels(ctx, noteAreaLeft, noteAreaWidth, canvasHeight);

    // ---- Judgment line visual (faint horizontal bar at beat 0 if visible) ----
    this.drawJudgmentLine(ctx, scrollBeat, zoom, canvasWidth, canvasHeight, gutterWidth);

    // ---- Onset markers (behind notes, after grid) ----
    if (params.onsetMarkers && params.onsetMarkers.length > 0) {
      this.drawOnsetMarkers(
        ctx, params.onsetMarkers,
        minBeat, maxBeat, scrollBeat, zoom,
        canvasWidth, canvasHeight,
        params.onsetOpacity ?? 0.6,
        gutterWidth,
      );
    }

    // ---- Events: span tints + boundaries (drawn behind notes) ----
    // Wrapped in a visibility wrapper that no-ops on "none" and sets
    // globalAlpha = 0.3 on "ghost". The wrapper save/restores so we
    // never leak globalAlpha into subsequent passes.
    const events = params.events ?? [];
    const showSpanTints = params.showEventSpanTints ?? true;
    if (events.length > 0) {
      this.withVisibility(eventVisibility, () => {
        this.drawEventSpansAndBoundaries(
          ctx, events, minBeat, maxBeat,
          scrollBeat, zoom,
          noteAreaLeft, noteAreaWidth, canvasHeight,
          showSpanTints,
        );
      });
    }

    // ---- Notes ----
    // Wrapped in a visibility wrapper. When "ghost" the entire notes
    // pass (heads, holds, selection rings, drag handles) gets dimmed
    // uniformly via globalAlpha — separate from per-note `alpha` field.
    this.withVisibility(noteVisibility, () => {
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

      // Curve note track generated notes (semi-transparent).
      // Kept inside the notes-visibility wrapper so they hide/ghost
      // with notes. The 0.25 multiplier is composed against the
      // wrapper's globalAlpha (e.g. 0.3 in ghost mode) instead of
      // overwriting it absolutely.
      if (params.curveNoteTracks) {
        const baseAlpha = ctx.globalAlpha;
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
            ctx.globalAlpha = baseAlpha * 0.25;
            this.drawNote(ctx, cn, cnBeat, false, scrollBeat, zoom, noteAreaLeft, noteAreaWidth, canvasHeight);
            ctx.globalAlpha = baseAlpha;
          }
        }
      }
    });

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
    // Anchored at the right edge of the *full* gutter (after any
    // event-marker extension) so it doesn't bleed into the diamonds.
    const indicatorY = UnrolledRenderer.beatToY(currentBeat, scrollBeat, zoom, canvasHeight);
    if (indicatorY >= -10 && indicatorY <= canvasHeight + 10) {
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gutterWidth, indicatorY);
      ctx.lineTo(canvasWidth, indicatorY);
      ctx.stroke();

      // Small triangle indicator on the gutter edge
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.beginPath();
      ctx.moveTo(gutterWidth, indicatorY - 5);
      ctx.lineTo(gutterWidth + 8, indicatorY);
      ctx.lineTo(gutterWidth, indicatorY + 5);
      ctx.fill();
    }

    // ---- Separator lines ----
    // Inner: between beat numbers and the (possibly empty) event column.
    // Outer: between the gutter and the note area.
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    if (eventVisibility !== "none") {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(BEAT_GUTTER_WIDTH, 0);
      ctx.lineTo(BEAT_GUTTER_WIDTH, canvasHeight);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
    }
    ctx.beginPath();
    ctx.moveTo(gutterWidth, 0);
    ctx.lineTo(gutterWidth, canvasHeight);
    ctx.stroke();

    // ---- Event gutter diamonds (drawn last, on top of separators) ----
    if (events.length > 0 && eventVisibility !== "none") {
      this.withVisibility(eventVisibility, () => {
        this.drawEventGutterMarkers(
          ctx, events,
          minBeat, maxBeat, scrollBeat, zoom,
          canvasHeight,
          new Set(params.selectedEventIndices ?? []),
        );
      });
    }
  }

  /**
   * Apply a layer's visibility state to a draw callback.
   * - "none":  skip entirely
   * - "ghost": save → globalAlpha = GHOST_ALPHA → draw → restore
   * - "all":   draw at full opacity
   * The save/restore pair guarantees no globalAlpha leak across passes
   * even if the callback throws (mirrors the bug-audit-#14 pattern).
   */
  private withVisibility(visibility: LayerVisibility, draw: () => void) {
    if (visibility === "none") return;
    if (visibility === "ghost") {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
      try { draw(); } finally { ctx.restore(); }
      return;
    }
    draw();
  }

  // ---- Private drawing helpers ----

  private drawBeatGrid(
    ctx: CanvasRenderingContext2D,
    minBeat: number, maxBeat: number,
    density: number, pxPerBeat: number,
    scrollBeat: number,
    canvasWidth: number, canvasHeight: number,
    gutterWidth: number,
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
      ctx.moveTo(gutterWidth, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Beat number label — pinned to the original beat-number column,
      // never the extended event column.
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
    gutterWidth: number,
  ) {
    const y = UnrolledRenderer.beatToY(0, scrollBeat, zoom, canvasHeight);
    if (y < 0 || y > canvasHeight) return;

    // Thick white bar representing the judgment line
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(gutterWidth, y - 1.5, canvasWidth - gutterWidth, 3);

    // Label
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillText("JUDGMENT LINE", gutterWidth + 4, y - 4);
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
    gutterWidth: number,
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
      ctx.moveTo(gutterWidth, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Small triangle marker on the left edge for strong onsets.
      // Triangle is anchored just inside the note area, not the
      // beat-number column, so it doesn't collide with event diamonds.
      if (marker.strength > 0.3) {
        ctx.fillStyle = `rgba(255, 170, 50, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(gutterWidth - 4, y - 2);
        ctx.lineTo(gutterWidth, y);
        ctx.lineTo(gutterWidth - 4, y + 2);
        ctx.fill();
      }
    }
  }

  /**
   * Draw event spans (faint full-width tint between start_beat and
   * end_beat) and boundary lines (solid at start, dashed at end) for
   * each event, color-coded by kind via EVENT_COLORS.
   *
   * The span tint is opt-in via `showSpanTints` (settings →
   * unrolledShowEventSpanTints). On busy charts where many event
   * regions overlap, tints stack and the canvas reads muddy; turning
   * them off keeps just the clearer boundary-line treatment.
   */
  private drawEventSpansAndBoundaries(
    ctx: CanvasRenderingContext2D,
    events: LineEvent[],
    minBeat: number, maxBeat: number,
    scrollBeat: number, zoom: number,
    noteAreaLeft: number, noteAreaWidth: number,
    canvasHeight: number,
    showSpanTints: boolean,
  ) {
    for (const evt of events) {
      const startB = beatToFloat(evt.start_beat);
      const endB = beatToFloat(evt.end_beat);
      // Cull off-screen events.
      if (endB < minBeat - 0.5 || startB > maxBeat + 0.5) continue;

      const color = EVENT_COLORS[evt.kind] ?? "#888";
      const yStart = UnrolledRenderer.beatToY(startB, scrollBeat, zoom, canvasHeight);
      const yEnd   = UnrolledRenderer.beatToY(endB,   scrollBeat, zoom, canvasHeight);

      // Span tint — full width, ~5% alpha. Skipped when the user has
      // disabled span tints in settings.
      if (showSpanTints) {
        ctx.fillStyle = color + "0d"; // 0x0d ≈ 5% alpha
        ctx.fillRect(
          noteAreaLeft,
          Math.min(yStart, yEnd),
          noteAreaWidth,
          Math.abs(yEnd - yStart),
        );
      }

      // Start boundary — 2 px solid, ~65% alpha.
      ctx.strokeStyle = color + "a6"; // 0xa6 ≈ 65%
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(noteAreaLeft, yStart);
      ctx.lineTo(noteAreaLeft + noteAreaWidth, yStart);
      ctx.stroke();

      // End boundary — 1 px dashed, ~30% alpha. Dashed pattern wrapped
      // in save/restore so the dash doesn't leak into later strokes
      // (mirrors the bug-audit-#14 pattern).
      ctx.save();
      try {
        ctx.strokeStyle = color + "4d"; // 0x4d ≈ 30%
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(noteAreaLeft, yEnd);
        ctx.lineTo(noteAreaLeft + noteAreaWidth, yEnd);
        ctx.stroke();
      } finally {
        ctx.restore();
      }
    }
  }

  /**
   * Draw event diamond markers in the extended event-gutter column.
   *
   * Multiple events at the same start beat stack horizontally inside
   * the gutter so the user can see and click each one individually.
   * Each diamond is followed by a faint single-letter kind tag.
   *
   * Hit-testing in UnrolledCanvas.tsx must use the same horizontal
   * stacking logic — see hitTestEventMarker there.
   */
  private drawEventGutterMarkers(
    ctx: CanvasRenderingContext2D,
    events: LineEvent[],
    minBeat: number, maxBeat: number,
    scrollBeat: number, zoom: number,
    canvasHeight: number,
    selectedSet: Set<number>,
  ) {
    // Group event indices by their start_beat so we can stack diamonds
    // horizontally for events that share a beat. Use beatToFloat to
    // collapse equivalent rational beats (e.g. [4,0,1] and [4,0,2]).
    const byBeat = new Map<number, number[]>();
    for (let i = 0; i < events.length; i++) {
      const sb = beatToFloat(events[i].start_beat);
      if (sb < minBeat - 0.5 || sb > maxBeat + 0.5) continue;
      const list = byBeat.get(sb);
      if (list) list.push(i); else byBeat.set(sb, [i]);
    }

    const innerStart = BEAT_GUTTER_WIDTH + 3; // small left padding inside the event gutter
    const colWidth = (EVENT_GUTTER_EXTRA - 4) / 2; // fits up to 2 stacked diamonds before clipping

    for (const [beat, idxList] of byBeat) {
      const y = UnrolledRenderer.beatToY(beat, scrollBeat, zoom, canvasHeight);
      if (y < -10 || y > canvasHeight + 10) continue;

      idxList.forEach((idx, slot) => {
        const evt = events[idx];
        const cx = innerStart + slot * colWidth + colWidth / 2;
        // Clip — additional events past the visible column are dropped
        // rather than overflowing into the note area.
        if (cx > BEAT_GUTTER_WIDTH + EVENT_GUTTER_EXTRA - 1) return;

        const color = EVENT_COLORS[evt.kind] ?? "#888";
        const isSel = selectedSet.has(idx);

        // Diamond
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, y - EVENT_DIAMOND_HALF);
        ctx.lineTo(cx + EVENT_DIAMOND_HALF, y);
        ctx.lineTo(cx, y + EVENT_DIAMOND_HALF);
        ctx.lineTo(cx - EVENT_DIAMOND_HALF, y);
        ctx.closePath();
        ctx.fill();

        if (isSel) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Single-letter kind tag — only on the rightmost slot of the
        // stack to avoid overlap. Faint so it doesn't compete with
        // beat numbers in the adjacent column.
        if (slot === idxList.length - 1) {
          const letter = EVENT_KIND_LETTER[evt.kind] ?? "?";
          ctx.fillStyle = color + "cc"; // ~80%
          ctx.font = "bold 8px monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const tagX = cx + EVENT_DIAMOND_HALF + 2;
          if (tagX < BEAT_GUTTER_WIDTH + EVENT_GUTTER_EXTRA - 1) {
            ctx.fillText(letter, tagX, y);
          }
        }
      });
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

    // Compose alpha against the wrapper's current globalAlpha so the
    // ghost-mode dim (0.3 set in withVisibility) actually applies.
    // Setting `ctx.globalAlpha = X` is absolute, not multiplicative —
    // so we read the base once and multiply locally.
    const baseAlpha = ctx.globalAlpha;

    // Draw hold body first (behind the note head)
    if (note.kind === "hold" && note.hold_beat) {
      const holdEndBeat = beat + beatToFloat(note.hold_beat);
      const holdEndY = UnrolledRenderer.beatToY(holdEndBeat, scrollBeat, zoom, canvasHeight);
      const bodyHeight = y - holdEndY; // y goes down, beats go up

      ctx.globalAlpha = baseAlpha * 0.30;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - HOLD_WIDTH / 2,
        holdEndY,
        HOLD_WIDTH,
        Math.max(bodyHeight, 1),
      );

      // Hold tail cap
      ctx.fillStyle = color;
      ctx.globalAlpha = baseAlpha * 0.5;
      ctx.fillRect(x - HOLD_WIDTH / 2, holdEndY - 1, HOLD_WIDTH, 3);
    }

    // Note head rectangle
    ctx.fillStyle = color;
    ctx.globalAlpha = baseAlpha * (note.above ? 0.9 : 0.85);
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
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.fill();
    }

    // (Per-note below-line glyph removed: above/below differentiation
    // is conveyed by the ABOVE_NOTE_COLORS vs BELOW_NOTE_COLORS palette
    // split — see canvasConstants.ts. The full-canvas "ABOVE / BELOW"
    // header tint provides one-time orientation.)

    // Selection highlight (green outline + drag handles).
    // Honors the layer dim too — selection rings on ghosted notes
    // also fade so they don't draw the eye to non-interactive content.
    if (isSelected) {
      ctx.globalAlpha = baseAlpha;
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

    // Restore so subsequent drawNote calls (and curve-track loop) see
    // the wrapper's baseAlpha, not whatever this method last set.
    ctx.globalAlpha = baseAlpha;
  }
}

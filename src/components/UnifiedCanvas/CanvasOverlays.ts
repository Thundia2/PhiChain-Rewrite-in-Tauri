// ============================================================
// Canvas Overlays — Drawing for Unified Canvas
//
// Pure drawing functions for overlays on top of the GameRenderer
// output. Includes: interactive handles, selection rectangles,
// drag ghost lines, rotation snap guides, bookmark markers,
// pattern ghost notes, X-snap grid, line path preview, and
// screen-space HUD indicators (record mode, step record, cursor).
//
// Recent change: Added 5 note placement features:
// - drawGhostBeatLabel() — floating beat label near cursor (Feature C)
// - drawXSnapGrid() now accepts activeX param for lane highlight (Feature E)
// - drawBeatGrid() — perpendicular beat subdivision ticks (Feature A)
// - drawEraserPendingMarks() + drawEraserCountIndicator() — drag-erase visual feedback (Feature B)
// ============================================================

import type { RenderedLineInfo } from "../../canvas/gameRenderer";
import type { Bookmark } from "../../types/bookmark";
import type { LineEvent, EventLayer, Beat } from "../../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../../types/chart";
import { evaluateLineEventsWithLayers, distanceAt } from "../../canvas/events";
import { snapBeat, formatBeat, floatToBeat } from "../../utils/beat";
import type { BpmList } from "../../utils/bpmList";
import { formatStepSize } from "../../utils/stepPresets";

// ============================================================
// Constants (matching EventCanvasRenderer)
// ============================================================

const HANDLE_RADIUS = 8;
const ROTATION_HANDLE_RADIUS = 6;
const LINE_HALF_LENGTH = 200; // pixels at scale 1 in EventCanvas coords

// ============================================================
// Handle Drawing
// ============================================================

/**
 * Draw the translate handle (blue circle with crosshair) at the
 * selected line's center position.
 */
export function drawTranslateHandle(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  opacity: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0.4, opacity);

  // Filled circle
  ctx.fillStyle = "rgba(50, 150, 255, 0.6)";
  ctx.strokeStyle = "#3296ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screenX, screenY, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Crosshair inside
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(screenX - 4, screenY);
  ctx.lineTo(screenX + 4, screenY);
  ctx.moveTo(screenX, screenY - 4);
  ctx.lineTo(screenX, screenY + 4);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw the rotation handle (orange circle at the line endpoint)
 * with a small arc indicator.
 */
export function drawRotationHandle(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  rotation: number,
  canvasWidth: number,
): void {
  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = LINE_HALF_LENGTH * scale;
  const handleX = screenX + Math.cos(rotation) * (halfLen + 15);
  const handleY = screenY + Math.sin(rotation) * (halfLen + 15);

  ctx.save();

  ctx.fillStyle = "rgba(255, 180, 50, 0.6)";
  ctx.strokeStyle = "#ffb432";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(handleX, handleY, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rotation arc indicator
  ctx.strokeStyle = "rgba(255, 180, 50, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(screenX, screenY, halfLen + 15, rotation - 0.3, rotation + 0.3);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw all overlays for the selected line: translate + rotation handles.
 */
export function drawLineHandles(
  ctx: CanvasRenderingContext2D,
  lineInfo: RenderedLineInfo,
  canvasWidth: number,
): void {
  // The rotation stored in RenderedLineInfo is the raw radian value
  // from evaluateLineEventsWithLayers. The gameRenderer applies
  // ctx.rotate(-state.rotation), so the screen rotation is negated.
  // For handle positioning, we use the negated rotation matching screen space.
  const screenRotation = -lineInfo.rotation;

  drawTranslateHandle(ctx, lineInfo.screenX, lineInfo.screenY, lineInfo.opacity);
  drawRotationHandle(ctx, lineInfo.screenX, lineInfo.screenY, screenRotation, canvasWidth);
}

/**
 * Draw a ghost/preview line during a translate or rotation drag.
 * Shows a semi-transparent line at the drag destination.
 */
export function drawDragGhostLine(
  ctx: CanvasRenderingContext2D,
  ghostX: number,
  ghostY: number,
  ghostRotation: number, // radians (screen rotation, already negated)
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Convert from Phigros canvas coords to screen coords
  const screenX = canvasWidth / 2 + (ghostX / CANVAS_WIDTH) * canvasWidth;
  const screenY = canvasHeight / 2 - (ghostY / CANVAS_HEIGHT) * canvasHeight;

  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = LINE_HALF_LENGTH * scale;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ghostRotation);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "rgba(100, 200, 255, 0.6)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-halfLen, 0);
  ctx.lineTo(halfLen, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw radial snap guide lines during rotation dragging.
 */
export function drawRotationSnapGuides(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  canvasWidth: number,
  snapDegrees: number,
): void {
  if (snapDegrees <= 0) return;

  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = LINE_HALF_LENGTH * scale;
  const guideLen = halfLen + 30;
  const count = Math.floor(360 / snapDegrees);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 180, 50, 0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);

  for (let i = 0; i < count; i++) {
    const angleDeg = i * snapDegrees - 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    const endX = centerX + Math.cos(angleRad) * guideLen;
    const endY = centerY + Math.sin(angleRad) * guideLen;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a selection rectangle for drag-select.
 */
export function drawSelectionRect(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  ctx.save();
  ctx.fillStyle = "rgba(50, 150, 255, 0.15)";
  ctx.strokeStyle = "rgba(50, 150, 255, 0.6)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

// ============================================================
// Hit-Testing for Handles
// ============================================================

/**
 * Get the rotation handle's screen position for a given line.
 */
export function getRotationHandlePosition(
  lineScreenX: number,
  lineScreenY: number,
  rotation: number, // screen-space rotation (negated)
  canvasWidth: number,
): { x: number; y: number } {
  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = LINE_HALF_LENGTH * scale;
  return {
    x: lineScreenX + Math.cos(rotation) * (halfLen + 15),
    y: lineScreenY + Math.sin(rotation) * (halfLen + 15),
  };
}

/**
 * Hit-test the translate handle (circle at line center).
 * Returns true if the mouse is within the handle's clickable area.
 */
export function hitTestTranslateHandle(
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
): boolean {
  const dx = mouseX - lineScreenX;
  const dy = mouseY - lineScreenY;
  return dx * dx + dy * dy <= (HANDLE_RADIUS + 4) * (HANDLE_RADIUS + 4);
}

/**
 * Hit-test the rotation handle (circle at line endpoint).
 * Returns true if the mouse is within the handle's clickable area.
 */
export function hitTestRotationHandle(
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
  rotation: number, // screen-space rotation (negated)
  canvasWidth: number,
): boolean {
  const { x: handleX, y: handleY } = getRotationHandlePosition(
    lineScreenX, lineScreenY, rotation, canvasWidth,
  );
  const dx = mouseX - handleX;
  const dy = mouseY - handleY;
  return dx * dx + dy * dy <= (ROTATION_HANDLE_RADIUS + 4) * (ROTATION_HANDLE_RADIUS + 4);
}

/**
 * Hit-test the line body (wide rectangle along the line).
 * Used as a fallback when neither handle is clicked, for selecting
 * or starting a translate drag.
 */
export function hitTestLineBody(
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
  rotation: number, // screen-space rotation (negated)
  canvasWidth: number,
): boolean {
  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = LINE_HALF_LENGTH * scale;

  // Transform mouse to line-local coordinates
  const dx = mouseX - lineScreenX;
  const dy = mouseY - lineScreenY;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return Math.abs(localX) <= halfLen + 10 && Math.abs(localY) <= 12;
}

// ============================================================
// Scene Overlays (extracted from UnifiedCanvas render loop)
// ============================================================

/**
 * Draw bookmark diamond markers on the canvas.
 * Bookmarks fade based on distance from the current beat and
 * render with selection-aware sizing and stroke styling.
 */
export function drawBookmarkOverlay(
  ctx: CanvasRenderingContext2D,
  bookmarks: Bookmark[],
  currentBeat: number,
  visibilityRange: number,
  selectedBookmarkIds: string[],
  renderLines: RenderedLineInfo[],
  canvasWidth: number,
): void {
  for (const bm of bookmarks) {
    // Convert beat tuple to float for distance check
    const bmBeat = bm.beat[0] + bm.beat[1] / bm.beat[2];
    if (Math.abs(bmBeat - currentBeat) > visibilityRange) continue;

    // Find the rendered line this bookmark belongs to
    const lineInfo = renderLines.find((l) => l.lineIndex === bm.lineIndex);
    if (!lineInfo) continue;

    // Compute fade based on distance from current beat
    const distance = Math.abs(bmBeat - currentBeat);
    const fadeFactor = 1 - (distance / visibilityRange);

    // Position the bookmark along the line using its X coordinate
    const bmX = (bm.x / CANVAS_WIDTH) * canvasWidth;
    const cos = Math.cos(-lineInfo.rotation);
    const sin = Math.sin(-lineInfo.rotation);
    const bmScreenX = lineInfo.screenX + bmX * cos * lineInfo.scaleX;
    const bmScreenY = lineInfo.screenY + bmX * sin * lineInfo.scaleY;

    const isSelected = selectedBookmarkIds.includes(bm.id);
    const size = isSelected ? 10 : 8;

    // Draw diamond shape
    ctx.save();
    ctx.translate(bmScreenX, bmScreenY);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();

    ctx.fillStyle = bm.color;
    ctx.globalAlpha = 0.5 + (fadeFactor * 0.5);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = bm.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = fadeFactor * 0.6;
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw semi-transparent ghost note circles for the pattern tool.
 * Color-coded by note kind: tap=blue, drag=green, flick=red, hold=orange.
 */
export function drawPatternGhostNotes(
  ctx: CanvasRenderingContext2D,
  ghostNotes: ReadonlyArray<{ x: number; beat: number; kind: string; above: boolean }>,
  lineInfo: RenderedLineInfo,
  canvasWidth: number,
): void {
  const cos = Math.cos(-lineInfo.rotation);
  const sin = Math.sin(-lineInfo.rotation);

  ctx.save();
  ctx.globalAlpha = 0.45;
  for (const ghost of ghostNotes) {
    // Convert note X (Phigros coords, -675..675) to screen position
    const noteX = (ghost.x / CANVAS_WIDTH) * canvasWidth;
    const sx = lineInfo.screenX + noteX * cos * lineInfo.scaleX;
    const sy = lineInfo.screenY + noteX * sin * lineInfo.scaleY;

    const size = 6;
    ctx.fillStyle = ghost.kind === "tap" ? "#4fc3f7"
      : ghost.kind === "drag" ? "#aed581"
      : ghost.kind === "flick" ? "#ef5350"
      : "#ffb74d"; // hold

    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();

    // Small white border for visibility
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw purple tick marks perpendicular to the selected line at
 * each X-snap position. Visualizes the snap grid for note placement.
 */
export function drawXSnapGrid(
  ctx: CanvasRenderingContext2D,
  snapPositions: number[],
  lineInfo: RenderedLineInfo,
  canvasWidth: number,
  activeX: number | null = null,
): void {
  const cos = Math.cos(-lineInfo.rotation);
  const sin = Math.sin(-lineInfo.rotation);

  ctx.save();

  // Perpendicular direction for tick marks
  const perpX = -sin;
  const perpY = cos;
  const tickLen = 30; // pixels above/below the line

  for (const xPos of snapPositions) {
    // Is this the active (closest to cursor) lane?
    const isActive = activeX !== null && Math.abs(xPos - activeX) < 0.5;

    // Active lane: brighter and wider; others: subtle background grid
    ctx.globalAlpha = isActive ? 0.45 : 0.12;
    ctx.strokeStyle = "#8b5cf6"; // Purple accent
    ctx.lineWidth = isActive ? 2 : 1;

    // Convert note X (Phigros coords) to screen position along the line
    const noteScreenX = (xPos / CANVAS_WIDTH) * canvasWidth;
    const sx = lineInfo.screenX + noteScreenX * cos * lineInfo.scaleX;
    const sy = lineInfo.screenY + noteScreenX * sin * lineInfo.scaleY;

    // Active lane gets a taller tick for extra visibility
    const currentTickLen = isActive ? tickLen * 1.5 : tickLen;

    ctx.beginPath();
    ctx.moveTo(sx - perpX * currentTickLen, sy - perpY * currentTickLen);
    ctx.lineTo(sx + perpX * currentTickLen, sy + perpY * currentTickLen);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw perpendicular beat grid lines radiating away from the selected line.
 *
 * For each beat subdivision within [currentBeat, currentBeat + beatsAhead],
 * computes the perpendicular pixel distance from the line where a note at
 * that beat would render, then draws a short tick mark along the line.
 *
 * Uses the same rendering formula as gameRenderer:
 *   rawY = (noteDistance - currentDistance) * distanceScale / bpmFactor
 * where noteDistance = distanceAt(speedEvents, noteTime, bpmTimeAt)
 *
 * Ticks are batched by style tier (whole/half/sub) for performance — this
 * produces 3 stroke() calls instead of ~512 at density 32 with 8 beats.
 * Uses Math.abs(rawY) and continue (not break) for negative speed events.
 *
 * @param ctx           - Canvas 2D context (already in viewport transform)
 * @param lineInfo      - RenderedLineInfo for the selected line
 * @param line          - The Line data (for speed events + bpmFactor)
 * @param bpmList       - BpmList for beat↔time conversion
 * @param currentTime   - Current playback time (offset-adjusted)
 * @param currentBeat   - Current beat (float)
 * @param density       - Beat grid subdivision (e.g. 4 = quarter beats)
 * @param beatsAhead    - How many beats ahead to draw
 * @param canvasWidth   - Canvas width in pixels
 * @param canvasHeight  - Canvas height in pixels
 */
export function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  lineInfo: RenderedLineInfo,
  line: { events: LineEvent[]; event_layers?: EventLayer[]; bpm_factor?: number },
  bpmList: BpmList,
  currentTime: number,
  currentBeat: number,
  density: number,
  beatsAhead: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const speedEvents = line.events.filter((e) => e.kind === "speed");
  const bpmTimeAt = (beat: Beat) => bpmList.timeAt(beat);
  const distanceScale = canvasHeight * (120.0 / 900.0);
  const bpmFactor = line.bpm_factor ?? 1;

  // Current distance (baseline for all offsets)
  const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);

  // Line geometry
  const screenRot = -lineInfo.rotation;
  const cos = Math.cos(screenRot);
  const sin = Math.sin(screenRot);
  const scale = canvasWidth / CANVAS_WIDTH;
  const halfLen = 200 * scale; // LINE_HALF_LENGTH * scale

  // Perpendicular direction (rotated 90° from line direction)
  const perpX = -sin;
  const perpY = cos;

  ctx.save();

  // Snap the starting beat to the grid
  const startBeat = Math.ceil(currentBeat * density) / density;
  const endBeat = currentBeat + beatsAhead;

  // ---- Batch ticks by style tier to minimize stroke() calls ----
  // Each tier collects path segments, then strokes once at the end.
  const wholePath: Array<[number, number, number, number]> = [];
  const halfPath: Array<[number, number, number, number]> = [];
  const subPath: Array<[number, number, number, number]> = [];
  const labels: Array<{ text: string; x: number; y: number }> = [];

  for (let b = startBeat; b <= endBeat; b += 1 / density) {
    // Convert this beat to time, then to distance
    const beatTuple = floatToBeat(b);
    const noteTime = bpmList.timeAt(beatTuple);
    const noteDistance = distanceAt(speedEvents, noteTime, bpmTimeAt);

    // Pixel offset from line (same formula as gameRenderer)
    // Use Math.abs() to handle negative speed events correctly
    const rawY = ((noteDistance - currentDistance) * distanceScale) / bpmFactor;
    const absY = Math.abs(rawY);
    if (absY < 2) continue; // Too close to line, skip
    if (absY > canvasHeight) continue; // Off screen — continue, don't break (non-monotonic with negative speed)

    // Is this a whole beat or a subdivision?
    const isWholeBeat = Math.abs(b - Math.round(b)) < 0.001;
    const isHalfBeat = !isWholeBeat && Math.abs((b * 2) - Math.round(b * 2)) < 0.001;

    // Tick length proportional to importance
    const tickHalf = isWholeBeat ? halfLen * 0.6 : isHalfBeat ? halfLen * 0.3 : halfLen * 0.15;
    const targetPath = isWholeBeat ? wholePath : isHalfBeat ? halfPath : subPath;

    // Draw tick on BOTH sides (above and below the line)
    for (const side of [1, -1]) {
      const offsetX = perpX * absY * side;
      const offsetY = perpY * absY * side;

      const cx = lineInfo.screenX + offsetX;
      const cy = lineInfo.screenY + offsetY;

      targetPath.push([
        cx - cos * tickHalf, cy - sin * tickHalf,
        cx + cos * tickHalf, cy + sin * tickHalf,
      ]);

      // Beat number label on whole beats (one side only, to avoid clutter)
      if (isWholeBeat && side === -1) {
        labels.push({
          text: Math.round(b).toString(),
          x: cx + cos * (tickHalf + 6),
          y: cy + sin * (tickHalf + 6) + 3,
        });
      }
    }
  }

  // ---- Stroke each tier once (3 stroke calls instead of N*2) ----
  const tiers: [typeof wholePath, string, number][] = [
    [wholePath, "rgba(108, 138, 255, 0.25)", 1],
    [halfPath, "rgba(108, 138, 255, 0.15)", 0.5],
    [subPath, "rgba(108, 138, 255, 0.08)", 0.5],
  ];
  for (const [segments, color, width] of tiers) {
    if (segments.length === 0) continue;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segments) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // ---- Beat number labels (drawn separately since fillText can't batch) ----
  if (labels.length > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#6c8aff";
    ctx.font = "9px sans-serif";
    for (const { text, x, y } of labels) {
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Draw a dotted trail showing a line's past and future positions.
 * Future positions are blue, past positions are orange, connected
 * by a dashed line. Dots fade with distance from the current beat.
 */
export function drawLinePathPreview(
  ctx: CanvasRenderingContext2D,
  events: LineEvent[],
  eventLayers: EventLayer[] | undefined,
  currentBeat: number,
  aheadBeats: number,
  behindBeats: number,
  sampleInterval: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();
  const dots: { sx: number; sy: number; alpha: number; isFuture: boolean }[] = [];

  // Sample future positions
  for (let b = currentBeat + sampleInterval; b <= currentBeat + aheadBeats; b += sampleInterval) {
    const state = evaluateLineEventsWithLayers(events, eventLayers, b);
    const sx = (state.x / 1350 + 0.5) * canvasWidth;
    const sy = (0.5 - state.y / 900) * canvasHeight;
    const progress = (b - currentBeat) / aheadBeats;
    dots.push({ sx, sy, alpha: Math.max(0.1, 1 - progress), isFuture: true });
  }

  // Sample past positions
  for (let b = currentBeat - sampleInterval; b >= currentBeat - behindBeats; b -= sampleInterval) {
    if (b < 0) break;
    const state = evaluateLineEventsWithLayers(events, eventLayers, b);
    const sx = (state.x / 1350 + 0.5) * canvasWidth;
    const sy = (0.5 - state.y / 900) * canvasHeight;
    const progress = (currentBeat - b) / behindBeats;
    dots.push({ sx, sy, alpha: Math.max(0.1, 1 - progress), isFuture: false });
  }

  // Draw connecting dashed line
  if (dots.length > 1) {
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    // Sort by temporal order for a connected line
    const allDots = dots.sort((a, b) => {
      if (a.isFuture !== b.isFuture) return a.isFuture ? 1 : -1;
      return 0;
    });
    ctx.moveTo(allDots[0].sx, allDots[0].sy);
    for (let i = 1; i < allDots.length; i++) {
      ctx.lineTo(allDots[i].sx, allDots[i].sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw dots (blue = future, orange = past)
  for (const dot of dots) {
    ctx.globalAlpha = dot.alpha;
    ctx.fillStyle = dot.isFuture ? "#42a5f5" : "#ff9800";
    ctx.beginPath();
    ctx.arc(dot.sx, dot.sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// Screen-Space HUD Overlays
//
// These overlays draw in screen space (identity + DPR transform)
// rather than the viewport-transformed space. Each function does
// ctx.save() → setTransform(dpr) → draw → ctx.restore() so the
// caller's viewport transform is preserved.
// ============================================================

/**
 * Draw a pulsing red border and "REC" label when record mode is active.
 */
export function drawRecordModeIndicator(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  screenWidth: number,
  screenHeight: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);

  // Pulsing red border
  ctx.strokeStyle = `rgba(255, 50, 50, ${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, screenWidth - 3, screenHeight - 3);

  // "● REC" label in top-left
  ctx.fillStyle = `rgba(255, 50, 50, ${0.7 + pulse * 0.3})`;
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("\u25CF REC", 10, 20);

  ctx.restore();
}

/**
 * Draw step recording status text (note kind, step size, beat, count).
 * @param yOffset - Vertical position for the text (offset if REC indicator is also showing)
 */
export function drawStepRecordStatus(
  ctx: CanvasRenderingContext2D,
  noteKind: string,
  stepSize: number,
  currentBeat: number,
  density: number,
  notesPlaced: number,
  yOffset: number,
  dpr: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 11px sans-serif";
  ctx.globalAlpha = 0.85;

  const kindLabel = noteKind.toUpperCase();
  const beatLabel = formatBeat(snapBeat(currentBeat, density));
  const stepLabel = formatStepSize(stepSize);

  ctx.fillText(
    `STEP [${kindLabel}] ${stepLabel} \u2014 Beat ${beatLabel}  (${notesPlaced} placed)`,
    10, yOffset,
  );

  ctx.restore();
}

/**
 * Draw cursor coordinate HUD in the bottom-left corner.
 * Shows the current mouse position in canvas coordinates and beat.
 */
export function drawCursorHUD(
  ctx: CanvasRenderingContext2D,
  canvasX: number,
  canvasY: number,
  beat: number,
  dpr: number,
  screenHeight: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#aaa";
  ctx.font = "10px monospace";
  ctx.fillText(
    `X: ${canvasX.toFixed(0)}  Y: ${canvasY.toFixed(0)}  Beat: ${beat.toFixed(2)}`,
    8, screenHeight - 6,
  );

  ctx.restore();
}

/**
 * Draw a floating beat label near the cursor when a ghost note is active.
 * Shows the note kind icon + snapped beat in "whole:num/denom" format
 * (e.g., "● 4:3/4"). Rendered in screen-space so it doesn't scale with
 * viewport zoom.
 *
 * Uses manual arcTo rounded rect (NOT ctx.roundRect()) for broad
 * WebView2 compatibility — roundRect is relatively new and may not be
 * available on all Windows WebView2 versions used by Tauri.
 *
 * @param ctx     - Canvas 2D context
 * @param beat    - The ghost note's snapped beat tuple [whole, num, denom]
 * @param kind    - Note kind string ("tap", "drag", "flick", "hold")
 * @param cursorX - Raw cursor X in screen pixels (NOT viewport-adjusted)
 * @param cursorY - Raw cursor Y in screen pixels
 * @param dpr     - Device pixel ratio
 */
export function drawGhostBeatLabel(
  ctx: CanvasRenderingContext2D,
  beat: Beat,
  kind: string,
  cursorX: number,
  cursorY: number,
  dpr: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Note kind icons for the label prefix
  const kindIcons: Record<string, string> = {
    tap: "●", drag: "◆", flick: "▲", hold: "▮",
  };
  const kindIcon = kindIcons[kind] || "";
  const label = `${kindIcon} ${formatBeat(beat)}`;

  // Measure text width for background pill
  ctx.font = "bold 10px sans-serif";
  const metrics = ctx.measureText(label);
  const textW = metrics.width;
  const padX = 6;
  const pillW = textW + padX * 2;
  const pillH = 16;

  // Position: offset right and above the cursor, clamped to canvas edges
  const screenWidth = ctx.canvas.width / dpr;
  const x = Math.min(cursorX + 16, screenWidth - pillW - 4);
  const y = Math.max(cursorY - 20, pillH / 2 + 4);

  // Background pill (manual rounded rect for broad webview compatibility —
  // ctx.roundRect() is relatively new and may not be available on all
  // Windows WebView2 versions used by Tauri)
  ctx.fillStyle = "rgba(108, 138, 255, 0.85)";
  const r = 4;
  const px = x, py = y - pillH / 2, pw = pillW, ph = pillH;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py);
  ctx.arcTo(px + pw, py, px + pw, py + r, r);
  ctx.lineTo(px + pw, py + ph - r);
  ctx.arcTo(px + pw, py + ph, px + pw - r, py + ph, r);
  ctx.lineTo(px + r, py + ph);
  ctx.arcTo(px, py + ph, px, py + ph - r, r);
  ctx.lineTo(px, py + r);
  ctx.arcTo(px, py, px + r, py, r);
  ctx.closePath();
  ctx.fill();

  // White text centered vertically in the pill
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y);

  ctx.restore();
}

/**
 * Draw red strikethrough marks on notes pending erasure during a drag-erase.
 * Called from the render loop when an eraser_drag is active.
 * Draws an X mark over each hit note for visual feedback.
 */
export function drawEraserPendingMarks(
  ctx: CanvasRenderingContext2D,
  hitNoteIndices: Set<number>,
  lineInfo: RenderedLineInfo,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 70, 70, 0.7)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  for (const noteInfo of lineInfo.notes) {
    if (!hitNoteIndices.has(noteInfo.noteIndex)) continue;

    const sz = Math.max(noteInfo.width, noteInfo.height) * 0.35;
    const x = noteInfo.screenX;
    const y = noteInfo.screenY;

    // Draw an X mark over the note
    ctx.beginPath();
    ctx.moveTo(x - sz, y - sz);
    ctx.lineTo(x + sz, y + sz);
    ctx.moveTo(x + sz, y - sz);
    ctx.lineTo(x - sz, y + sz);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a floating counter near the cursor during drag-erase.
 * Shows "Erasing N" so the user knows the blast radius before releasing.
 * Rendered in screen-space (same pattern as drawCursorHUD).
 *
 * @param ctx     - Canvas 2D context
 * @param count   - Number of notes currently hit
 * @param cursorX - Raw cursor X in screen pixels
 * @param cursorY - Raw cursor Y in screen pixels
 * @param dpr     - Device pixel ratio
 */
export function drawEraserCountIndicator(
  ctx: CanvasRenderingContext2D,
  count: number,
  cursorX: number,
  cursorY: number,
  dpr: number,
): void {
  if (count === 0) return; // Nothing to show yet

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const label = `Erasing ${count}`;
  ctx.font = "bold 10px sans-serif";
  const metrics = ctx.measureText(label);
  const textW = metrics.width;
  const padX = 6;
  const pillW = textW + padX * 2;
  const pillH = 16;

  // Position: below and right of cursor (opposite of ghost beat label)
  const screenWidth = ctx.canvas.width / dpr;
  const x = Math.min(cursorX + 16, screenWidth - pillW - 4);
  const y = cursorY + 24;

  // Red background pill (manual rounded rect for webview compatibility)
  ctx.fillStyle = "rgba(255, 70, 70, 0.85)";
  const r = 4;
  const px = x, py = y - pillH / 2, pw = pillW, ph = pillH;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py);
  ctx.arcTo(px + pw, py, px + pw, py + r, r);
  ctx.lineTo(px + pw, py + ph - r);
  ctx.arcTo(px + pw, py + ph, px + pw - r, py + ph, r);
  ctx.lineTo(px + r, py + ph);
  ctx.arcTo(px, py + ph, px, py + ph - r, r);
  ctx.lineTo(px, py + r);
  ctx.arcTo(px, py, px + r, py, r);
  ctx.closePath();
  ctx.fill();

  // White text
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y);

  ctx.restore();
}

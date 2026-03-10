// ============================================================
// Canvas Overlays — Handle Drawing for Unified Canvas
//
// Draws interactive translate and rotation handles as overlays
// on top of the GameRenderer output. Also draws selection
// rectangles, drag ghost lines, and rotation snap guides.
//
// Ported from EventCanvasRenderer's handle drawing code.
// ============================================================

import type { RenderedLineInfo } from "../../canvas/gameRenderer";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../../types/chart";

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

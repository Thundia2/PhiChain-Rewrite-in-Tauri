// ============================================================
// Event Canvas Renderer
//
// Draws the visual line editor canvas for the Line Event Editor.
// Shows a coordinate grid, the judgment line at its evaluated
// position/rotation/opacity, and interactive handles for
// dragging and rotating.
// ============================================================

import type { Line } from "../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../types/chart";
import { evaluateLineEventsWithLayers } from "./events";

// ============================================================
// Constants
// ============================================================

const LINE_THICKNESS = 4;
const LINE_HALF_LENGTH = 200; // pixels at scale 1
const HANDLE_RADIUS = 8;
const ROTATION_HANDLE_RADIUS = 6;
// const ROTATION_HANDLE_DISTANCE = 80; // pixels from center
const GRID_COLOR = "rgba(255, 255, 255, 0.06)";
const AXIS_COLOR = "rgba(255, 255, 255, 0.15)";
const LINE_COLOR = "#ffffff";

// ============================================================
// Types
// ============================================================

export interface EventCanvasRenderOptions {
  line: Line;
  currentBeat: number;
  canvasWidth: number;
  canvasHeight: number;
  /** If set, draws a ghost line at the drag preview position */
  dragPreview?: { x: number; y: number; rotation: number } | null;
  /** Which property is highlighted */
  highlightedProperty?: string;
  /** Snap angle in degrees (0 = off). When > 0 and dragging rotation, radial guides are drawn. */
  rotationSnapDegrees?: number;
  /** Whether a rotation drag is currently in progress */
  isRotationDragging?: boolean;
}

// ============================================================
// Renderer
// ============================================================

export class EventCanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Convert Phigros canvas X coordinate to screen pixel X.
   * Phigros: x=0 is center, range is -675..+675
   */
  canvasToScreenX(canvasX: number, screenWidth: number): number {
    return screenWidth / 2 + (canvasX / CANVAS_WIDTH) * screenWidth;
  }

  /**
   * Convert Phigros canvas Y coordinate to screen pixel Y.
   * Phigros: y=0 is center, positive is UP; screen: positive is DOWN
   */
  canvasToScreenY(canvasY: number, screenHeight: number): number {
    return screenHeight / 2 - (canvasY / CANVAS_HEIGHT) * screenHeight;
  }

  /**
   * Convert screen pixel X to Phigros canvas X.
   */
  screenToCanvasX(screenX: number, screenWidth: number): number {
    return ((screenX / screenWidth) - 0.5) * CANVAS_WIDTH;
  }

  /**
   * Convert screen pixel Y to Phigros canvas Y.
   */
  screenToCanvasY(screenY: number, screenHeight: number): number {
    return -((screenY / screenHeight) - 0.5) * CANVAS_HEIGHT;
  }

  /**
   * Render the event canvas.
   */
  render(options: EventCanvasRenderOptions): void {
    const ctx = this.ctx;
    const {
      line, currentBeat, canvasWidth, canvasHeight, dragPreview,
      rotationSnapDegrees = 0, isRotationDragging = false,
    } = options;

    // ---- Clear ----
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ---- Grid ----
    this.drawGrid(canvasWidth, canvasHeight);

    // ---- Evaluate line state ----
    const state = evaluateLineEventsWithLayers(line.events, line.event_layers, currentBeat);

    // ---- Draw the line ----
    const screenX = this.canvasToScreenX(state.x, canvasWidth);
    const screenY = this.canvasToScreenY(state.y, canvasHeight);
    const rotation = state.rotation; // Already in radians
    const opacity = state.opacity;

    // Scale the line length proportionally
    const scale = canvasWidth / CANVAS_WIDTH;
    const halfLen = LINE_HALF_LENGTH * scale;

    // Draw snap guides when rotation dragging with snapping enabled
    if (isRotationDragging && rotationSnapDegrees > 0) {
      this.drawRotationSnapGuides(ctx, screenX, screenY, halfLen, rotationSnapDegrees);
    }

    // Draw drag preview (ghost) if dragging
    if (dragPreview) {
      const ghostX = this.canvasToScreenX(dragPreview.x, canvasWidth);
      const ghostY = this.canvasToScreenY(dragPreview.y, canvasHeight);
      const ghostRot = (dragPreview.rotation * Math.PI) / 180;
      this.drawJudgmentLine(ctx, ghostX, ghostY, ghostRot, 0.3, halfLen, "rgba(100, 200, 255, 0.4)");
    }

    // Draw the actual line
    this.drawJudgmentLine(ctx, screenX, screenY, rotation, opacity, halfLen, LINE_COLOR);

    // ---- Draw handles ----
    this.drawTranslateHandle(ctx, screenX, screenY, opacity);
    this.drawRotationHandle(ctx, screenX, screenY, rotation, halfLen);

    // ---- Draw coordinate label ----
    this.drawCoordinateLabel(ctx, canvasWidth, canvasHeight, state, currentBeat);
  }

  /**
   * Draw the coordinate grid.
   */
  private drawGrid(canvasWidth: number, canvasHeight: number): void {
    const ctx = this.ctx;

    // Grid lines every 100 units in Phigros space
    const gridStep = 100;

    // Vertical lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = -600; x <= 600; x += gridStep) {
      const sx = this.canvasToScreenX(x, canvasWidth);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = -400; y <= 400; y += gridStep) {
      const sy = this.canvasToScreenY(y, canvasHeight);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidth, sy);
      ctx.stroke();
    }

    // Axes (brighter)
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1.5;

    // X axis (y=0)
    const axisY = this.canvasToScreenY(0, canvasHeight);
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(canvasWidth, axisY);
    ctx.stroke();

    // Y axis (x=0)
    const axisX = this.canvasToScreenX(0, canvasWidth);
    ctx.beginPath();
    ctx.moveTo(axisX, 0);
    ctx.lineTo(axisX, canvasHeight);
    ctx.stroke();

    // Grid labels at the edges
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    for (let x = -600; x <= 600; x += 200) {
      if (x === 0) continue;
      const sx = this.canvasToScreenX(x, canvasWidth);
      ctx.fillText(String(x), sx, canvasHeight - 4);
    }
    ctx.textAlign = "right";
    for (let y = -400; y <= 400; y += 200) {
      if (y === 0) continue;
      const sy = this.canvasToScreenY(y, canvasHeight);
      ctx.fillText(String(y), 30, sy + 3);
    }
  }

  /**
   * Draw a judgment line at the given screen position.
   */
  private drawJudgmentLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    opacity: number,
    halfLen: number,
    color: string,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_THICKNESS;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-halfLen, 0);
    ctx.lineTo(halfLen, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draw the translate handle (circle at line center).
   */
  private drawTranslateHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    opacity: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = Math.max(0.4, opacity);

    // Filled circle
    ctx.fillStyle = "rgba(50, 150, 255, 0.6)";
    ctx.strokeStyle = "#3296ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crosshair inside
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draw the rotation handle (dot at the end of the line).
   */
  private drawRotationHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    halfLen: number,
  ): void {
    // Position the handle at the right end of the line
    const handleX = x + Math.cos(rotation) * (halfLen + 15);
    const handleY = y + Math.sin(rotation) * (halfLen + 15);

    ctx.fillStyle = "rgba(255, 180, 50, 0.6)";
    ctx.strokeStyle = "#ffb432";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(handleX, handleY, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rotation arrow indicator
    ctx.strokeStyle = "rgba(255, 180, 50, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, halfLen + 15, rotation - 0.3, rotation + 0.3);
    ctx.stroke();
  }

  /**
   * Draw radial guide lines at each snap angle interval around the line center.
   * Shown while the user is rotation-dragging with snapping enabled.
   */
  private drawRotationSnapGuides(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    halfLen: number,
    snapDegrees: number,
  ): void {
    const guideLen = halfLen + 30;
    const count = Math.floor(360 / snapDegrees);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 180, 50, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    for (let i = 0; i < count; i++) {
      const angleDeg = i * snapDegrees - 180; // Start from -180 to cover full range
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
   * Draw coordinate label in the corner.
   */
  private drawCoordinateLabel(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    _canvasHeight: number,
    state: { x: number; y: number; rotation: number; opacity: number; speed: number },
    currentBeat: number,
  ): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(canvasWidth - 170, 6, 164, 90);

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";

    const rotDeg = (state.rotation * 180) / Math.PI;
    const opacityVal = Math.round(state.opacity * 255);

    const lines = [
      `Beat: ${currentBeat.toFixed(2)}`,
      `X: ${state.x.toFixed(1)}`,
      `Y: ${state.y.toFixed(1)}`,
      `Rot: ${rotDeg.toFixed(1)}°`,
      `Opacity: ${opacityVal}`,
      `Speed: ${state.speed.toFixed(2)}`,
    ];

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvasWidth - 162, 20 + i * 13);
    }
  }

  /**
   * Hit-test whether a point (screen coords) is on the translate handle.
   */
  hitTestTranslateHandle(
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
   * Hit-test whether a point (screen coords) is on the rotation handle.
   */
  hitTestRotationHandle(
    mouseX: number,
    mouseY: number,
    lineScreenX: number,
    lineScreenY: number,
    rotation: number,
    canvasWidth: number,
  ): boolean {
    const scale = canvasWidth / CANVAS_WIDTH;
    const halfLen = LINE_HALF_LENGTH * scale;
    const handleX = lineScreenX + Math.cos(rotation) * (halfLen + 15);
    const handleY = lineScreenY + Math.sin(rotation) * (halfLen + 15);
    const dx = mouseX - handleX;
    const dy = mouseY - handleY;
    return dx * dx + dy * dy <= (ROTATION_HANDLE_RADIUS + 4) * (ROTATION_HANDLE_RADIUS + 4);
  }

  /**
   * Hit-test whether a point is on the line body (for dragging).
   */
  hitTestLineBody(
    mouseX: number,
    mouseY: number,
    lineScreenX: number,
    lineScreenY: number,
    rotation: number,
    canvasWidth: number,
  ): boolean {
    const scale = canvasWidth / CANVAS_WIDTH;
    const halfLen = LINE_HALF_LENGTH * scale;

    // Transform mouse position to line-local coordinates
    const dx = mouseX - lineScreenX;
    const dy = mouseY - lineScreenY;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    return Math.abs(localX) <= halfLen + 10 && Math.abs(localY) <= 12;
  }
}

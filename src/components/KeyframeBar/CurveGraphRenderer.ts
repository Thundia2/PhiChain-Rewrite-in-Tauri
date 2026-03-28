// ============================================================
// Curve Graph Renderer — Canvas2D drawing for easing curves
//
// Draws grid, value axis labels, easing curve polylines,
// keyframe diamonds, and the playhead indicator.
// ============================================================

import type { LineEvent, LineEventKind, EasingType } from "../../types/chart";
import { beatToFloat } from "../../types/chart";
import { EVENT_COLORS } from "../../constants/eventColors";
import {
  type CurveViewport,
  beatToX,
  valueToY,
} from "./curveEditorUtils";

// Simple easing evaluation for curve preview.
// For full accuracy, use the tween function from canvas/easings.ts.
function evaluateEasing(t: number, easing: EasingType): number {
  if (typeof easing !== "string") return t; // custom bezier/steps — fallback to linear
  switch (easing) {
    case "linear": return t;
    case "ease_in_sine": return 1 - Math.cos((t * Math.PI) / 2);
    case "ease_out_sine": return Math.sin((t * Math.PI) / 2);
    case "ease_in_out_sine": return -(Math.cos(Math.PI * t) - 1) / 2;
    case "ease_in_quad": return t * t;
    case "ease_out_quad": return 1 - (1 - t) * (1 - t);
    case "ease_in_out_quad": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "ease_in_cubic": return t * t * t;
    case "ease_out_cubic": return 1 - Math.pow(1 - t, 3);
    case "ease_in_out_cubic": return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "ease_in_quart": return t * t * t * t;
    case "ease_out_quart": return 1 - Math.pow(1 - t, 4);
    case "ease_in_out_quart": return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    case "ease_in_quint": return t * t * t * t * t;
    case "ease_out_quint": return 1 - Math.pow(1 - t, 5);
    case "ease_in_out_quint": return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    case "ease_in_expo": return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    case "ease_out_expo": return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "ease_in_out_expo":
      if (t === 0 || t === 1) return t;
      return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case "ease_in_circ": return 1 - Math.sqrt(1 - t * t);
    case "ease_out_circ": return Math.sqrt(1 - Math.pow(t - 1, 2));
    case "ease_in_out_circ":
      return t < 0.5
        ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
        : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    case "ease_in_back": { const c1 = 1.70158; return (c1 + 1) * t * t * t - c1 * t * t; }
    case "ease_out_back": { const c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    case "ease_in_out_back": {
      const c2 = 1.70158 * 1.525;
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    }
    case "ease_out_bounce": {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    case "ease_in_bounce": return 1 - evaluateEasing(1 - t, "ease_out_bounce");
    case "ease_in_out_bounce":
      return t < 0.5
        ? (1 - evaluateEasing(1 - 2 * t, "ease_out_bounce")) / 2
        : (1 + evaluateEasing(2 * t - 1, "ease_out_bounce")) / 2;
    default: return t;
  }
}

export interface CurveRenderOptions {
  events: LineEvent[];
  visibleLanes: LineEventKind[];
  viewport: CurveViewport;
  canvasWidth: number;
  canvasHeight: number;
  currentBeat: number;
  selectedEventIndices: number[];
  hoveredKeyframe: { eventIndex: number; kind: LineEventKind; handle: "start" | "end" } | null;
  normalized: boolean;
}

/**
 * Draw the full curve graph onto a Canvas2D context.
 */
export function renderCurveGraph(
  ctx: CanvasRenderingContext2D,
  opts: CurveRenderOptions,
): void {
  const { events, visibleLanes, viewport, canvasWidth, canvasHeight, currentBeat, selectedEventIndices, hoveredKeyframe, normalized } = opts;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // ---- Background ----
  ctx.fillStyle = "rgba(12, 12, 18, 0.95)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ---- Grid ----
  drawGrid(ctx, viewport, canvasWidth, canvasHeight);

  // ---- Value axis labels ----
  drawValueLabels(ctx, viewport, canvasHeight);

  // ---- Easing curves per lane ----
  for (const lane of visibleLanes) {
    const laneEvents = events.filter((e) => e.kind === lane);
    if (laneEvents.length === 0) continue;

    const color = EVENT_COLORS[lane] || "#888";

    // Compute per-lane normalization if needed
    let laneViewport = viewport;
    if (normalized && visibleLanes.length > 1) {
      let lMin = Infinity, lMax = -Infinity;
      for (const e of laneEvents) {
        if ("constant" in e.value) {
          lMin = Math.min(lMin, e.value.constant);
          lMax = Math.max(lMax, e.value.constant);
        } else if ("transition" in e.value) {
          lMin = Math.min(lMin, e.value.transition.start, e.value.transition.end);
          lMax = Math.max(lMax, e.value.transition.start, e.value.transition.end);
        }
      }
      const range = lMax - lMin || 1;
      laneViewport = { ...viewport, valueMin: lMin - range * 0.05, valueMax: lMax + range * 0.05 };
    }

    for (const event of laneEvents) {
      drawEventCurve(ctx, event, laneViewport, canvasWidth, canvasHeight, color);
    }

    // ---- Keyframe diamonds ----
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.kind !== lane) continue;

      const isSelected = selectedEventIndices.includes(i);
      const isHoveredStart = hoveredKeyframe?.eventIndex === i && hoveredKeyframe.handle === "start";
      const isHoveredEnd = hoveredKeyframe?.eventIndex === i && hoveredKeyframe.handle === "end";

      drawKeyframeDiamonds(ctx, event, i, laneViewport, canvasWidth, canvasHeight, color, isSelected, isHoveredStart, isHoveredEnd);
    }
  }

  // ---- Playhead ----
  const playheadX = beatToX(currentBeat, viewport, canvasWidth);
  if (playheadX >= 50 && playheadX <= canvasWidth - 10) {
    ctx.strokeStyle = "rgba(108, 138, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: CurveViewport,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;

  // Vertical beat lines
  const beatRange = viewport.beatEnd - viewport.beatStart;
  const beatStep = beatRange > 64 ? 8 : beatRange > 16 ? 4 : beatRange > 8 ? 2 : 1;
  const startBeat = Math.floor(viewport.beatStart / beatStep) * beatStep;

  for (let b = startBeat; b <= viewport.beatEnd; b += beatStep) {
    const x = beatToX(b, viewport, canvasWidth);
    if (x < 50 || x > canvasWidth - 10) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();

    // Beat label
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(b), x, canvasHeight - 2);
  }

  // Horizontal value lines
  const valueRange = viewport.valueMax - viewport.valueMin;
  const valueStep = niceStep(valueRange / 5);
  const startVal = Math.floor(viewport.valueMin / valueStep) * valueStep;

  for (let v = startVal; v <= viewport.valueMax; v += valueStep) {
    const y = valueToY(v, viewport, canvasHeight);
    if (y < 5 || y > canvasHeight - 5) continue;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(canvasWidth - 10, y);
    ctx.stroke();
  }
}

function drawValueLabels(
  ctx: CanvasRenderingContext2D,
  viewport: CurveViewport,
  canvasHeight: number,
): void {
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const valueRange = viewport.valueMax - viewport.valueMin;
  const valueStep = niceStep(valueRange / 5);
  const startVal = Math.floor(viewport.valueMin / valueStep) * valueStep;

  for (let v = startVal; v <= viewport.valueMax; v += valueStep) {
    const y = valueToY(v, viewport, canvasHeight);
    if (y < 8 || y > canvasHeight - 8) continue;
    const label = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
    ctx.fillText(label, 46, y);
  }
}

function drawEventCurve(
  ctx: CanvasRenderingContext2D,
  event: LineEvent,
  viewport: CurveViewport,
  canvasWidth: number,
  canvasHeight: number,
  color: string,
): void {
  const startBeat = beatToFloat(event.start_beat);
  const endBeat = beatToFloat(event.end_beat);

  if ("constant" in event.value) {
    const y = valueToY(event.value.constant, viewport, canvasHeight);
    const x1 = beatToX(startBeat, viewport, canvasWidth);
    const x2 = beatToX(endBeat, viewport, canvasWidth);
    ctx.strokeStyle = color + "cc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  } else if ("transition" in event.value) {
    const tv = event.value.transition;
    const steps = 40;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const easedT = evaluateEasing(t, tv.easing);
      const beat = startBeat + (endBeat - startBeat) * t;
      const value = tv.start + (tv.end - tv.start) * easedT;
      const x = beatToX(beat, viewport, canvasWidth);
      const y = valueToY(value, viewport, canvasHeight);

      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }
}

function drawKeyframeDiamonds(
  ctx: CanvasRenderingContext2D,
  event: LineEvent,
  _eventIndex: number,
  viewport: CurveViewport,
  canvasWidth: number,
  canvasHeight: number,
  color: string,
  isSelected: boolean,
  isHoveredStart: boolean,
  isHoveredEnd: boolean,
): void {
  const startBeat = beatToFloat(event.start_beat);
  const endBeat = beatToFloat(event.end_beat);

  let startVal: number;
  let endVal: number;

  if ("constant" in event.value) {
    startVal = endVal = event.value.constant;
  } else if ("transition" in event.value) {
    startVal = event.value.transition.start;
    endVal = event.value.transition.end;
  } else {
    return;
  }

  const size = isSelected ? 7 : 5;

  // Start diamond
  const sx = beatToX(startBeat, viewport, canvasWidth);
  const sy = valueToY(startVal, viewport, canvasHeight);
  drawDiamond(ctx, sx, sy, size, color, isSelected, isHoveredStart);

  // End diamond (only if different from start)
  if (startBeat !== endBeat) {
    const ex = beatToX(endBeat, viewport, canvasWidth);
    const ey = valueToY(endVal, viewport, canvasHeight);
    drawDiamond(ctx, ex, ey, size, color, isSelected, isHoveredEnd);
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  filled: boolean,
  hovered: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);

  if (filled || hovered) {
    ctx.fillStyle = hovered ? "#ffffff" : color;
    ctx.fillRect(-size / 2, -size / 2, size, size);
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
  }

  ctx.restore();
}

/**
 * Choose a "nice" step value for axis labels.
 */
function niceStep(rough: number): number {
  const abs = Math.abs(rough);
  if (abs === 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(abs)));
  const ratio = abs / mag;
  if (ratio <= 1.5) return mag;
  if (ratio <= 3) return 2 * mag;
  if (ratio <= 7) return 5 * mag;
  return 10 * mag;
}

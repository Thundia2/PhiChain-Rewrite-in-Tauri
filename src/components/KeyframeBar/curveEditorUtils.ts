// ============================================================
// Curve Editor Utilities
//
// Coordinate transforms, hit testing, and auto-ranging for
// the visual curve graph editor.
// ============================================================

import type { LineEvent, LineEventKind } from "../../types/chart";
import { beatToFloat } from "../../types/chart";

export interface CurveViewport {
  beatStart: number;
  beatEnd: number;
  valueMin: number;
  valueMax: number;
}

const LEFT_MARGIN = 50;
const RIGHT_MARGIN = 10;
const TOP_MARGIN = 10;
const BOTTOM_MARGIN = 10;

export function beatToX(
  beat: number,
  viewport: CurveViewport,
  canvasWidth: number,
): number {
  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  return (
    LEFT_MARGIN +
    ((beat - viewport.beatStart) / (viewport.beatEnd - viewport.beatStart)) *
      usableWidth
  );
}

export function valueToY(
  value: number,
  viewport: CurveViewport,
  canvasHeight: number,
): number {
  const usableHeight = canvasHeight - TOP_MARGIN - BOTTOM_MARGIN;
  return (
    TOP_MARGIN +
    (1 - (value - viewport.valueMin) / (viewport.valueMax - viewport.valueMin)) *
      usableHeight
  );
}

export function xToBeat(
  x: number,
  viewport: CurveViewport,
  canvasWidth: number,
): number {
  const usableWidth = canvasWidth - LEFT_MARGIN - RIGHT_MARGIN;
  return (
    viewport.beatStart +
    ((x - LEFT_MARGIN) / usableWidth) * (viewport.beatEnd - viewport.beatStart)
  );
}

export function yToValue(
  y: number,
  viewport: CurveViewport,
  canvasHeight: number,
): number {
  const usableHeight = canvasHeight - TOP_MARGIN - BOTTOM_MARGIN;
  return (
    viewport.valueMin +
    (1 - (y - TOP_MARGIN) / usableHeight) *
      (viewport.valueMax - viewport.valueMin)
  );
}

/**
 * Compute auto-range from visible events.
 * Returns a value range with 10% padding.
 */
export function computeAutoRange(
  events: LineEvent[],
  visibleLanes: LineEventKind[],
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const event of events) {
    if (!visibleLanes.includes(event.kind)) continue;

    if ("constant" in event.value) {
      min = Math.min(min, event.value.constant);
      max = Math.max(max, event.value.constant);
    } else if ("transition" in event.value) {
      min = Math.min(min, event.value.transition.start, event.value.transition.end);
      max = Math.max(max, event.value.transition.start, event.value.transition.end);
    }
  }

  if (!isFinite(min) || !isFinite(max)) {
    return { min: -100, max: 100 };
  }

  const range = max - min || 1;
  return { min: min - range * 0.1, max: max + range * 0.1 };
}

/**
 * Hit test: find the nearest keyframe diamond to a point.
 * Returns the event index and handle ("start" or "end"), or null.
 */
export function hitTestKeyframeDiamond(
  mouseX: number,
  mouseY: number,
  events: LineEvent[],
  visibleLanes: LineEventKind[],
  viewport: CurveViewport,
  canvasWidth: number,
  canvasHeight: number,
  hitRadius: number = 8,
): { eventIndex: number; kind: LineEventKind; handle: "start" | "end" } | null {
  let bestDist = hitRadius;
  let bestResult: { eventIndex: number; kind: LineEventKind; handle: "start" | "end" } | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!visibleLanes.includes(event.kind)) continue;

    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);

    let startVal: number | undefined;
    let endVal: number | undefined;

    if ("constant" in event.value) {
      startVal = event.value.constant;
      endVal = event.value.constant;
    } else if ("transition" in event.value) {
      startVal = event.value.transition.start;
      endVal = event.value.transition.end;
    }

    if (startVal === undefined || endVal === undefined) continue;

    // Test start diamond
    const sx = beatToX(startBeat, viewport, canvasWidth);
    const sy = valueToY(startVal, viewport, canvasHeight);
    const sd = Math.hypot(mouseX - sx, mouseY - sy);
    if (sd < bestDist) {
      bestDist = sd;
      bestResult = { eventIndex: i, kind: event.kind, handle: "start" };
    }

    // Test end diamond
    const ex = beatToX(endBeat, viewport, canvasWidth);
    const ey = valueToY(endVal, viewport, canvasHeight);
    const ed = Math.hypot(mouseX - ex, mouseY - ey);
    if (ed < bestDist) {
      bestDist = ed;
      bestResult = { eventIndex: i, kind: event.kind, handle: "end" };
    }
  }

  return bestResult;
}

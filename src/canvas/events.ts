// ============================================================
// Event Evaluation
//
// Ported from phichain-chart/src/event.rs (the evaluate methods)
// and phichain-game/src/core.rs (compute_line_system)
//
// Events control how judgment lines change over time. Each event
// says "from beat X to beat Y, change [property] from A to B
// using [easing]". This module evaluates all events for a line
// at a given beat to get the line's current state.
//
// The five event types and their value ranges:
//   x:        horizontal position (-675 to 675, where 0 = center)
//   y:        vertical position (-450 to 450, where 0 = center)
//   rotation: angle in degrees (0 = horizontal)
//   opacity:  0-255 (where 255 = fully visible, divided by 255 for rendering)
//   speed:    note fall speed multiplier (default 10.0)
// ============================================================

import type { LineEvent, LineEventKind, Beat, EventLayer } from "../types/chart";
import { beatToFloat } from "../utils/beat";
import { tween } from "./easings";

/** The computed state of a judgment line at a specific moment */
export interface LineState {
  x: number;
  y: number;
  rotation: number;  // in radians (converted from degrees in events)
  opacity: number;   // 0.0 to 1.0
  speed: number;
  // Extended properties (RPE)
  scale_x: number;   // default 1.0
  scale_y: number;   // default 1.0
  color: [number, number, number] | null;  // RGB 0-255 each, null = default white
  incline: number;   // default 0
  text: string | null; // default null
}

/** Default line state when no events have been defined yet */
export const DEFAULT_LINE_STATE: LineState = {
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 0,
  speed: 10,
  scale_x: 1,
  scale_y: 1,
  color: null,
  incline: 0,
  text: null,
};

/**
 * Evaluate a single event at a given beat.
 *
 * Returns the value if the event affects this beat, or null if the
 * beat is before the event starts.
 *
 * If the beat is after the event ends, returns the end value
 * (events "hold" their end value until another event overrides).
 */
function evaluateEvent(event: LineEvent, beat: number): number | null {
  const startBeat = beatToFloat(event.start_beat);
  const endBeat = beatToFloat(event.end_beat);

  if (beat < startBeat) {
    // Beat is before this event — no effect
    return null;
  }

  const value = event.value;

  if ("constant" in value) {
    // Constant event: same value throughout
    return value.constant;
  }

  if ("transition" in value) {
    const { start, end, easing } = value.transition;

    if (beat >= endBeat) {
      // Beat is after the event — hold at end value
      return end;
    }

    // Beat is during the event — interpolate
    const duration = endBeat - startBeat;
    if (duration <= 0) return start;
    const progress = (beat - startBeat) / duration;
    return tween(start, end, progress, easing, event.easing_left, event.easing_right);
  }

  return null;
}

/**
 * Evaluate all events for a line at a given beat to get the line's state.
 *
 * For each event type (x, y, rotation, opacity, speed), we find all
 * events that are active or inherited at the given beat and take the
 * one with the highest priority (the one that started latest).
 *
 * This matches the logic in compute_line_system from core.rs,
 * which takes the max of all EventEvaluationResults.
 *
 * @param events - All events for this line
 * @param beat - The current beat as a float
 * @returns The line's computed state at this beat
 */
export function evaluateLineEvents(events: LineEvent[], beat: number): LineState {
  const state = { ...DEFAULT_LINE_STATE };

  // Group events by kind and evaluate each
  const kinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed", "scale_x", "scale_y", "incline"];

  for (const kind of kinds) {
    const kindEvents = events.filter((e) => e.kind === kind);

    // Find the best value: prefer "affecting" (during the event) over
    // "inherited" (after the event), and among inherited values prefer
    // the one from the latest-ending event.
    let bestValue: number | null = null;
    let bestIsAffecting = false;
    let bestEndBeat = -Infinity;

    for (const event of kindEvents) {
      const value = evaluateEvent(event, beat);
      if (value === null) continue;

      const startBeat = beatToFloat(event.start_beat);
      const endBeat = beatToFloat(event.end_beat);
      const isAffecting = beat >= startBeat && beat <= endBeat;

      // Affecting events always win over inherited ones.
      // Among same type, latest-ending wins.
      if (isAffecting && !bestIsAffecting) {
        bestValue = value;
        bestIsAffecting = true;
        bestEndBeat = endBeat;
      } else if (isAffecting === bestIsAffecting && endBeat > bestEndBeat) {
        bestValue = value;
        bestEndBeat = endBeat;
      }
    }

    if (bestValue !== null) {
      switch (kind) {
        case "x":
          state.x = bestValue;
          break;
        case "y":
          state.y = bestValue;
          break;
        case "rotation":
          // Events store degrees, rendering uses radians
          state.rotation = (bestValue * Math.PI) / 180;
          break;
        case "opacity":
          // Events store 0-255, rendering uses 0.0-1.0
          state.opacity = bestValue / 255;
          break;
        case "speed":
          state.speed = bestValue;
          break;
        case "scale_x":
          state.scale_x = bestValue;
          break;
        case "scale_y":
          state.scale_y = bestValue;
          break;
        case "incline":
          state.incline = bestValue;
          break;
      }
    }
  }

  // Evaluate color events separately (they use [R,G,B] arrays, not single numbers)
  evaluateColorEvents(events, beat, state);
  // Evaluate text events separately (they use string values)
  evaluateTextEvents(events, beat, state);

  return state;
}

/** Evaluate color events for a line at the given beat. Mutates state.color. */
function evaluateColorEvents(events: LineEvent[], beat: number, state: LineState): void {
  const colorEvents = events.filter((e) => e.kind === "color");
  let bestColor: [number, number, number] | null = null;
  let bestIsAffecting = false;
  let bestEndBeat = -Infinity;

  for (const event of colorEvents) {
    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);
    if (beat < startBeat) continue;

    const isAffecting = beat >= startBeat && beat <= endBeat;
    if (!isAffecting && bestIsAffecting) continue;
    if (isAffecting === bestIsAffecting && endBeat <= bestEndBeat) continue;

    const value = event.value;
    if ("color_constant" in value) {
      bestColor = value.color_constant;
    } else if ("color_transition" in value) {
      const { start, end, easing } = value.color_transition;
      if (beat >= endBeat) {
        bestColor = end;
      } else {
        const duration = endBeat - startBeat;
        if (duration <= 0) {
          bestColor = start;
        } else {
          const progress = (beat - startBeat) / duration;
          const easedProgress = tween(0, 1, progress, easing, event.easing_left, event.easing_right);
          bestColor = [
            Math.round(start[0] + (end[0] - start[0]) * easedProgress),
            Math.round(start[1] + (end[1] - start[1]) * easedProgress),
            Math.round(start[2] + (end[2] - start[2]) * easedProgress),
          ];
        }
      }
    }
    bestIsAffecting = isAffecting;
    bestEndBeat = endBeat;
  }

  if (bestColor) state.color = bestColor;
}

/** Evaluate text events for a line at the given beat. Mutates state.text. */
function evaluateTextEvents(events: LineEvent[], beat: number, state: LineState): void {
  const textEvents = events.filter((e) => e.kind === "text");
  let bestText: string | null = null;
  let bestIsAffecting = false;
  let bestEndBeat = -Infinity;

  for (const event of textEvents) {
    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);
    if (beat < startBeat) continue;

    const isAffecting = beat >= startBeat && beat <= endBeat;
    if (!isAffecting && bestIsAffecting) continue;
    if (isAffecting === bestIsAffecting && endBeat <= bestEndBeat) continue;

    if ("text_value" in event.value) {
      bestText = event.value.text_value;
    }
    bestIsAffecting = isAffecting;
    bestEndBeat = endBeat;
  }

  if (bestText !== null) state.text = bestText;
}

/**
 * Evaluate a single event kind from a flat list of events.
 * Returns the best numeric value at the given beat, or null if no events affect it.
 */
function evaluateSingleKind(events: LineEvent[], beat: number): number | null {
  let bestValue: number | null = null;
  let bestIsAffecting = false;
  let bestEndBeat = -Infinity;

  for (const event of events) {
    const value = evaluateEvent(event, beat);
    if (value === null) continue;

    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);
    const isAffecting = beat >= startBeat && beat <= endBeat;

    if (isAffecting && !bestIsAffecting) {
      bestValue = value;
      bestIsAffecting = true;
      bestEndBeat = endBeat;
    } else if (isAffecting === bestIsAffecting && endBeat > bestEndBeat) {
      bestValue = value;
      bestEndBeat = endBeat;
    }
  }

  return bestValue;
}

/**
 * Evaluate all event layers additively for a line at a given beat.
 * If eventLayers is undefined/empty, falls back to the flat events array.
 *
 * RPE allows up to 5 event layers per line. The values from all layers
 * are summed for the final result (e.g., layer0.moveX=100 + layer1.moveX=50 = 150).
 */
export function evaluateLineEventsWithLayers(
  events: LineEvent[],
  eventLayers: EventLayer[] | undefined,
  beat: number,
): LineState {
  if (!eventLayers || eventLayers.length === 0) {
    return evaluateLineEvents(events, beat);
  }

  // Sum values from all layers
  let x = 0, y = 0, rotation = 0, opacity = 0, speed = 0;

  for (const layer of eventLayers) {
    x += evaluateSingleKind(layer.move_x_events, beat) ?? 0;
    y += evaluateSingleKind(layer.move_y_events, beat) ?? 0;
    rotation += evaluateSingleKind(layer.rotate_events, beat) ?? 0;
    opacity += evaluateSingleKind(layer.alpha_events, beat) ?? 0;
    speed += evaluateSingleKind(layer.speed_events, beat) ?? 0;
  }

  const state: LineState = {
    x,
    y,
    rotation: (rotation * Math.PI) / 180,
    opacity: opacity / 255,
    speed: speed || 10,
    scale_x: 1,
    scale_y: 1,
    color: null,
    incline: 0,
    text: null,
  };

  // Extended events live in the flat events array (they aren't layered in RPE)
  const extendedKinds: LineEventKind[] = ["scale_x", "scale_y", "incline"];
  for (const kind of extendedKinds) {
    const kindEvents = events.filter((e) => e.kind === kind);
    const val = evaluateSingleKind(kindEvents, beat);
    if (val !== null) {
      if (kind === "scale_x") state.scale_x = val;
      else if (kind === "scale_y") state.scale_y = val;
      else if (kind === "incline") state.incline = val;
    }
  }

  evaluateColorEvents(events, beat, state);
  evaluateTextEvents(events, beat, state);

  return state;
}

/**
 * Find the earliest beat at which a line's opacity first becomes > 0.
 * Used for "First Appearance" sorting in the LineList.
 *
 * Scans opacity events in beat order and returns the start beat of
 * the first event that produces opacity > 0.
 *
 * @param events - All events for this line
 * @returns The beat (as float) of first visibility, or Infinity if never visible
 */
export function getFirstAppearanceBeat(events: LineEvent[]): number {
  const opacityEvents = events
    .filter((e) => e.kind === "opacity")
    .sort((a, b) => beatToFloat(a.start_beat) - beatToFloat(b.start_beat));

  if (opacityEvents.length === 0) {
    // No opacity events → default opacity is 0 (from DEFAULT_LINE_STATE)
    return Infinity;
  }

  for (const event of opacityEvents) {
    if ("constant" in event.value) {
      if (event.value.constant > 0) {
        return beatToFloat(event.start_beat);
      }
    } else if ("transition" in event.value) {
      const { start, end } = event.value.transition;
      if (start > 0 || end > 0) {
        return beatToFloat(event.start_beat);
      }
    }
  }

  return Infinity;
}

/**
 * Calculate the distance a note has traveled at a given time.
 * This is the integral of speed over time, used to position notes
 * vertically on the screen.
 *
 * Ported from the `distance_at` function in phichain-game/src/core.rs.
 *
 * @param speedEvents - Speed events for this line (already filtered to kind="speed")
 * @param time - Time in seconds
 * @param bpmTimeAt - Function to convert a beat to time in seconds
 * @returns The accumulated distance (in abstract units)
 */
export function distanceAt(
  speedEvents: LineEvent[],
  time: number,
  bpmTimeAt: (beat: Beat) => number,
): number {
  // Build sorted speed segments with pre-computed times
  const segments = speedEvents
    .filter((e) => e.kind === "speed")
    .map((e) => ({
      startTime: bpmTimeAt(e.start_beat),
      endTime: bpmTimeAt(e.end_beat),
      startValue: "transition" in e.value ? e.value.transition.start : e.value.constant,
      endValue: "transition" in e.value ? e.value.transition.end : e.value.constant,
    }))
    .sort((a, b) => a.startTime - b.startTime);

  let lastTime = 0;
  let lastSpeed = 10; // Default speed
  let area = 0;

  for (const seg of segments) {
    if (time <= lastTime) break;

    // Fill gap before this segment with the last known speed
    const gapEnd = Math.min(seg.startTime, time);
    if (gapEnd > lastTime) {
      area += (gapEnd - lastTime) * lastSpeed;
      lastTime = gapEnd;
    }

    if (time <= seg.startTime) break;

    const timeSpan = seg.endTime - seg.startTime;
    if (timeSpan <= 0) {
      lastTime = Math.max(lastTime, seg.endTime);
      lastSpeed = seg.endValue;
      continue;
    }

    // Integrate speed over the segment (or partial segment)
    const segStart = Math.max(seg.startTime, lastTime);
    const segEnd = Math.min(seg.endTime, time);
    if (segEnd > segStart) {
      const speedSpan = seg.endValue - seg.startValue;
      const startRatio = (segStart - seg.startTime) / timeSpan;
      const endRatio = (segEnd - seg.startTime) / timeSpan;
      const startSpeed = seg.startValue + startRatio * speedSpan;
      const endSpeed = seg.startValue + endRatio * speedSpan;

      // Trapezoidal integration (linear speed change)
      area += (segEnd - segStart) * (startSpeed + endSpeed) / 2;

      if (time <= seg.endTime) return area;
    }

    lastTime = seg.endTime;
    lastSpeed = seg.endValue;
  }

  // Remaining time after all segments
  if (time > lastTime) {
    area += (time - lastTime) * lastSpeed;
  }

  return area;
}

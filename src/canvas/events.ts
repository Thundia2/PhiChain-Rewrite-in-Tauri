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

import type { LineEvent, LineEventKind, Beat } from "../types/chart";
import { beatToFloat } from "../utils/beat";
import { tween } from "./easings";

/** The computed state of a judgment line at a specific moment */
export interface LineState {
  x: number;
  y: number;
  rotation: number;  // in radians (converted from degrees in events)
  opacity: number;   // 0.0 to 1.0
  speed: number;
}

/** Default line state when no events have been defined yet */
export const DEFAULT_LINE_STATE: LineState = {
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 0,
  speed: 10,
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
    return tween(start, end, progress, easing);
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
  const kinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];

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
      }
    }
  }

  return state;
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

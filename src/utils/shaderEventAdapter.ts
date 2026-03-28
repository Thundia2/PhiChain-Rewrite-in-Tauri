// ============================================================
// Shader Event Adapter
//
// Converts AnimationEvent[] (RPE format, used in extra.json
// shader vars) to/from LineEvent[] (PhiChain format, used by
// CurveGraph).
// ============================================================

import type { LineEvent, LineEventKind, EasingType } from "../types/chart";
import { RPE_EASING_MAP, PHICHAIN_TO_RPE_EASING } from "./rpeImport";

// AnimationEvent from RPE format (used in extra.json shader vars)
interface AnimationEvent {
  startTime: [number, number, number];
  endTime: [number, number, number];
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  start: number | number[];
  end: number | number[];
}

/**
 * Convert AnimationEvent[] (RPE format) to LineEvent[] (PhiChain format).
 * Only handles SCALAR values (typeof start === "number").
 */
export function animationEventsToLineEvents(
  events: AnimationEvent[],
  displayKind: LineEventKind = "speed",
): LineEvent[] {
  return events
    .filter((e) => typeof e.start === "number" && typeof e.end === "number")
    .map((e) => {
      const start = e.start as number;
      const end = e.end as number;
      const easing: EasingType = RPE_EASING_MAP[e.easingType ?? 1] ?? "linear";

      return {
        kind: displayKind,
        start_beat: e.startTime,
        end_beat: e.endTime,
        value:
          start === end
            ? { constant: start }
            : { transition: { start, end, easing } },
        easing_left: e.easingLeft,
        easing_right: e.easingRight,
      };
    });
}

/**
 * Convert LineEvent[] back to AnimationEvent[] after editing.
 */
export function lineEventsToAnimationEvents(
  events: LineEvent[],
): AnimationEvent[] {
  return events.map((e) => {
    const isTransition = "transition" in e.value;
    const tv = isTransition
      ? (e.value as { transition: { start: number; end: number; easing: EasingType } }).transition
      : null;
    const cv = !isTransition
      ? (e.value as { constant: number }).constant
      : null;

    const easingStr: string = tv?.easing
      ? typeof tv.easing === "string"
        ? tv.easing
        : "linear"
      : "linear";
    const easingNum = PHICHAIN_TO_RPE_EASING[easingStr] ?? 1;

    return {
      startTime: e.start_beat,
      endTime: e.end_beat,
      easingType: easingNum,
      easingLeft: e.easing_left,
      easingRight: e.easing_right,
      start: tv ? tv.start : cv!,
      end: tv ? tv.end : cv!,
    };
  });
}

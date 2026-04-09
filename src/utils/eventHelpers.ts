// ============================================================
// Event Display Helpers
//
// Pure formatting functions for LineEvent display. Used by
// ContextPanel LineMode, KeyframeBar tooltips, Inspector, etc.
// ============================================================

import type { LineEvent } from "../types/chart";

/** Human-readable easing label for an event (e.g. "linear", "bezier", "steps(4)") */
export function getEasingLabel(event: LineEvent): string {
  const val = event.value;
  if ("transition" in val) {
    const e = val.transition.easing;
    if (typeof e === "string") return e.replace(/^ease_/, "").replace(/_/g, " ");
    if (typeof e === "object") {
      if ("custom" in e) return "bezier";
      if ("steps" in e) return `steps(${e.steps})`;
      if ("elastic" in e) return `elastic(${e.elastic})`;
    }
  }
  if ("color_transition" in val) {
    const e = val.color_transition.easing;
    if (typeof e === "string") return e.replace(/^ease_/, "").replace(/_/g, " ");
  }
  return "const";
}

/** Short summary of an event's value (e.g. "0 -> 255", "const 1.0", "rgb(...)") */
export function getEventValueSummary(event: LineEvent): string {
  const val = event.value;
  if ("constant" in val) return String(Math.round(val.constant * 100) / 100);
  if ("transition" in val) {
    const s = Math.round(val.transition.start * 100) / 100;
    const e = Math.round(val.transition.end * 100) / 100;
    return `${s} \u2192 ${e}`;
  }
  if ("color_constant" in val) return `rgb(${val.color_constant.join(",")})`;
  if ("color_transition" in val) return "color trans.";
  if ("text_value" in val) return `"${val.text_value.slice(0, 8)}"`;
  if ("text_transition" in val) return "text trans.";
  return "?";
}

/** Format a Beat tuple as a human-readable string (e.g. "2+3/4") */
export function formatBeat(beat: [number, number, number]): string {
  if (beat[1] === 0) return String(beat[0]);
  return `${beat[0]}+${beat[1]}/${beat[2]}`;
}

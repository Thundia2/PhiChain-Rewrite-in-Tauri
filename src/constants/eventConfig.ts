// ============================================================
// Event Configuration — Single source of truth
//
// Canonical definitions for event kind metadata: short labels,
// display colors, default values, and kind groupings.
// Used by: KeyframeBar, KeyframeStrip, LineMode, EventMode,
//          CurveGraphRenderer, and any new event-related UI.
//
// Colors are defined in eventColors.ts; this file re-exports them
// and adds labels and groupings. EVENT_KIND_META derives its colors
// from EVENT_COLORS so there is only one place to update colors.
// ============================================================

import type { LineEventKind } from "../types/chart";
import { EVENT_COLORS } from "./eventColors";

// Re-export for convenience — consumers can import from either file
export { EVENT_COLORS } from "./eventColors";

// ---- Short Labels ----

/** 1-3 character abbreviations for event kinds (used in lane labels) */
export const KIND_SHORT: Record<string, string> = {
  x: "X", y: "Y", rotation: "R", opacity: "O", speed: "S",
  scale_x: "SX", scale_y: "SY", color: "C", text: "T", incline: "I", gif: "GIF",
};

// ---- Kind Groupings ----

/** The 5 core event kinds present on every line */
export const CORE_KINDS: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];

/** Extended event kinds (RPE-specific) */
export const EXTENDED_EVENT_KINDS: LineEventKind[] = ["scale_x", "scale_y", "color", "text", "incline", "gif"];

// ---- Default Values ----

/** Default constant values when creating new events */
export const DEFAULT_EVENT_VALUES: Record<string, number> = {
  x: 0, y: 0, rotation: 0, opacity: 255, speed: 1,
  scale_x: 1, scale_y: 1, incline: 0, gif: 0,
};

// ---- Kind Metadata ----

/** Display metadata per event kind: color (from EVENT_COLORS) + human-readable label */
export const EVENT_KIND_META: Record<string, { color: string; label: string }> = {
  x:        { color: EVENT_COLORS.x,        label: "X Position" },
  y:        { color: EVENT_COLORS.y,        label: "Y Position" },
  rotation: { color: EVENT_COLORS.rotation, label: "Rotation" },
  opacity:  { color: EVENT_COLORS.opacity,  label: "Opacity" },
  speed:    { color: EVENT_COLORS.speed,    label: "Speed" },
  scale_x:  { color: EVENT_COLORS.scale_x,  label: "Scale X" },
  scale_y:  { color: EVENT_COLORS.scale_y,  label: "Scale Y" },
  color:    { color: EVENT_COLORS.color,    label: "Color" },
  text:     { color: EVENT_COLORS.text,     label: "Text" },
  incline:  { color: EVENT_COLORS.incline,  label: "Incline" },
  gif:      { color: EVENT_COLORS.gif,      label: "GIF" },
};

// ============================================================
// Event Colors — Single source of truth
//
// Used by: KeyframeBar, DiamondStrip, CurveGraph, EventEditorToolbar,
//          EventInspector, PresetPanel, and any new event-related UI.
// ============================================================

import type { LineEventKind } from "../types/chart";

export const EVENT_COLORS: Record<LineEventKind, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
  scale_x: "#ff922b",
  scale_y: "#20c997",
  color: "#e599f7",
  text: "#a9e34b",
  incline: "#74c0fc",
  gif: "#f06595",
};

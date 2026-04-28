// ============================================================
// Editor State Types
//
// These types are specific to the editor UI and don't exist in
// the chart format. They control what tool is active, what's
// selected, timeline zoom, etc.
// ============================================================

import type { LineEventKind } from "./chart";

/** The tool currently selected in the toolbar */
export type EditorTool =
  | "select"              // Click to select notes/events
  | "place_tap"           // Click to place a Tap note
  | "place_drag"          // Click to place a Drag note
  | "place_flick"         // Click to place a Flick note
  | "place_hold"          // Click to start a Hold, click again to end
  | "eraser"              // Click to delete notes/events
  | "place_pattern"       // Click-drag to generate note patterns (hotkey Ctrl+G; no toolbar button)
  // ---- Event-placement tools (unrolled editor) ----
  // One per kind that gets a CapsLock-gated keyboard shortcut.
  // Mouse-down on the unrolled canvas creates a constant event of
  // this kind at the click beat with default value, then mouse-move
  // drags `end_beat` to define the duration (mirrors hold-placement
  // pattern in CanvasMouseHandlers.ts). incline + gif are intentionally
  // omitted — they remain Inspector / KeyframeBar only.
  | "place_event_x"
  | "place_event_y"
  | "place_event_rotation"
  | "place_event_opacity"
  | "place_event_speed"
  | "place_event_scale_x"
  | "place_event_scale_y"
  | "place_event_color"
  | "place_event_text";

/**
 * Map an event-placement tool id to its `LineEventKind`. Returns
 * `undefined` for non-event tools so callers can early-out with
 * `if (!EVENT_TOOL_TO_KIND[tool]) return;`. Single source of truth
 * — Toolbar, useHotkeys, and UnrolledCanvas all read from here.
 */
export const EVENT_TOOL_TO_KIND: Partial<Record<EditorTool, LineEventKind>> = {
  place_event_x: "x",
  place_event_y: "y",
  place_event_rotation: "rotation",
  place_event_opacity: "opacity",
  place_event_speed: "speed",
  place_event_scale_x: "scale_x",
  place_event_scale_y: "scale_y",
  place_event_color: "color",
  place_event_text: "text",
};

/** Which side of the line to show notes for in the timeline */
export type NoteSideFilter = "all" | "above" | "below";

/** How to sort lines in the LineList panel */
export type LineSortMode = "chart_order" | "first_appearance" | "active_first";

/** The panels/tabs available in the docking layout */
export type PanelId =
  | "game-preview"
  | "timeline"
  | "inspector"
  | "line-list"
  | "toolbar"
  | "timeline-settings"
  | "bpm-list"
  | "chart-settings"
  | "hotkey-reference"
  | "validation"
  | "effects"
  | "textures"
  | "group-manager"
  | "presets";

/** Panel access tier for the unified editor */
export type PanelTier = "always" | "quick" | "on_demand";

export const PANEL_TIERS: Record<PanelId, PanelTier> = {
  "inspector": "always",
  "toolbar": "always",
  "timeline": "quick",
  "line-list": "quick",
  "effects": "quick",
  "textures": "on_demand",
  "group-manager": "on_demand",
  "bpm-list": "on_demand",
  "chart-settings": "on_demand",
  "timeline-settings": "on_demand",
  "validation": "on_demand",
  "game-preview": "on_demand",
  "hotkey-reference": "on_demand",
  "presets": "on_demand",
};

/** Keyboard shortcut definition */
export interface HotkeyBinding {
  key: string;              // The key code (e.g., "q", "ArrowUp", " ")
  modifiers: Modifier[];    // Required modifier keys
  action: string;           // The action ID (e.g., "phichain.place_tap")
}

export type Modifier = "ctrl" | "shift" | "alt";

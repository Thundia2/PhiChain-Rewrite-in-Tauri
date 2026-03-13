// ============================================================
// Editor State Types
//
// These types are specific to the editor UI and don't exist in
// the chart format. They control what tool is active, what's
// selected, timeline zoom, etc.
// ============================================================

/** The tool currently selected in the toolbar */
export type EditorTool =
  | "select"              // Click to select notes/events
  | "place_tap"           // Click to place a Tap note
  | "place_drag"          // Click to place a Drag note
  | "place_flick"         // Click to place a Flick note
  | "place_hold"          // Click to start a Hold, click again to end
  | "eraser";             // Click to delete notes/events

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
  | "group-manager";

/** Keyboard shortcut definition */
export interface HotkeyBinding {
  key: string;              // The key code (e.g., "q", "ArrowUp", " ")
  modifiers: Modifier[];    // Required modifier keys
  action: string;           // The action ID (e.g., "phichain.place_tap")
}

export type Modifier = "ctrl" | "shift" | "alt";

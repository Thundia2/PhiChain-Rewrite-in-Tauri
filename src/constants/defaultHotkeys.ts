// ============================================================
// Default Hotkey Definitions
//
// Central registry of all keyboard shortcuts with their
// default bindings, display labels, and categories.
//
// Format uses react-hotkeys-hook syntax:
//   "ctrl+z" — modifier + key
//   "v"      — plain key
//   "delete, backspace" — multiple keys for same action
// ============================================================

export interface HotkeyDefinition {
  /** react-hotkeys-hook key string (e.g., "ctrl+z", "v") */
  key: string;
  /** Human-readable label for the settings UI */
  label: string;
  /** Category for grouping in the settings panel */
  category: string;
}

export const HOTKEY_CATEGORIES = [
  "Tools",
  "Edit",
  "File",
  "Selection",
  "Notes",
  "Events",
  "Navigation",
  "Playback",
  "View",
] as const;

export type HotkeyCategory = (typeof HOTKEY_CATEGORIES)[number];

/**
 * Map of action IDs to their default hotkey definitions.
 * Action IDs are stable identifiers used throughout the codebase.
 */
export const DEFAULT_HOTKEYS: Record<string, HotkeyDefinition> = {
  // ---- Tools ----
  select_tool: { key: "v", label: "Select Tool", category: "Tools" },
  eraser_tool: { key: "x", label: "Eraser Tool", category: "Tools" },
  place_tap: { key: "q", label: "Place Tap Note", category: "Tools" },
  place_drag: { key: "w", label: "Place Drag Note", category: "Tools" },
  place_flick: { key: "e", label: "Place Flick Note", category: "Tools" },
  place_hold: { key: "r", label: "Place Hold Note", category: "Tools" },

  // ---- Edit ----
  undo: { key: "ctrl+z, meta+z", label: "Undo", category: "Edit" },
  redo: { key: "ctrl+shift+z, meta+shift+z", label: "Redo", category: "Edit" },
  delete: { key: "delete, backspace", label: "Delete Selected", category: "Edit" },
  select_all: { key: "ctrl+a, meta+a", label: "Select All", category: "Edit" },

  // ---- File ----
  save: { key: "ctrl+s, meta+s", label: "Save Project", category: "File" },
  new_chart: { key: "ctrl+n, meta+n", label: "New Chart", category: "File" },

  // ---- Notes ----
  flip_notes: { key: "f", label: "Flip Notes (Above/Below)", category: "Notes" },
  mirror_notes: { key: "m", label: "Mirror Notes (X axis)", category: "Notes" },
  quantize_notes: { key: "ctrl+q, meta+q", label: "Quantize Notes", category: "Notes" },
  distribute_notes: { key: "ctrl+d, meta+d", label: "Distribute Notes Evenly", category: "Notes" },
  strum_notes: { key: "ctrl+shift+s, meta+shift+s", label: "Strum Notes", category: "Notes" },

  // ---- Events ----
  split_event: { key: "s", label: "Split Event", category: "Events" },
  merge_events: { key: "ctrl+m, meta+m", label: "Merge Events", category: "Events" },
  swap_easing: { key: "ctrl+e, meta+e", label: "Swap Easing", category: "Events" },

  // ---- Navigation ----
  move_up: { key: "up", label: "Move Selection Forward", category: "Navigation" },
  move_down: { key: "down", label: "Move Selection Backward", category: "Navigation" },
  move_right: { key: "right", label: "Move Selection Right", category: "Navigation" },
  move_left: { key: "left", label: "Move Selection Left", category: "Navigation" },
  go_to_beat: { key: "ctrl+g, meta+g", label: "Go to Beat...", category: "Navigation" },
  prev_marker: { key: "ctrl+[, meta+[", label: "Previous Marker", category: "Navigation" },
  next_marker: { key: "ctrl+], meta+]", label: "Next Marker", category: "Navigation" },

  // ---- Playback ----
  toggle_playback: { key: "space", label: "Play / Pause", category: "Playback" },
  loop_start: { key: "i", label: "Set Loop Start", category: "Playback" },
  loop_end: { key: "o", label: "Set Loop End", category: "Playback" },
  toggle_loop: { key: "l", label: "Toggle Loop", category: "Playback" },

  // ---- View ----
  toggle_grid: { key: "g", label: "Toggle Grid", category: "View" },
  toggle_devtools: { key: "f12", label: "Toggle DevTools", category: "View" },
  add_section_marker: { key: "ctrl+b, meta+b", label: "Add Section Marker", category: "View" },
  paste_special: { key: "ctrl+shift+v, meta+shift+v", label: "Paste Special...", category: "View" },
};

/**
 * Returns a display-friendly version of a hotkey string.
 * e.g., "ctrl+shift+z" -> "Ctrl+Shift+Z"
 */
export function formatHotkeyDisplay(key: string): string {
  // Take only the first combo if there are multiple (e.g., "ctrl+z, meta+z")
  const first = key.split(",")[0].trim();
  return first
    .split("+")
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === "ctrl" || p === "meta") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "alt") return "Alt";
      if (p === "space") return "Space";
      if (p === "delete") return "Del";
      if (p === "backspace") return "Backspace";
      if (p === "up") return "\u2191";
      if (p === "down") return "\u2193";
      if (p === "left") return "\u2190";
      if (p === "right") return "\u2192";
      return p.toUpperCase();
    })
    .join("+");
}

/**
 * Returns grouped hotkeys by category for display in settings.
 */
export function getHotkeysByCategory(): Record<string, { action: string; def: HotkeyDefinition }[]> {
  const groups: Record<string, { action: string; def: HotkeyDefinition }[]> = {};
  for (const [action, def] of Object.entries(DEFAULT_HOTKEYS)) {
    if (!groups[def.category]) groups[def.category] = [];
    groups[def.category].push({ action, def });
  }
  return groups;
}

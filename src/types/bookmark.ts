// ============================================================
// Bookmark Types
//
// Bookmarks are points of interest placed during improv mode.
// They mark positions on a judgment line at a specific beat,
// serving as visual reference markers for chart editing.
// Bookmarks are editor-only data — they don't affect gameplay.
// They persist via Canvas/bookmarks.json in .pez exports.
// ============================================================

import type { Beat } from "./chart";

/** A bookmark placed on the canvas during improv mode */
export interface Bookmark {
  /** Unique bookmark ID */
  id: string;
  /** Beat position in the chart */
  beat: Beat;
  /** X position on the judgment line (-675 to +675) */
  x: number;
  /** Whether the bookmark is above or below the line */
  above: boolean;
  /** Line index this bookmark belongs to */
  lineIndex: number;
  /** Optional user label */
  label?: string;
  /** Color for display (hex string) */
  color: string;
  /** Which preset was used (for display and note conversion) */
  preset?: BookmarkPreset;
}

/** Preset colors for tap-to-mark mode */
export const BOOKMARK_PRESETS = {
  tap:    "#48b5ff",   // Q — blue
  drag:   "#ffd24a",   // W — yellow
  flick:  "#ff4a6a",   // E — red
  hold:   "#2a7fbf",   // R — dark blue
  orange: "#ffa94d",   // 1 — misc
  green:  "#69db7c",   // 2 — misc
  violet: "#da77f2",   // 3 — misc
} as const;

export type BookmarkPreset = keyof typeof BOOKMARK_PRESETS;

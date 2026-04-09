// ============================================================
// Shared Canvas/Renderer Constants
//
// Single source of truth for rendering values used by
// TimelineRenderer, UnrolledRenderer, and related views.
// GameRenderer intentionally keeps its own palette — its
// note colors differ from the timeline/unrolled palette.
//
// Recent change: Added ONSET_MARKER_COLOR constants for onset
// detection feature (amber/orange markers on timeline).
// ============================================================

/** Width of the beat number gutter on the left of timeline views */
export const BEAT_GUTTER_WIDTH = 36;

/** Base pixels per beat (multiplied by zoom) */
export const BASE_PX_PER_BEAT = 80;

/** Playhead / indicator line color (cyan, matches GameRenderer) */
export const PLAYHEAD_COLOR = "#00e5ff";

/** Selected note/element highlight color (lime green, matches GameRenderer's #32cd32) */
export const SELECTED_COLOR = "#32cd32";

/** Note colors by kind — above-line (standard) palette used by Timeline + Unrolled */
export const ABOVE_NOTE_COLORS: Record<string, string> = {
  tap: "#48b5ff",
  drag: "#ffd24a",
  flick: "#ff4a6a",
  hold: "#4aff7a",
};

/** Onset marker color — amber/orange to stand apart from cyan playhead and note colors */
export const ONSET_MARKER_COLOR = "rgba(255, 170, 50, 1.0)";
export const ONSET_MARKER_COLOR_FAINT = "rgba(255, 170, 50, 0.15)";

/** Note colors by kind — below-line (purple-shifted) palette for Unrolled view */
export const BELOW_NOTE_COLORS: Record<string, string> = {
  tap: "#9b7aff",
  drag: "#d4a0ff",
  flick: "#d55aff",
  hold: "#7a9fff",
};

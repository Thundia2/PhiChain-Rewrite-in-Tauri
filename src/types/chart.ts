// ============================================================
// Chart Data Types
//
// These TypeScript types mirror the Rust structs in phichain-chart.
// When the Rust backend sends chart data as JSON, it deserializes
// directly into these types. The field names use the EXACT same
// casing as the Rust serde output (snake_case).
//
// DO NOT rename fields without also updating the Rust serialization.
// ============================================================

// ============================================================
// CONFIGURABLE: Canvas dimensions — these match phichain-chart/src/constants.rs
// The canvas is the virtual coordinate space that notes/lines exist in.
// X ranges from -675 to +675, Y ranges from -450 to +450.
// ============================================================
export const CANVAS_WIDTH = 1350.0;
export const CANVAS_HEIGHT = 900.0;

// ------ Beat ------
// Beats are stored as [whole, numerator, denominator] for precision.
// Example: beat 2 and 3/4 = [2, 3, 4]
// This avoids floating-point drift in timing calculations.
// The Rust version uses Rational32 (exact fraction math);
// our TypeScript version converts to float for display/rendering
// but keeps the tuple for storage/serialization.
export type Beat = [number, number, number];

/** Convert a Beat tuple to a decimal number (e.g., [2, 3, 4] → 2.75) */
export function beatToFloat(beat: Beat): number {
  return beat[0] + beat[1] / beat[2];
}

/** Convert a decimal to the nearest Beat tuple with the given max denominator */
export function floatToBeat(value: number, maxDenom: number = 32): Beat {
  const whole = Math.floor(value);
  const frac = value - whole;

  if (frac === 0) return [whole, 0, 1];

  let bestNumer = 0;
  let bestDenom = 1;
  let bestError = Math.abs(frac);

  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(frac * d);
    const error = Math.abs(frac - n / d);
    if (error < bestError) {
      bestNumer = n;
      bestDenom = d;
      bestError = error;
    }
  }

  return [whole, bestNumer, bestDenom];
}

/** Compare two beats: returns negative if a < b, 0 if equal, positive if a > b */
export function compareBeats(a: Beat, b: Beat): number {
  return beatToFloat(a) - beatToFloat(b);
}

/** Add two beats together */
export function addBeats(a: Beat, b: Beat): Beat {
  return floatToBeat(beatToFloat(a) + beatToFloat(b));
}

/** Subtract beat b from beat a */
export function subtractBeats(a: Beat, b: Beat): Beat {
  return floatToBeat(beatToFloat(a) - beatToFloat(b));
}

// ------ Notes ------
// Notes are the things players tap/drag/flick/hold during gameplay.
// Each note belongs to a specific judgment line.
export type NoteKind =
  | "tap"    // Tap the screen when the note reaches the line
  | "drag"   // Slide through — no need to lift finger
  | "flick"  // Swipe upward when the note reaches the line
  | "hold";  // Hold down for a duration

export interface Note {
  /** What type of note this is */
  kind: NoteKind;
  /** Whether the note falls from above the line (true) or below (false) */
  above: boolean;
  /** When this note should be hit, in beats */
  beat: Beat;
  /** Horizontal position on the line (-675 to +675) */
  x: number;
  /** Fall speed multiplier (default 1.0) */
  speed: number;
  /** For hold notes only: how many beats to hold */
  hold_beat?: Beat;
  /** Fake note: displays but doesn't affect combo/judgment (RPE) */
  fake?: boolean;
  /** Vertical position offset in canvas units (RPE yOffset) */
  y_offset?: number;
  /** Width/scale multiplier for the note (default 1.0) */
  size?: number;
  /** Per-note transparency 0-255 (default 255 = fully opaque) */
  alpha?: number;
  /** Seconds before hit time when note becomes visible (default 999999 = always) */
  visible_time?: number;
}

// ------ Line Events ------
// Events control how a judgment line moves/rotates/fades over time.
// Each event has a start beat, end beat, and either transitions
// between two values or holds a constant value.
export type LineEventKind =
  | "x"        // Horizontal position of the line
  | "y"        // Vertical position of the line
  | "rotation" // Rotation angle in degrees
  | "opacity"  // Transparency (0-255, where 255 = fully visible)
  | "speed"    // Note fall speed multiplier
  // Extended event types (RPE)
  | "scale_x"  // Horizontal scale of the judgment line (default 1.0)
  | "scale_y"  // Vertical scale of the judgment line (default 1.0)
  | "color"    // RGB color tint of the line
  | "text"     // Text displayed on the line
  | "incline"; // Tilt/incline effect

// The 30+ easing types supported by phichain.
// See https://easings.net/ for visual reference.
export type EasingType =
  | "linear"
  | "ease_in_sine" | "ease_out_sine" | "ease_in_out_sine"
  | "ease_in_quad" | "ease_out_quad" | "ease_in_out_quad"
  | "ease_in_cubic" | "ease_out_cubic" | "ease_in_out_cubic"
  | "ease_in_quart" | "ease_out_quart" | "ease_in_out_quart"
  | "ease_in_quint" | "ease_out_quint" | "ease_in_out_quint"
  | "ease_in_expo" | "ease_out_expo" | "ease_in_out_expo"
  | "ease_in_circ" | "ease_out_circ" | "ease_in_out_circ"
  | "ease_in_back" | "ease_out_back" | "ease_in_out_back"
  | "ease_in_elastic" | "ease_out_elastic" | "ease_in_out_elastic"
  | "ease_in_bounce" | "ease_out_bounce" | "ease_in_out_bounce"
  | { custom: [number, number, number, number] }  // Cubic bezier control points
  | { steps: number }                              // Step function
  | { elastic: number };                           // Elastic with custom omega

export type LineEventValue =
  | { transition: { start: number; end: number; easing: EasingType } }
  | { constant: number }
  // Extended value types for color and text events
  | { color_transition: { start: [number, number, number]; end: [number, number, number]; easing: EasingType } }
  | { color_constant: [number, number, number] }
  | { text_value: string };

export interface LineEvent {
  kind: LineEventKind;
  start_beat: Beat;
  end_beat: Beat;
  value: LineEventValue;
  /** Easing sub-range start (0.0-1.0, default 0.0) — clips easing curve */
  easing_left?: number;
  /** Easing sub-range end (0.0-1.0, default 1.0) — clips easing curve */
  easing_right?: number;
}

// ------ Event Layers ------
// RPE supports up to 5 additive event layers per line.
// Values from all layers are summed for the final result.
export interface EventLayer {
  move_x_events: LineEvent[];
  move_y_events: LineEvent[];
  rotate_events: LineEvent[];
  alpha_events: LineEvent[];
  speed_events: LineEvent[];
}

// ------ Note Controls ------
// Per-line control arrays that globally affect all notes on that line
// based on position. Evaluated at render time and stacked on per-note properties.
export interface NoteControlEntry {
  x: number;
  easing: EasingType;
  value: number;
}

// ------ Curve Note Tracks ------
// A curved path that notes follow between two anchor notes.
export interface CurveNoteTrack {
  from?: string;  // Entity ID of the start note
  to?: string;    // Entity ID of the end note
  options: {
    density: number;
    kind: NoteKind;
    curve: EasingType;
  };
}

// ------ Lines ------
// A judgment line is the core building block of a Phigros chart.
// Notes fall toward it, and events control its position/rotation/opacity.
export interface Line {
  name: string;
  notes: Note[];
  events: LineEvent[];
  children: Line[];                    // Child lines (inherit parent transforms)
  curve_note_tracks: CurveNoteTrack[];
  // RPE event layers (up to 5, additive). When present, takes precedence over flat events.
  event_layers?: EventLayer[];
  // RPE line properties
  z_order?: number;                    // Render depth (default 0, higher = in front)
  is_cover?: boolean;                  // Occlude passed notes (default true)
  bpm_factor?: number;                 // Divides global BPM for this line (default 1.0)
  group?: number;                      // Index into chart-level line_groups array
  texture?: string;                    // Custom line texture image path
  anchor?: [number, number];           // Texture pivot point (default [0.5, 0.5])
  rotate_with_father?: boolean;        // Inherit parent rotation (default true)
  father_index?: number;               // RPE flat parent index (-1 = none, for round-trip)
  // Note control systems (RPE)
  pos_control?: NoteControlEntry[];
  alpha_control?: NoteControlEntry[];
  size_control?: NoteControlEntry[];
  skew_control?: NoteControlEntry[];
  y_control?: NoteControlEntry[];
}

// ------ BPM List ------
// Defines tempo changes throughout the song.
export interface BpmPoint {
  beat: Beat;
  bpm: number;
}

// ------ Full Chart ------
// The complete chart file format, matching phichain-chart's PhichainChart struct.
export interface PhichainChart {
  format: number;
  offset: number;         // Audio offset in seconds
  bpm_list: BpmPoint[];
  lines: Line[];
  /** RPE line group names (e.g. ["Default", "Background", "Effects"]) */
  line_groups?: string[];
}

// ------ Project Metadata ------
// Song info displayed in the game UI.
export interface ProjectMeta {
  composer: string;
  charter: string;
  illustrator: string;
  name: string;
  level: string;
}

// ------ Project Data (from Tauri backend) ------
// What the load_project command returns.
export interface ProjectData {
  chart_json: string;
  meta: ProjectMeta;
  project_path: string;
  music_path: string | null;
  illustration_path: string | null;
}

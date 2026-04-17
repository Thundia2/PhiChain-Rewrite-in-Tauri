// ============================================================
// AI Command Schema — TypeScript types for AI-generated commands
//
// The AI outputs a JSON object with a `commands` array. Each
// command maps to one or more chartStore mutations. Float beats
// are used instead of [whole, numer, denom] tuples because the
// AI handles floats more reliably — the executor converts them.
//
// Recent change: Added optional questions field for
// clarification protocol.
// ============================================================

import type { NoteKind, LineEventKind } from "../types/chart";

// ============================================================
// Top-level response wrapper
// ============================================================

export interface AiResponse {
  /** Optional chain-of-thought reasoning (not executed, shown to user) */
  reasoning?: string;
  /** Array of commands to execute in order */
  commands: AiCommand[];
  /** Clarification questions from the AI when the request is ambiguous */
  questions?: string[];
}

// ============================================================
// Command types — each maps to chartStore mutations
// ============================================================

export type AiCommand =
  | AddNotesCommand
  | AddLineCommand
  | AddEventsCommand
  | EditLineCommand
  | EditNotesCommand
  | EditEventsCommand
  | RemoveNotesCommand
  | RemoveEventsCommand
  | RemoveLineCommand
  | SetBpmCommand;

// ---- Add Notes ----
// Maps to: chartStore.batchAddNotes(lineIndex, notes)

export interface AddNotesCommand {
  command: "add_notes";
  /** Line index to add notes to. Use "selected" for the currently selected line. */
  line: number | "selected" | "new";
  /** Optional name when line="new" */
  line_name?: string;
  notes: AiNote[];
}

export interface AiNote {
  kind: NoteKind;                          // "tap" | "drag" | "hold" | "flick"
  beat: number;                            // Float beat value (e.g. 6.0, 6.25, 6.5)
  x: number;                               // -675 to 675
  above?: boolean;                         // Default true
  speed?: number;                          // Default 1.0
  hold_duration?: number;                  // Beats, only for kind="hold"
  fake?: boolean;                          // Default false
  y_offset?: number;
  size?: number;                           // Default 1.0
  alpha?: number;                          // 0-255, default 255
}

// ---- Add Line ----
// Maps to: chartStore.addLine(partial)

export interface AddLineCommand {
  command: "add_line";
  name?: string;
  /** Initial events to set on the new line (position, rotation, opacity, speed) */
  events?: AiEvent[];
  /** Notes to place on the new line */
  notes?: AiNote[];
  /** RPE properties */
  z_order?: number;
  is_cover?: boolean;
  group?: number;
}

// ---- Add Events ----
// Maps to: chartStore.batchMultiLineMutations() with newEvents

export interface AddEventsCommand {
  command: "add_events";
  line: number | "selected";
  events: AiEvent[];
}

// Generatable event kinds:
//   "x" | "y" | "rotation" | "opacity" | "speed" | "scale_x" | "scale_y" | "incline" | "color"
// Read-only event kinds (AI understands them in context but CANNOT generate them):
//   "text" | "gif"

export interface AiEvent {
  kind: LineEventKind;                     // See generatable list above
  start_beat: number;                      // Float beat
  end_beat: number;                        // Float beat
  /** For numeric transition events (x, y, rotation, opacity, speed, scale_x, scale_y, incline): */
  start_value?: number;
  end_value?: number;
  easing?: string;                         // Easing name, default "linear"
  /** For numeric constant events: */
  constant_value?: number;
  /** For color transition events (kind="color"): RGB arrays, each channel 0-255 */
  color_start?: [number, number, number];
  color_end?: [number, number, number];
  /** For color constant events (kind="color"): */
  color_constant?: [number, number, number];
  /** Easing sub-range (RPE) */
  easing_left?: number;
  easing_right?: number;
}

// ---- Edit Line ----
// Maps to: chartStore.editLine(lineIndex, changes)

export interface EditLineCommand {
  command: "edit_line";
  line: number | "selected";
  changes: {
    name?: string;
    z_order?: number;
    is_cover?: boolean;
    group?: number;
    texture?: string;
  };
}

// ---- Edit Notes ----
// Maps to: chartStore.batchEditNotes()

export interface EditNotesCommand {
  command: "edit_notes";
  line: number | "selected";
  /** "all" = every note on the line, or beat range to match */
  target: "all" | "selected" | { beat_range: [number, number] };
  changes: Partial<AiNote>;
}

// ---- Edit Events ----
// Maps to: chartStore.batchEditEvents()

export interface EditEventsCommand {
  command: "edit_events";
  line: number | "selected";
  target: "all" | { kind: LineEventKind; beat_range: [number, number] };
  changes: Partial<AiEvent>;
}

// ---- Remove Notes ----
// Maps to: chartStore.removeNotes()

export interface RemoveNotesCommand {
  command: "remove_notes";
  line: number | "selected";
  target: "all" | "selected" | { beat_range: [number, number] } | { kind: NoteKind };
}

// ---- Remove Events ----
// Maps to: chartStore.removeEvents()

export interface RemoveEventsCommand {
  command: "remove_events";
  line: number | "selected";
  target: "selected" | { kind: LineEventKind; beat_range: [number, number] };
}

// ---- Remove Line ----
// Maps to: chartStore.removeLine()

export interface RemoveLineCommand {
  command: "remove_line";
  line: number;
}

// ---- Set BPM ----
// Maps to: chartStore.setBpmList()

export interface SetBpmCommand {
  command: "set_bpm";
  bpm_list: Array<{ beat: number; bpm: number }>;
}

// ============================================================
// AI Command Executor — Maps AI commands to chartStore mutations
//
// Takes validated AiCommand[] arrays and executes them against
// the chart store. Each command creates its own undo entry via
// the store's built-in undo system.
//
// Also provides previewAiCommands() for generating human-readable
// summaries WITHOUT executing (used in the Apply/Discard UI).
//
// Recent change: Initial creation — AI generation feature.
// ============================================================

import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { floatToBeat, beatToFloat } from "../types/chart";
import type { Note, LineEvent, LineEventValue, EasingType, Line } from "../types/chart";
import type { AiCommand, AiNote, AiEvent } from "./aiCommandSchema";

// ============================================================
// CONFIGURABLE: Maximum items per command (safety limits)
// ============================================================
const MAX_NOTES_PER_COMMAND = 500;
const MAX_EVENTS_PER_COMMAND = 1000;
const MAX_LINES_PER_GENERATION = 20;

// ---- Standard easing names for validation ----
const STANDARD_EASINGS = [
  "linear",
  "ease_in_sine", "ease_out_sine", "ease_in_out_sine",
  "ease_in_quad", "ease_out_quad", "ease_in_out_quad",
  "ease_in_cubic", "ease_out_cubic", "ease_in_out_cubic",
  "ease_in_quart", "ease_out_quart", "ease_in_out_quart",
  "ease_in_quint", "ease_out_quint", "ease_in_out_quint",
  "ease_in_expo", "ease_out_expo", "ease_in_out_expo",
  "ease_in_circ", "ease_out_circ", "ease_in_out_circ",
  "ease_in_back", "ease_out_back", "ease_in_out_back",
  "ease_in_elastic", "ease_out_elastic", "ease_in_out_elastic",
  "ease_in_bounce", "ease_out_bounce", "ease_in_out_bounce",
] as const;

// ---- Easing string -> EasingType mapper ----

function parseEasing(s?: string): EasingType {
  if (!s || s === "linear") return "linear";
  // Direct match for standard names
  if ((STANDARD_EASINGS as readonly string[]).includes(s)) {
    return s as EasingType;
  }
  return "linear"; // Fallback for unknown easing names
}

// ---- Convert AiNote -> Note ----

function aiNoteToNote(ai: AiNote): Note {
  const note: Note = {
    kind: ai.kind,
    beat: floatToBeat(ai.beat),
    x: Math.max(-675, Math.min(675, ai.x)),
    above: ai.above ?? true,
    speed: ai.speed ?? 1.0,
  };
  // Hold notes need a hold_beat duration
  if (ai.kind === "hold" && ai.hold_duration) {
    note.hold_beat = floatToBeat(ai.hold_duration);
  }
  // Optional extended note properties
  if (ai.fake) note.fake = true;
  if (ai.y_offset !== undefined) note.y_offset = ai.y_offset;
  if (ai.size !== undefined) note.size = ai.size;
  if (ai.alpha !== undefined) note.alpha = ai.alpha;
  return note;
}

// ---- Convert AiEvent -> LineEvent ----

function aiEventToLineEvent(ai: AiEvent): LineEvent {
  // Block text and gif events — these are read-only for the AI
  if (ai.kind === "text" || ai.kind === "gif") {
    throw new Error(`Cannot generate "${ai.kind}" events — these are read-only for AI.`);
  }

  let value: LineEventValue;

  if (ai.kind === "color") {
    // Color events use RGB [r,g,b] arrays (0-255 per channel)
    if (ai.color_constant !== undefined) {
      value = { color_constant: ai.color_constant };
    } else if (ai.color_start !== undefined && ai.color_end !== undefined) {
      value = {
        color_transition: {
          start: ai.color_start,
          end: ai.color_end,
          easing: parseEasing(ai.easing),
        },
      };
    } else {
      // Fallback: white constant if no color fields provided
      value = { color_constant: [255, 255, 255] };
    }
  } else if (ai.constant_value !== undefined) {
    // Numeric constant event (x, y, rotation, opacity, speed, scale_x, scale_y, incline)
    value = { constant: ai.constant_value };
  } else {
    // Numeric transition event
    value = {
      transition: {
        start: ai.start_value ?? 0,
        end: ai.end_value ?? 0,
        easing: parseEasing(ai.easing),
      },
    };
  }

  const evt: LineEvent = {
    kind: ai.kind,
    start_beat: floatToBeat(ai.start_beat),
    end_beat: floatToBeat(ai.end_beat),
    value,
  };
  // Optional RPE easing sub-range
  if (ai.easing_left !== undefined) evt.easing_left = ai.easing_left;
  if (ai.easing_right !== undefined) evt.easing_right = ai.easing_right;
  return evt;
}

// ---- Resolve "selected" / "new" line references ----

function resolveLineIndex(ref: number | "selected" | "new"): number | "new" {
  if (ref === "selected") {
    const idx = useEditorStore.getState().selectedLineIndex;
    if (idx === null) throw new Error("No line is selected. Select a line first.");
    return idx;
  }
  if (ref === "new") return "new";
  return ref;
}

// ============================================================
// Main executor
// ============================================================

export interface ExecutionResult {
  success: boolean;
  summary: string;       // Human-readable description of what was done
  linesCreated: number;
  notesCreated: number;
  eventsCreated: number;
}

/**
 * Execute a validated array of AI commands against the chart store.
 *
 * Each command is executed as a separate chartStore mutation, creating
 * its own undo entry. Multi-command generations require multiple Ctrl+Z.
 */
export function executeAiCommands(commands: AiCommand[]): ExecutionResult {
  const cs = useChartStore.getState();
  const summaryParts: string[] = [];
  let linesCreated = 0;
  let notesCreated = 0;
  let eventsCreated = 0;

  for (const cmd of commands) {
    switch (cmd.command) {
      case "add_line": {
        if (linesCreated >= MAX_LINES_PER_GENERATION) {
          throw new Error(`Safety limit: cannot create more than ${MAX_LINES_PER_GENERATION} lines in one generation`);
        }
        const notes = (cmd.notes ?? []).slice(0, MAX_NOTES_PER_COMMAND).map(aiNoteToNote);
        const events = (cmd.events ?? []).map(aiEventToLineEvent);
        // Build the partial Line object, removing undefined fields
        const partial: Partial<Line> = {};
        if (cmd.name !== undefined) partial.name = cmd.name;
        if (notes.length > 0) partial.notes = notes;
        if (events.length > 0) partial.events = events;
        if (cmd.z_order !== undefined) partial.z_order = cmd.z_order;
        if (cmd.is_cover !== undefined) partial.is_cover = cmd.is_cover;
        if (cmd.group !== undefined) partial.group = cmd.group;

        cs.addLine(partial);
        const newIdx = useChartStore.getState().chart.lines.length - 1;
        linesCreated++;
        notesCreated += notes.length;
        eventsCreated += events.length;
        summaryParts.push(`Created line "${cmd.name ?? `Line ${newIdx + 1}`}" with ${notes.length} notes, ${events.length} events`);
        break;
      }

      case "add_notes": {
        let lineIdx = resolveLineIndex(cmd.line);
        // If line="new", create a new line first
        if (lineIdx === "new") {
          cs.addLine({ name: cmd.line_name });
          lineIdx = useChartStore.getState().chart.lines.length - 1;
          linesCreated++;
        }
        const notes = cmd.notes.slice(0, MAX_NOTES_PER_COMMAND).map(aiNoteToNote);
        cs.batchAddNotes(lineIdx as number, notes);
        notesCreated += notes.length;
        summaryParts.push(`Added ${notes.length} ${cmd.notes[0]?.kind ?? ""} notes to line ${lineIdx}`);
        break;
      }

      case "add_events": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("add_events does not support line='new'. Create the line first.");
        const events = cmd.events.slice(0, MAX_EVENTS_PER_COMMAND).map(aiEventToLineEvent);
        // Use batchMultiLineMutations to add events as a single undo entry
        cs.batchMultiLineMutations([{
          lineIndex: lineIdx as number,
          newEvents: events,
        }]);
        eventsCreated += events.length;
        const kinds = [...new Set(cmd.events.map(e => e.kind))].join(", ");
        summaryParts.push(`Added ${events.length} events (${kinds}) to line ${lineIdx}`);
        break;
      }

      case "edit_line": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("edit_line does not support line='new'");
        cs.editLine(lineIdx as number, cmd.changes);
        summaryParts.push(`Edited line ${lineIdx} properties`);
        break;
      }

      case "edit_notes": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("edit_notes does not support line='new'");
        const line = useChartStore.getState().chart.lines[lineIdx as number];
        if (!line) throw new Error(`Line ${lineIdx} does not exist`);

        // Determine which note indices to edit based on the target spec
        let indices: number[];
        if (cmd.target === "all") {
          indices = line.notes.map((_, i) => i);
        } else if (cmd.target === "selected") {
          indices = useEditorStore.getState().selectedNoteIndices;
        } else if ("beat_range" in cmd.target) {
          const [lo, hi] = cmd.target.beat_range;
          indices = line.notes
            .map((n, i) => ({ i, b: beatToFloat(n.beat) }))
            .filter(({ b }) => b >= lo && b <= hi)
            .map(({ i }) => i);
        } else {
          indices = [];
        }

        if (indices.length > 0) {
          // Build the changes object from the AI's partial note spec
          const changes: Partial<Note> = {};
          if (cmd.changes.kind !== undefined) changes.kind = cmd.changes.kind;
          if (cmd.changes.x !== undefined) changes.x = cmd.changes.x;
          if (cmd.changes.above !== undefined) changes.above = cmd.changes.above;
          if (cmd.changes.speed !== undefined) changes.speed = cmd.changes.speed;
          if (cmd.changes.fake !== undefined) changes.fake = cmd.changes.fake;
          if (cmd.changes.size !== undefined) changes.size = cmd.changes.size;
          if (cmd.changes.alpha !== undefined) changes.alpha = cmd.changes.alpha;
          cs.editNotes(lineIdx as number, indices, changes);
        }
        summaryParts.push(`Edited ${indices.length} notes on line ${lineIdx}`);
        break;
      }

      case "edit_events": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("edit_events does not support line='new'");
        const line = useChartStore.getState().chart.lines[lineIdx as number];
        if (!line) throw new Error(`Line ${lineIdx} does not exist`);

        // Determine which event indices to edit based on the target spec
        let indices: number[];
        if (cmd.target === "all") {
          indices = line.events.map((_, i) => i);
        } else {
          // TypeScript narrows cmd.target to { kind, beat_range } after "all" is ruled out
          const target = cmd.target as { kind: string; beat_range: [number, number] };
          const [lo, hi] = target.beat_range;
          indices = line.events
            .map((e, i) => ({ i, b: beatToFloat(e.start_beat), k: e.kind }))
            .filter(({ b, k }) => k === target.kind && b >= lo && b <= hi)
            .map(({ i }) => i);
        }

        if (indices.length > 0) {
          // Build per-event changes (easing and value edits)
          const edits = indices.map(eventIndex => {
            const changes: Partial<LineEvent> = {};

            // Handle easing changes on transition values
            if (cmd.changes.easing !== undefined) {
              const existing = line.events[eventIndex].value;
              if ("transition" in existing) {
                changes.value = {
                  transition: {
                    ...existing.transition,
                    easing: parseEasing(cmd.changes.easing),
                  },
                };
              } else if ("color_transition" in existing) {
                changes.value = {
                  color_transition: {
                    ...existing.color_transition,
                    easing: parseEasing(cmd.changes.easing),
                  },
                };
              }
            }
            // Handle numeric value changes on transitions
            if (cmd.changes.start_value !== undefined || cmd.changes.end_value !== undefined) {
              const existing = line.events[eventIndex].value;
              if ("transition" in existing) {
                changes.value = {
                  transition: {
                    start: cmd.changes.start_value ?? existing.transition.start,
                    end: cmd.changes.end_value ?? existing.transition.end,
                    easing: cmd.changes.easing ? parseEasing(cmd.changes.easing) : existing.transition.easing,
                  },
                };
              }
            }
            // Handle constant value changes
            if (cmd.changes.constant_value !== undefined) {
              changes.value = { constant: cmd.changes.constant_value };
            }
            // Handle color transition changes
            if (cmd.changes.color_start !== undefined || cmd.changes.color_end !== undefined) {
              const existing = line.events[eventIndex].value;
              if ("color_transition" in existing) {
                changes.value = {
                  color_transition: {
                    start: cmd.changes.color_start ?? existing.color_transition.start,
                    end: cmd.changes.color_end ?? existing.color_transition.end,
                    easing: cmd.changes.easing ? parseEasing(cmd.changes.easing) : existing.color_transition.easing,
                  },
                };
              }
            }
            // Handle color constant changes
            if (cmd.changes.color_constant !== undefined) {
              changes.value = { color_constant: cmd.changes.color_constant };
            }
            return { eventIndex, changes };
          });
          cs.batchEditEvents(lineIdx as number, edits);
        }
        summaryParts.push(`Edited ${indices.length} events on line ${lineIdx}`);
        break;
      }

      case "remove_notes": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("remove_notes does not support line='new'");
        const line = useChartStore.getState().chart.lines[lineIdx as number];
        if (!line) throw new Error(`Line ${lineIdx} does not exist`);

        // Determine which note indices to remove
        let indices: number[];
        if (cmd.target === "all") {
          indices = line.notes.map((_, i) => i);
        } else if (cmd.target === "selected") {
          indices = useEditorStore.getState().selectedNoteIndices;
        } else if (typeof cmd.target === "object" && "beat_range" in cmd.target) {
          const [lo, hi] = cmd.target.beat_range;
          indices = line.notes
            .map((n, i) => ({ i, b: beatToFloat(n.beat) }))
            .filter(({ b }) => b >= lo && b <= hi)
            .map(({ i }) => i);
        } else if (typeof cmd.target === "object" && "kind" in cmd.target) {
          // Capture the narrowed variant into a local so the type stays
          // as `{ kind: NoteKind }` inside the filter closure — TS
          // widens `cmd.target` back to the full union across closures.
          const targetKind = cmd.target.kind;
          indices = line.notes
            .map((n, i) => ({ i, k: n.kind }))
            .filter(({ k }) => k === targetKind)
            .map(({ i }) => i);
        } else {
          indices = [];
        }

        cs.removeNotes(lineIdx as number, indices);
        summaryParts.push(`Removed ${indices.length} notes from line ${lineIdx}`);
        break;
      }

      case "remove_events": {
        const lineIdx = resolveLineIndex(cmd.line);
        if (lineIdx === "new") throw new Error("remove_events does not support line='new'");
        const line = useChartStore.getState().chart.lines[lineIdx as number];
        if (!line) throw new Error(`Line ${lineIdx} does not exist`);

        // Determine which event indices to remove
        let indices: number[];
        if (cmd.target === "selected") {
          indices = useEditorStore.getState().selectedEventIndices;
        } else {
          const target = cmd.target as { kind: string; beat_range: [number, number] };
          const [lo, hi] = target.beat_range;
          indices = line.events
            .map((e, i) => ({ i, b: beatToFloat(e.start_beat), k: e.kind }))
            .filter(({ b, k }) => k === target.kind && b >= lo && b <= hi)
            .map(({ i }) => i);
        }

        cs.removeEvents(lineIdx as number, indices);
        const targetDesc = cmd.target === "selected" ? "selected" : `${(cmd.target as { kind: string }).kind}`;
        summaryParts.push(`Removed ${indices.length} ${targetDesc} events from line ${lineIdx}`);
        break;
      }

      case "remove_line": {
        cs.removeLine(cmd.line);
        summaryParts.push(`Removed line ${cmd.line}`);
        break;
      }

      case "set_bpm": {
        const bpmList = cmd.bpm_list.map(b => ({
          beat: floatToBeat(b.beat),
          bpm: b.bpm,
        }));
        cs.setBpmList(bpmList);
        summaryParts.push(`Set BPM list: ${cmd.bpm_list.map(b => `${b.bpm}@beat${b.beat}`).join(", ")}`);
        break;
      }

      default:
        summaryParts.push(`Unknown command: ${(cmd as { command: string }).command}`);
    }
  }

  return {
    success: true,
    summary: summaryParts.join("\n"),
    linesCreated,
    notesCreated,
    eventsCreated,
  };
}

/**
 * Generate a human-readable preview summary WITHOUT executing.
 * Used to show the user what will happen before they click "Apply".
 */
export function previewAiCommands(commands: AiCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.command) {
      case "add_notes":
        parts.push(`+ Add ${cmd.notes.length} ${cmd.notes[0]?.kind ?? ""} notes to line ${cmd.line}`);
        break;
      case "add_line":
        parts.push(`+ Create new line "${cmd.name ?? "Unnamed"}" with ${cmd.notes?.length ?? 0} notes, ${cmd.events?.length ?? 0} events`);
        break;
      case "add_events": {
        const kindSet = [...new Set(cmd.events.map(e => e.kind))].join(", ");
        parts.push(`+ Add ${cmd.events.length} events (${kindSet}) to line ${cmd.line}`);
        break;
      }
      case "edit_line":
        parts.push(`~ Edit line ${cmd.line} properties`);
        break;
      case "edit_notes":
        parts.push(`~ Edit notes on line ${cmd.line} (target: ${JSON.stringify(cmd.target)})`);
        break;
      case "edit_events": {
        const editEvtDesc = `~ Edit events on line ${cmd.line}`;
        if (cmd.target === "all") {
          parts.push(`! ${editEvtDesc} — WARNING: modifies ALL events`);
        } else {
          parts.push(editEvtDesc);
        }
        break;
      }
      case "remove_notes":
        parts.push(`- Remove ${cmd.target === "all" ? "all" : cmd.target === "selected" ? "selected" : "matching"} notes from line ${cmd.line}`);
        break;
      case "remove_events":
        parts.push(`- Remove ${cmd.target === "selected" ? "selected" : (cmd.target as { kind: string }).kind} events from line ${cmd.line}`);
        break;
      case "remove_line":
        parts.push(`- Remove line ${cmd.line}`);
        break;
      case "set_bpm":
        parts.push(`# Set BPM: ${cmd.bpm_list.map(b => `${b.bpm}`).join(", ")}`);
        break;
      default:
        parts.push(`? Unknown command`);
    }
  }
  return parts.join("\n");
}

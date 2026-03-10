// ============================================================
// Chart Validation
//
// Scans a PhichainChart for potential issues:
//   - Overlapping notes (same beat + X on the same line)
//   - Invalid event values (opacity out of range, etc.)
//   - Orphan parent references (father_index pointing nowhere)
//   - Missing events (lines with no opacity event default to invisible)
//   - Notes outside canvas bounds
// ============================================================

import type { PhichainChart, Line, Note, LineEvent } from "../types/chart";
import { beatToFloat } from "../types/chart";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  lineIndex?: number;
  noteIndex?: number;
  eventIndex?: number;
}

/**
 * Validate a chart and return all detected issues.
 */
export function validateChart(chart: PhichainChart): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ---- Chart-level checks ----
  if (chart.bpm_list.length === 0) {
    issues.push({ severity: "error", message: "BPM list is empty. At least one BPM point is required." });
  }
  for (let i = 0; i < chart.bpm_list.length; i++) {
    if (chart.bpm_list[i].bpm <= 0) {
      issues.push({ severity: "error", message: `BPM point ${i} has invalid BPM value: ${chart.bpm_list[i].bpm}` });
    }
  }

  if (chart.lines.length === 0) {
    issues.push({ severity: "info", message: "Chart has no judgment lines." });
  }

  // ---- Per-line checks ----
  for (let li = 0; li < chart.lines.length; li++) {
    const line = chart.lines[li];
    validateLine(line, li, chart, issues);
  }

  return issues;
}

function validateLine(line: Line, lineIndex: number, chart: PhichainChart, issues: ValidationIssue[]): void {
  // Check for orphan father_index
  if (line.father_index !== undefined && line.father_index >= 0) {
    if (line.father_index >= chart.lines.length) {
      issues.push({
        severity: "error",
        lineIndex: lineIndex,
        message: `Line "${line.name}" (${lineIndex}) references father_index ${line.father_index} but only ${chart.lines.length} lines exist.`,
      });
    }
    if (line.father_index === lineIndex) {
      issues.push({
        severity: "error",
        lineIndex: lineIndex,
        message: `Line "${line.name}" (${lineIndex}) has father_index pointing to itself.`,
      });
    }
  }

  // Check for missing opacity event (line will be invisible by default)
  const hasOpacityEvent = line.events.some((e) => e.kind === "opacity");
  const hasLayerAlpha = line.event_layers?.some((l) => l.alpha_events.length > 0) ?? false;
  if (!hasOpacityEvent && !hasLayerAlpha) {
    issues.push({
      severity: "warning",
      lineIndex: lineIndex,
      message: `Line "${line.name}" (${lineIndex}) has no opacity events. It will be invisible.`,
    });
  }

  // Check for missing position events
  const hasXEvent = line.events.some((e) => e.kind === "x");
  const hasYEvent = line.events.some((e) => e.kind === "y");
  if (!hasXEvent && !hasYEvent && !(line.event_layers?.some((l) => l.move_x_events.length > 0 || l.move_y_events.length > 0))) {
    issues.push({
      severity: "info",
      lineIndex: lineIndex,
      message: `Line "${line.name}" (${lineIndex}) has no position events. It will stay at center (0, 0).`,
    });
  }

  // ---- Note checks ----
  validateNotes(line, lineIndex, issues);

  // ---- Event checks ----
  validateEvents(line.events, lineIndex, issues);
}

function validateNotes(line: Line, lineIndex: number, issues: ValidationIssue[]): void {
  // Check for overlapping notes (same beat and similar X position)
  const noteMap = new Map<string, number[]>();

  for (let ni = 0; ni < line.notes.length; ni++) {
    const note = line.notes[ni];

    // Check X bounds
    if (Math.abs(note.x) > 675) {
      issues.push({
        severity: "warning",
        lineIndex: lineIndex,
        noteIndex: ni,
        message: `Note ${ni} on line "${line.name}" has X=${note.x} which is outside canvas bounds (-675 to 675).`,
      });
    }

    // Check speed
    if (note.speed <= 0) {
      issues.push({
        severity: "warning",
        lineIndex: lineIndex,
        noteIndex: ni,
        message: `Note ${ni} on line "${line.name}" has speed=${note.speed}. Zero or negative speed may cause rendering issues.`,
      });
    }

    // Check alpha
    if (note.alpha !== undefined && (note.alpha < 0 || note.alpha > 255)) {
      issues.push({
        severity: "error",
        lineIndex: lineIndex,
        noteIndex: ni,
        message: `Note ${ni} on line "${line.name}" has invalid alpha=${note.alpha} (must be 0-255).`,
      });
    }

    // Track for overlap detection
    const beatKey = `${beatToFloat(note.beat).toFixed(4)}_${Math.round(note.x)}_${note.above}`;
    if (!noteMap.has(beatKey)) noteMap.set(beatKey, []);
    noteMap.get(beatKey)!.push(ni);
  }

  // Report overlapping notes
  for (const [, indices] of noteMap) {
    if (indices.length > 1) {
      issues.push({
        severity: "warning",
        lineIndex: lineIndex,
        noteIndex: indices[0],
        message: `${indices.length} notes overlap at the same beat/position on line "${line.name}" (notes: ${indices.join(", ")}).`,
      });
    }
  }
}

function validateEvents(events: LineEvent[], lineIndex: number, issues: ValidationIssue[]): void {
  for (let ei = 0; ei < events.length; ei++) {
    const event = events[ei];
    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);

    // Check beat ordering
    if (endBeat < startBeat) {
      issues.push({
        severity: "error",
        lineIndex: lineIndex,
        eventIndex: ei,
        message: `Event ${ei} (${event.kind}) has end beat (${endBeat.toFixed(2)}) before start beat (${startBeat.toFixed(2)}).`,
      });
    }

    // Check opacity values
    if (event.kind === "opacity") {
      if ("constant" in event.value && (event.value.constant < 0 || event.value.constant > 255)) {
        issues.push({
          severity: "warning",
          lineIndex: lineIndex,
          eventIndex: ei,
          message: `Opacity event ${ei} has value ${event.value.constant} outside range 0-255.`,
        });
      }
      if ("transition" in event.value) {
        const { start, end } = event.value.transition;
        if (start < 0 || start > 255 || end < 0 || end > 255) {
          issues.push({
            severity: "warning",
            lineIndex: lineIndex,
            eventIndex: ei,
            message: `Opacity transition event ${ei} has values outside range 0-255 (${start} -> ${end}).`,
          });
        }
      }
    }

    // Check easing clipping
    if (event.easing_left !== undefined && (event.easing_left < 0 || event.easing_left > 1)) {
      issues.push({
        severity: "warning",
        lineIndex: lineIndex,
        eventIndex: ei,
        message: `Event ${ei} (${event.kind}) has easing_left=${event.easing_left} outside 0-1 range.`,
      });
    }
    if (event.easing_right !== undefined && (event.easing_right < 0 || event.easing_right > 1)) {
      issues.push({
        severity: "warning",
        lineIndex: lineIndex,
        eventIndex: ei,
        message: `Event ${ei} (${event.kind}) has easing_right=${event.easing_right} outside 0-1 range.`,
      });
    }
  }
}

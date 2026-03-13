// ============================================================
// Note UID Utilities
//
// Notes are identified by array index within line.notes[], but
// indices shift on insert/delete. UIDs provide stable references
// for group membership that survive chart mutations.
// ============================================================

import type { PhichainChart } from "../types/chart";

/** Generate a new unique note ID */
export function generateNoteUid(): string {
  return crypto.randomUUID();
}

/**
 * Assign UIDs to all notes in the chart that don't have one.
 * Mutates the chart in-place (safe to call within Immer produce).
 */
export function ensureNoteUids(chart: PhichainChart): void {
  for (const line of chart.lines) {
    for (const note of line.notes) {
      if (!note.uid) {
        note.uid = generateNoteUid();
      }
    }
  }
}

/**
 * Build a lookup map from note UID → {lineIndex, noteIndex}.
 * Must be rebuilt whenever the chart structure changes.
 */
export function buildNoteUidMap(
  chart: PhichainChart,
): Map<string, { lineIndex: number; noteIndex: number }> {
  const map = new Map<string, { lineIndex: number; noteIndex: number }>();
  for (let li = 0; li < chart.lines.length; li++) {
    const line = chart.lines[li];
    for (let ni = 0; ni < line.notes.length; ni++) {
      const uid = line.notes[ni].uid;
      if (uid) {
        map.set(uid, { lineIndex: li, noteIndex: ni });
      }
    }
  }
  return map;
}

import type { Note, Beat } from "../types/chart";
import { beatToFloat, floatToBeat } from "../types/chart";

/**
 * Distribute X values linearly from startX to endX across selected notes,
 * ordered by beat time.
 */
export function distributeX(
  notes: Note[], noteIndices: number[], startX: number, endX: number,
): Array<{ noteIndex: number; changes: { x: number } }> {
  if (noteIndices.length < 2) return [];
  const sorted = [...noteIndices].sort(
    (a, b) => beatToFloat(notes[a].beat) - beatToFloat(notes[b].beat));
  return sorted.map((noteIndex, i) => ({
    noteIndex,
    changes: { x: Math.round(startX + (i / (sorted.length - 1)) * (endX - startX)) },
  }));
}

/**
 * Distribute beat times evenly between startBeat and endBeat.
 */
export function distributeBeats(
  notes: Note[], noteIndices: number[], startBeat: number, endBeat: number,
): Array<{ noteIndex: number; changes: { beat: Beat } }> {
  if (noteIndices.length < 2) return [];
  const sorted = [...noteIndices].sort(
    (a, b) => beatToFloat(notes[a].beat) - beatToFloat(notes[b].beat));
  return sorted.map((noteIndex, i) => ({
    noteIndex,
    changes: { beat: floatToBeat(startBeat + (i / (sorted.length - 1)) * (endBeat - startBeat)) },
  }));
}

/**
 * Offset all selected notes' X positions by a fixed delta.
 */
export function offsetX(
  notes: Note[], noteIndices: number[], delta: number,
): Array<{ noteIndex: number; changes: { x: number } }> {
  return noteIndices.map((noteIndex) => ({
    noteIndex,
    changes: { x: notes[noteIndex].x + delta },
  }));
}

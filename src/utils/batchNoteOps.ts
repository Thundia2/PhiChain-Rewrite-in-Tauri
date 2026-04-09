// Recent change: Added selectByRange() for beat/X/side-filtered
// note selection (Feature D — Select by Beat Range).
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

/**
 * Select notes on a line matching a beat range and optional X/side constraints.
 *
 * @param notes       - The line's note array
 * @param startBeat   - Start of beat range (inclusive, float)
 * @param endBeat     - End of beat range (inclusive, float)
 * @param xMin        - Minimum X position (null = no constraint)
 * @param xMax        - Maximum X position (null = no constraint)
 * @param sideFilter  - "all" | "above" | "below"
 * @returns Array of matching note indices
 */
export function selectByRange(
  notes: Note[],
  startBeat: number,
  endBeat: number,
  xMin: number | null = null,
  xMax: number | null = null,
  sideFilter: "all" | "above" | "below" = "all",
): number[] {
  const result: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const beat = beatToFloat(note.beat);
    if (beat < startBeat || beat > endBeat) continue;
    if (xMin !== null && note.x < xMin) continue;
    if (xMax !== null && note.x > xMax) continue;
    if (sideFilter === "above" && !note.above) continue;
    if (sideFilter === "below" && note.above) continue;
    result.push(i);
  }
  return result;
}

// ============================================================
// Curve Note Track — Note Generation
//
// Generates intermediate notes along a curved trajectory between
// two anchor notes. Uses the track's easing function to shape
// the X-position curve.
//
// Original from phichain-chart/src/curve_note_track.rs
// ============================================================

import type { Note, CurveNoteTrack } from "../types/chart";
import { beatToFloat } from "../types/chart";
import { floatToBeat } from "./beat";
import { evaluateEasing } from "../canvas/easings";

/**
 * Generate notes along a curve between two anchor notes.
 *
 * @param fromNote - Start anchor note
 * @param toNote   - End anchor note
 * @param track    - Curve track configuration
 * @returns Array of generated notes (NOT including the anchors)
 */
export function generateCurveNotes(
  fromNote: Note,
  toNote: Note,
  track: CurveNoteTrack,
): Note[] {
  const fromBeat = beatToFloat(fromNote.beat);
  const toBeat = beatToFloat(toNote.beat);
  const duration = toBeat - fromBeat;
  if (duration <= 0) return [];

  const totalNotes = Math.floor(duration * track.options.density);
  if (totalNotes <= 0) return [];

  const notes: Note[] = [];
  for (let i = 1; i <= totalNotes; i++) {
    const t = i / (totalNotes + 1); // Exclude endpoints
    const beat = floatToBeat(fromBeat + duration * t);

    // Interpolate X position using the curve easing
    const easedT = evaluateEasing(track.options.curve, t);
    const x = fromNote.x + (toNote.x - fromNote.x) * easedT;

    notes.push({
      kind: track.options.kind,
      above: fromNote.above,
      beat,
      x: Math.round(x),
      speed: fromNote.speed,
    });
  }

  return notes;
}

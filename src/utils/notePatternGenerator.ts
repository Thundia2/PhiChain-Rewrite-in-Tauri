import type { Note, NoteKind } from "../types/chart";
import { floatToBeat } from "../types/chart";
import type { NotePatternConfig } from "../types/notePattern";

export function generateNotePattern(config: NotePatternConfig): Note[] {
  const {
    startBeat, endBeat, noteCount, noteKind, above,
    shape, startX, endX,
    cycles = 2, amplitude, stairWidth = 4, arcHeight = 200,
    speed = 1, fake = false,
  } = config;

  if (noteCount < 1) return [];
  const notes: Note[] = [];
  const effectiveAmplitude = amplitude ?? Math.abs(endX - startX) / 2;
  const centerX = (startX + endX) / 2;

  for (let i = 0; i < noteCount; i++) {
    const t = noteCount === 1 ? 0 : i / (noteCount - 1);
    const beat = startBeat + t * (endBeat - startBeat);

    let x: number;
    switch (shape) {
      case "linear":
        x = startX + t * (endX - startX);
        break;
      case "sine":
        x = centerX + effectiveAmplitude * Math.sin(t * cycles * Math.PI * 2);
        break;
      case "cosine":
        x = centerX + effectiveAmplitude * Math.cos(t * cycles * Math.PI * 2);
        break;
      case "zigzag": {
        const cyclePos = (t * (cycles || 2)) % 1;
        x = cyclePos < 0.5
          ? startX + (endX - startX) * (cyclePos * 2)
          : endX - (endX - startX) * ((cyclePos - 0.5) * 2);
        break;
      }
      case "staircase": {
        const stepIndex = Math.floor(i / stairWidth);
        const totalSteps = Math.ceil(noteCount / stairWidth);
        const stepT = totalSteps <= 1 ? 0 : stepIndex / (totalSteps - 1);
        x = startX + stepT * (endX - startX);
        break;
      }
      case "arc": {
        const controlX = centerX;
        x = (1 - t) * (1 - t) * startX
          + 2 * (1 - t) * t * (controlX + arcHeight)
          + t * t * endX;
        break;
      }
      case "random":
        x = startX + Math.random() * (endX - startX);
        break;
      default:
        x = startX + t * (endX - startX);
    }

    x = Math.max(-675, Math.min(675, Math.round(x)));
    const note: Note = { kind: noteKind, beat: floatToBeat(beat), x, above, speed };
    if (fake) note.fake = true;
    if (noteKind === "hold") {
      note.hold_beat = floatToBeat(config.holdDuration ?? 1);
    }
    notes.push(note);
  }
  return notes;
}

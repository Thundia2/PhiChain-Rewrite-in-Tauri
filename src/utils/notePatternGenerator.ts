// Recent change: Added "custom" shape that evaluates user-typed math
// expressions via expr-eval. Supports t (0-1), pi, e, trig functions.

import { Parser } from "expr-eval";
import type { Note } from "../types/chart";
import { floatToBeat } from "../types/chart";
import type { NotePatternConfig } from "../types/notePattern";

// Shared parser instance — expr-eval Parser is stateless and reusable
const exprParser = new Parser();

/**
 * Compile a user expression string into a function of t.
 * Returns null if the expression is invalid.
 * The returned function evaluates the expression for a given t (0 to 1).
 */
export function compileExpression(expression: string): ((t: number) => number) | null {
  try {
    const parsed = exprParser.parse(expression);
    // Test evaluation at t=0 to catch errors early
    parsed.evaluate({ t: 0, pi: Math.PI, e: Math.E });
    return (t: number) => {
      return parsed.evaluate({ t, pi: Math.PI, e: Math.E });
    };
  } catch {
    return null;
  }
}

/**
 * Validate an expression string. Returns null if valid, or an error message.
 */
export function validateExpression(expression: string): string | null {
  try {
    const parsed = exprParser.parse(expression);
    // Test at a few points to catch runtime errors (division by zero at specific t, etc.)
    parsed.evaluate({ t: 0, pi: Math.PI, e: Math.E });
    parsed.evaluate({ t: 0.5, pi: Math.PI, e: Math.E });
    parsed.evaluate({ t: 1, pi: Math.PI, e: Math.E });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid expression";
  }
}

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

  // Pre-compile custom expression once before the loop (avoids re-parsing per note)
  const customFn = shape === "custom" && config.expression
    ? compileExpression(config.expression)
    : null;

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
      case "custom": {
        // Use pre-compiled expression. Falls back to linear if invalid.
        if (customFn) {
          try { x = customFn(t); } catch { x = startX + t * (endX - startX); }
        } else {
          x = startX + t * (endX - startX);
        }
        break;
      }
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

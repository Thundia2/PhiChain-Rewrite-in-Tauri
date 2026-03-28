import type { NoteKind } from "./chart";

export type PatternShape =
  | "linear" | "sine" | "cosine" | "zigzag"
  | "staircase" | "arc" | "random";

export interface NotePatternConfig {
  startBeat: number;
  endBeat: number;
  noteCount: number;
  noteKind: NoteKind;
  above: boolean;
  shape: PatternShape;
  startX: number;
  endX: number;
  cycles?: number;
  amplitude?: number;
  stairWidth?: number;
  arcHeight?: number;
  speed?: number;
  fake?: boolean;
  holdDuration?: number;
}

import type { NoteKind } from "./chart";

export type PatternShape =
  | "linear" | "sine" | "cosine" | "zigzag"
  | "staircase" | "arc" | "random" | "custom";

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
  /** Custom math expression for X position. Variable `t` goes from 0 to 1.
   *  Available: sin, cos, tan, abs, sqrt, pow, min, max, floor, ceil, round, pi, e
   *  Example: "300*sin(2*pi*t)" */
  expression?: string;
}

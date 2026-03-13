// ============================================================
// Parametric Curve Trajectory Generator
//
// Generates line movement events (X, Y, rotation) from
// parametric equations using sin/cos expressions.
//
// Example usage:
//   X(t) = amplitude * sin(frequency * t + phase) + offset
//   Y(t) = amplitude * cos(frequency * t + phase) + offset
//
// Generates a sequence of transition events spanning the
// start-to-end beat range with the specified step count.
// ============================================================

import type { LineEvent, LineEventKind } from "../types/chart";
import { floatToBeat } from "../types/chart";

export interface ParametricConfig {
  kind: LineEventKind;        // "x", "y", or "rotation"
  startBeat: number;          // Start beat (float)
  endBeat: number;            // End beat (float)
  steps: number;              // Number of event segments
  amplitude: number;          // Wave amplitude
  frequency: number;          // Cycles per beat range
  phase: number;              // Phase offset in radians
  offset: number;             // Base value offset
  waveform: "sin" | "cos";    // Waveform type
}

/**
 * Evaluate parametric function at normalized t (0-1).
 */
function evaluate(config: ParametricConfig, t: number): number {
  const angle = config.frequency * t * Math.PI * 2 + config.phase;
  const wave = config.waveform === "sin" ? Math.sin(angle) : Math.cos(angle);
  return config.amplitude * wave + config.offset;
}

/**
 * Generate a sequence of transition events from parametric equations.
 */
export function generateParametricEvents(config: ParametricConfig): LineEvent[] {
  const { kind, startBeat, endBeat, steps } = config;
  if (steps < 1 || endBeat <= startBeat) return [];

  const events: LineEvent[] = [];
  const beatRange = endBeat - startBeat;
  const stepSize = beatRange / steps;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const beat0 = startBeat + i * stepSize;
    const beat1 = startBeat + (i + 1) * stepSize;

    const val0 = evaluate(config, t0);
    const val1 = evaluate(config, t1);

    events.push({
      kind,
      start_beat: floatToBeat(beat0),
      end_beat: floatToBeat(beat1),
      value: {
        transition: {
          start: val0,
          end: val1,
          easing: "linear",
        },
      },
    });
  }

  return events;
}

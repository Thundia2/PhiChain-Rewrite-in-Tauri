// ============================================================
// Shake/Oscillation Event Generator
//
// Generates a sequence of alternating events that create a
// screen-shake or oscillation effect on a line property.
// Supports X, Y, and rotation oscillation.
//
// Recent change: Initial creation for Feature C (Shake Generator).
// ============================================================

import type { LineEvent, LineEventKind, EasingType } from "../types/chart";
import { floatToBeat } from "../types/chart";

export type ShakeKind = "x" | "y" | "rotation";

export interface ShakeConfig {
  /** Which event property to oscillate: "x", "y", or "rotation" */
  kind: ShakeKind;
  /** Beat where the shake starts */
  startBeat: number;
  /** Total duration in beats */
  durationBeats: number;
  /** Maximum displacement from center (chart coords for x/y, degrees for rotation) */
  amplitude: number;
  /** Oscillations per beat (e.g., 6 = alternates 6 times per beat) */
  frequency: number;
  /** Easing type for each oscillation segment */
  easing: EasingType;
  /** Decay mode: how amplitude changes over time */
  decay: "none" | "linear" | "exponential";
  /** For exponential decay: half-life in beats (amplitude halves every N beats) */
  decayHalfLife: number;
}

export const DEFAULT_SHAKE_CONFIG: ShakeConfig = {
  kind: "x",
  startBeat: 0,
  durationBeats: 2,
  amplitude: 10,
  frequency: 6,
  easing: "linear",
  decay: "none",
  decayHalfLife: 2,
};

// ---- Preset configs for common shake patterns ----

export interface ShakePreset {
  name: string;
  description: string;
  config: Partial<ShakeConfig>;
}

export const SHAKE_PRESETS: ShakePreset[] = [
  {
    name: "Light Tremor",
    description: "Subtle rapid vibration — good for tension buildup",
    config: {
      kind: "x", amplitude: 5, frequency: 8, durationBeats: 1,
      decay: "none", easing: "linear",
    },
  },
  {
    name: "Heavy Quake",
    description: "Strong shake with fast decay — impact moments",
    config: {
      kind: "x", amplitude: 25, frequency: 6, durationBeats: 2,
      decay: "exponential", decayHalfLife: 0.5, easing: "linear",
    },
  },
  {
    name: "Decaying Buzz",
    description: "High-frequency vibration that fades out linearly",
    config: {
      kind: "x", amplitude: 8, frequency: 12, durationBeats: 3,
      decay: "linear", easing: "linear",
    },
  },
  {
    name: "Y Bounce",
    description: "Vertical bounce — good for drop sections",
    config: {
      kind: "y", amplitude: 15, frequency: 4, durationBeats: 2,
      decay: "exponential", decayHalfLife: 1, easing: "ease_out_quad",
    },
  },
  {
    name: "Rotation Wobble",
    description: "Line rocks back and forth — +/-3 degrees, gentle decay",
    config: {
      kind: "rotation", amplitude: 3, frequency: 4, durationBeats: 2,
      decay: "linear", easing: "ease_in_out_sine",
    },
  },
  {
    name: "Violent Spin Shake",
    description: "Aggressive rotation shake — +/-8 degrees, high frequency",
    config: {
      kind: "rotation", amplitude: 8, frequency: 8, durationBeats: 1,
      decay: "exponential", decayHalfLife: 0.3, easing: "linear",
    },
  },
];

/**
 * Generate a sequence of events that create a shake/oscillation effect.
 *
 * The output alternates between +amplitude and -amplitude, with each
 * half-cycle as one event. The total number of events = frequency * duration * 2.
 *
 * @param config - Shake parameters
 * @returns Array of LineEvent objects ready to insert into a line
 */
export function generateShakeEvents(config: ShakeConfig): LineEvent[] {
  const {
    kind, startBeat, durationBeats, amplitude, frequency,
    easing, decay, decayHalfLife,
  } = config;

  if (durationBeats <= 0 || amplitude <= 0 || frequency <= 0) return [];

  const events: LineEvent[] = [];
  const totalCycles = frequency * durationBeats;
  const halfCycleDuration = durationBeats / (totalCycles * 2);

  for (let i = 0; i < totalCycles * 2; i++) {
    const t = i / (totalCycles * 2); // 0..1 progress through the shake
    const segStart = startBeat + i * halfCycleDuration;
    const segEnd = startBeat + (i + 1) * halfCycleDuration;

    // Calculate amplitude with decay
    let currentAmp = amplitude;
    if (decay === "linear") {
      currentAmp = amplitude * (1 - t);
    } else if (decay === "exponential") {
      const beatsElapsed = t * durationBeats;
      currentAmp = amplitude * Math.pow(0.5, beatsElapsed / decayHalfLife);
    }

    // Alternate direction: even segments go positive, odd go negative
    const direction = i % 2 === 0 ? 1 : -1;
    const nextDirection = (i + 1) % 2 === 0 ? 1 : -1;

    const startValue = direction * currentAmp;

    // End value: calculate decay at the end of this segment
    const tEnd = (i + 1) / (totalCycles * 2);
    let endAmp = amplitude;
    if (decay === "linear") {
      endAmp = amplitude * (1 - tEnd);
    } else if (decay === "exponential") {
      const beatsEnd = tEnd * durationBeats;
      endAmp = amplitude * Math.pow(0.5, beatsEnd / decayHalfLife);
    }
    const endValue = nextDirection * endAmp;

    events.push({
      kind: kind as LineEventKind,
      start_beat: floatToBeat(segStart),
      end_beat: floatToBeat(segEnd),
      value: {
        transition: {
          start: startValue,
          end: endValue,
          easing: easing,
        },
      },
    });
  }

  return events;
}

/**
 * Preview info: how many events will be generated.
 */
export function shakeEventCount(config: ShakeConfig): number {
  if (config.durationBeats <= 0 || config.amplitude <= 0 || config.frequency <= 0) return 0;
  return Math.floor(config.frequency * config.durationBeats * 2);
}

/**
 * Generate waveform preview data points for canvas rendering.
 * Returns an array of {t, value} pairs where t is 0..1 progress
 * and value is the oscillation value at that point.
 *
 * @param config - Shake parameters
 * @param resolution - Number of sample points (default 200)
 * @returns Array of {t, value} for plotting
 */
export function generateShakePreviewData(
  config: ShakeConfig,
  resolution: number = 200,
): Array<{ t: number; value: number }> {
  const { amplitude, frequency, durationBeats, decay, decayHalfLife } = config;
  if (durationBeats <= 0 || amplitude <= 0 || frequency <= 0) return [];

  const points: Array<{ t: number; value: number }> = [];
  for (let i = 0; i <= resolution; i++) {
    const t = i / resolution; // 0..1
    const beatsElapsed = t * durationBeats;

    // Calculate decayed amplitude at this point
    let amp = amplitude;
    if (decay === "linear") {
      amp = amplitude * (1 - t);
    } else if (decay === "exponential") {
      amp = amplitude * Math.pow(0.5, beatsElapsed / decayHalfLife);
    }

    // Oscillation: sin wave at the given frequency
    // frequency = oscillations per beat, so full cycles = frequency * beatsElapsed
    const phase = 2 * Math.PI * frequency * beatsElapsed;
    const value = amp * Math.sin(phase);

    points.push({ t, value });
  }
  return points;
}

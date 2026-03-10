// ============================================================
// Easing Functions
//
// Ported from phichain-chart/src/easing.rs
//
// When an event transitions a line from one value to another
// (e.g., X position 0 → 100 over 4 beats), the "easing" controls
// the acceleration curve. Linear means constant speed;
// EaseInQuad means slow start, fast end; etc.
//
// See https://easings.net/ for visual reference of each curve.
//
// Each function takes a progress value t (0.0 to 1.0) and returns
// the eased value (also typically 0.0 to 1.0, but some curves
// overshoot like Back and Elastic).
// ============================================================

import type { EasingType } from "../types/chart";

const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;

// ============================================================
// Core easing functions — one for each named curve
// ============================================================

const easingFunctions: Record<string, (t: number) => number> = {
  linear: (t) => t,

  // Sine
  ease_in_sine: (t) => 1 - Math.cos((t * PI) / 2),
  ease_out_sine: (t) => Math.sin((t * PI) / 2),
  ease_in_out_sine: (t) => -(Math.cos(PI * t) - 1) / 2,

  // Quadratic
  ease_in_quad: (t) => t * t,
  ease_out_quad: (t) => 1 - (1 - t) * (1 - t),
  ease_in_out_quad: (t) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

  // Cubic
  ease_in_cubic: (t) => t * t * t,
  ease_out_cubic: (t) => 1 - Math.pow(1 - t, 3),
  ease_in_out_cubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Quartic
  ease_in_quart: (t) => t * t * t * t,
  ease_out_quart: (t) => 1 - Math.pow(1 - t, 4),
  ease_in_out_quart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

  // Quintic
  ease_in_quint: (t) => t * t * t * t * t,
  ease_out_quint: (t) => 1 - Math.pow(1 - t, 5),
  ease_in_out_quint: (t) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,

  // Exponential
  ease_in_expo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  ease_out_expo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  ease_in_out_expo: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,

  // Circular
  ease_in_circ: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  ease_out_circ: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  ease_in_out_circ: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  // Back (overshoots slightly)
  ease_in_back: (t) => c3 * t * t * t - c1 * t * t,
  ease_out_back: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  ease_in_out_back: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,

  // Elastic (spring-like)
  ease_in_elastic: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4),
  ease_out_elastic: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  ease_in_out_elastic: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,

  // Bounce
  ease_out_bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  ease_in_bounce: (t) => 1 - easingFunctions.ease_out_bounce(1 - t),
  ease_in_out_bounce: (t) =>
    t < 0.5
      ? (1 - easingFunctions.ease_out_bounce(1 - 2 * t)) / 2
      : (1 + easingFunctions.ease_out_bounce(2 * t - 1)) / 2,
};

// ============================================================
// Custom easing types (cubic bezier, steps, elastic with omega)
// ============================================================

/**
 * Evaluate a cubic bezier easing curve.
 * Control points: (0,0), (x1,y1), (x2,y2), (1,1)
 *
 * This matches bevy::prelude::CubicSegment::new_bezier_easing
 * from the original Rust code.
 */
function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Newton-Raphson method to find the parameter for a given t (x value)
  // then evaluate the y value at that parameter
  const epsilon = 1e-6;
  let param = t; // Initial guess

  for (let i = 0; i < 8; i++) {
    // Evaluate x(param) using the bezier formula
    const x = 3 * (1 - param) * (1 - param) * param * x1
            + 3 * (1 - param) * param * param * x2
            + param * param * param;
    const dx = 3 * (1 - param) * (1 - param) * x1
             + 6 * (1 - param) * param * (x2 - x1)
             + 3 * param * param * (1 - x2);
    if (Math.abs(dx) < epsilon) break;
    param -= (x - t) / dx;
    param = Math.max(0, Math.min(1, param));
  }

  // Evaluate y(param)
  return 3 * (1 - param) * (1 - param) * param * y1
       + 3 * (1 - param) * param * param * y2
       + param * param * param;
}

/**
 * Step easing — holds at discrete levels instead of smoothly transitioning.
 * With 4 steps: 0.0, 0.25, 0.5, 0.75, 1.0
 */
function stepsEase(numSteps: number, t: number): number {
  const steps = Math.max(1, numSteps);
  return Math.round(t * steps) / steps;
}

/**
 * Elastic easing with configurable omega (frequency).
 * From the original Rust: 1.0 - (1.0 - x)² × (2sin(ωx)/ω + cos(ωx))
 */
function elasticOmegaEase(omega: number, t: number): number {
  return 1.0 - (1.0 - t) * (1.0 - t)
    * (2.0 * Math.sin(omega * t) / omega + Math.cos(omega * t));
}

// ============================================================
// Public API
// ============================================================

/**
 * Evaluate an easing function at a given progress t (0.0 to 1.0).
 *
 * @param easing - The easing type (from the chart data)
 * @param t - Progress from 0.0 (start) to 1.0 (end)
 * @returns The eased value
 */
export function evaluateEasing(easing: EasingType, t: number): number {
  // Named easings (string type)
  if (typeof easing === "string") {
    const fn = easingFunctions[easing];
    if (fn) return fn(t);
    // Fallback: treat unknown as linear
    console.warn(`Unknown easing type: ${easing}, falling back to linear`);
    return t;
  }

  // Custom cubic bezier: { custom: [x1, y1, x2, y2] }
  if ("custom" in easing) {
    const [x1, y1, x2, y2] = easing.custom;
    return cubicBezierEase(x1, y1, x2, y2, t);
  }

  // Step function: { steps: number }
  if ("steps" in easing) {
    return stepsEase(easing.steps, t);
  }

  // Elastic with custom omega: { elastic: number }
  if ("elastic" in easing) {
    return elasticOmegaEase(easing.elastic, t);
  }

  return t;
}

/**
 * Interpolate (tween) between two values using an easing function.
 * This is the primary function used by the renderer to evaluate events.
 *
 * @param start - Starting value
 * @param end - Ending value
 * @param t - Progress from 0.0 to 1.0
 * @param easing - The easing type
 * @param easingLeft - Sub-range start (0.0-1.0, default 0.0) — clips easing curve
 * @param easingRight - Sub-range end (0.0-1.0, default 1.0) — clips easing curve
 * @returns The interpolated value
 */
export function tween(
  start: number, end: number, t: number, easing: EasingType,
  easingLeft?: number, easingRight?: number,
): number {
  const left = easingLeft ?? 0.0;
  const right = easingRight ?? 1.0;
  // Remap t from [0,1] to [left, right] sub-range before applying easing
  const clippedT = left + t * (right - left);
  const easedT = evaluateEasing(easing, clippedT);
  return start + (end - start) * easedT;
}

/**
 * List of all named easing types (for dropdowns/selectors in the UI).
 */
export const EASING_NAMES: string[] = Object.keys(easingFunctions);

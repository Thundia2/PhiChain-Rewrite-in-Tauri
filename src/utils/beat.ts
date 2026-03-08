// ============================================================
// Beat Arithmetic Utilities
//
// Ported from phichain-chart/src/beat.rs
//
// In Phigros/Phira charts, timing is measured in "beats" rather
// than seconds. A beat is stored as a tuple of three integers:
//   [whole, numerator, denominator]
//
// For example:
//   Beat 0         = [0, 0, 1]
//   Beat 1         = [1, 0, 1]
//   Beat 2 and 3/4 = [2, 3, 4]
//   Beat 0 and 1/3 = [0, 1, 3]
//
// This avoids floating-point rounding errors that would cause
// notes to drift off the beat grid over time. The Rust backend
// uses Rational32 (exact fractions); here we use integer math
// with GCD reduction for the same precision.
// ============================================================

import type { Beat } from "../types/chart";

// ============================================================
// CONFIGURABLE: Maximum denominator when converting floats to beats.
// Higher = more precision but larger numbers. 32 means the finest
// grid is 1/32 of a beat (32nd notes in music terms).
// ============================================================
const DEFAULT_MAX_DENOM = 32;

/** Greatest Common Divisor — used to reduce fractions */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Least Common Multiple */
function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

/**
 * Reduce a beat to its simplest form.
 * For example: [1, 4, 8] becomes [1, 1, 2]
 * and [0, 6, 4] becomes [1, 1, 2]
 */
export function reduceBeat(beat: Beat): Beat {
  let [whole, numer, denom] = beat;

  // Handle negative numerators
  if (numer < 0) {
    whole -= 1;
    numer += denom;
  }

  // Carry over: if numer >= denom, add to whole part
  if (numer >= denom) {
    whole += Math.floor(numer / denom);
    numer = numer % denom;
  }

  // Reduce the fraction
  if (numer === 0) {
    return [whole, 0, 1];
  }

  const g = gcd(Math.abs(numer), denom);
  return [whole, numer / g, denom / g];
}

/** Convert a Beat tuple to a decimal number. [2, 3, 4] → 2.75 */
export function beatToFloat(beat: Beat): number {
  return beat[0] + beat[1] / beat[2];
}

/**
 * Convert a decimal number to the nearest Beat tuple.
 * Uses the Stern-Brocot tree approach for best rational approximation.
 *
 * @param value - The decimal beat value (e.g., 2.75)
 * @param maxDenom - Maximum denominator allowed (default 32)
 * @returns The closest Beat tuple (e.g., [2, 3, 4])
 */
export function floatToBeat(value: number, maxDenom: number = DEFAULT_MAX_DENOM): Beat {
  const whole = Math.floor(value);
  const frac = value - whole;

  if (Math.abs(frac) < 1e-9) return [whole, 0, 1];
  if (Math.abs(frac - 1) < 1e-9) return [whole + 1, 0, 1];

  // Find the best fraction approximation with denominator <= maxDenom
  let bestNumer = 0;
  let bestDenom = 1;
  let bestError = Math.abs(frac);

  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(frac * d);
    if (n < 0 || n > d) continue;
    const error = Math.abs(frac - n / d);
    if (error < bestError - 1e-12) {
      bestNumer = n;
      bestDenom = d;
      bestError = error;
      if (error < 1e-12) break; // Exact match
    }
  }

  return reduceBeat([whole, bestNumer, bestDenom]);
}

/**
 * Compare two beats.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareBeats(a: Beat, b: Beat): number {
  // Convert to common denominator for exact comparison
  const d = lcm(a[2], b[2]);
  const aVal = a[0] * d + a[1] * (d / a[2]);
  const bVal = b[0] * d + b[1] * (d / b[2]);
  return aVal - bVal;
}

/** Check if two beats are exactly equal */
export function beatsEqual(a: Beat, b: Beat): boolean {
  const ra = reduceBeat(a);
  const rb = reduceBeat(b);
  return ra[0] === rb[0] && ra[1] === rb[1] && ra[2] === rb[2];
}

/** Add two beats together. [1, 1, 4] + [0, 3, 4] = [2, 0, 1] */
export function addBeats(a: Beat, b: Beat): Beat {
  const d = lcm(a[2], b[2]);
  const totalNumer = a[0] * d + a[1] * (d / a[2]) + b[0] * d + b[1] * (d / b[2]);
  return reduceBeat([0, totalNumer, d]);
}

/** Subtract beat b from beat a. [2, 0, 1] - [0, 1, 4] = [1, 3, 4] */
export function subtractBeats(a: Beat, b: Beat): Beat {
  const d = lcm(a[2], b[2]);
  const totalNumer = (a[0] * d + a[1] * (d / a[2])) - (b[0] * d + b[1] * (d / b[2]));
  return reduceBeat([0, totalNumer, d]);
}

/**
 * Snap a float beat value to the nearest grid position.
 * The grid is determined by "density" — how many subdivisions per beat.
 *
 * @param value - The raw beat value (e.g., 2.73)
 * @param density - Subdivisions per beat (e.g., 4 = quarter-beat grid)
 * @returns Snapped beat (e.g., [2, 3, 4] for density=4)
 */
export function snapBeat(value: number, density: number): Beat {
  const whole = Math.floor(value);
  const frac = value - whole;
  const snappedNumer = Math.round(frac * density);
  return reduceBeat([whole, snappedNumer, density]);
}

/**
 * Get the minimum beat step for a given density.
 * For density=4, this is [0, 1, 4] (one quarter-beat).
 */
export function minimumBeat(density: number): Beat {
  return [0, 1, density];
}

/** Format a beat for display. [2, 3, 4] → "2:3/4" */
export function formatBeat(beat: Beat): string {
  const r = reduceBeat(beat);
  if (r[1] === 0) return `${r[0]}`;
  return `${r[0]}:${r[1]}/${r[2]}`;
}

/** The zero beat: [0, 0, 1] */
export const BEAT_ZERO: Beat = [0, 0, 1];

/** One full beat: [1, 0, 1] */
export const BEAT_ONE: Beat = [1, 0, 1];

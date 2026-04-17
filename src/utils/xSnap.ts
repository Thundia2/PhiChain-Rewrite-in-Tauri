// ============================================================
// X Snap — snaps note X positions to a vertical-line grid.
//
// Uses RPE convention: N = verticalLines = number of grid LINES
// (not divisions). N lines produce N−1 gaps across the full
// X range (−675 to +675 = 1350 units).
//
//   N = 11 → 10 gaps, step 135   (5-key feel)
//   N = 21 → 20 gaps, step 67.5  (charter standard)
//   N = 31 → 30 gaps, step 45    (dense)
//
// Recent change: Rewritten to use verticalLines (line count)
// instead of divisions (gap count). Formula is now
// step = X_RANGE / (N − 1) instead of X_RANGE / divisions.
// Added hasCenterLine() and getXSpacing() helpers.
// ============================================================

import { CANVAS_WIDTH } from "../types/chart";

// ---- Exported constants ----

/** Maximum X coordinate (half of CANVAS_WIDTH) */
export const X_MAX = CANVAS_WIDTH / 2; // 675

/** Full X range: −675 to +675 */
export const X_RANGE = CANVAS_WIDTH; // 1350

/** Minimum valid vertical line count (need at least 2 for a gap) */
export const MIN_VERTICAL_LINES = 2;

// ---- Core snap function ----

/**
 * Snap an X position to the nearest grid line.
 *
 * Examples:
 *   N = 11 → step 135:  −675, −540, −405, ..., 675
 *   N = 21 → step 67.5: −675, −607.5, −540, ..., 675
 *   N = 31 → step 45:   −675, −630, −585, ..., 675
 *
 * @param rawX - The raw X position from the click (−675 to +675)
 * @param verticalLines - Number of grid lines (N ≥ 2). If < 2, returns rawX unchanged.
 * @returns Snapped X position, or rawX if verticalLines < 2
 */
export function snapX(rawX: number, verticalLines: number): number {
  if (verticalLines < MIN_VERTICAL_LINES) return rawX;

  const step = X_RANGE / (verticalLines - 1);
  const snapped = Math.round(rawX / step) * step;

  // Clamp to valid range
  return Math.max(-X_MAX, Math.min(X_MAX, snapped));
}

// ---- Grid position helpers ----

/**
 * Get all snap positions for rendering grid lines on the canvas.
 *
 * @param verticalLines - Number of grid lines (N ≥ 2). If < 2, returns empty array.
 * @returns Array of N X positions in chart coordinates (−675 to +675)
 */
export function getXSnapPositions(verticalLines: number): number[] {
  if (verticalLines < MIN_VERTICAL_LINES) return [];

  const step = X_RANGE / (verticalLines - 1);
  const positions: number[] = [];
  for (let i = 0; i < verticalLines; i++) {
    positions.push(-X_MAX + i * step);
  }
  return positions;
}

/**
 * Get the spacing between adjacent grid lines.
 *
 * @param verticalLines - Number of grid lines (N ≥ 2)
 * @returns Spacing in X-coordinate units, or 0 if N < 2
 */
export function getXSpacing(verticalLines: number): number {
  if (verticalLines < MIN_VERTICAL_LINES) return 0;
  return X_RANGE / (verticalLines - 1);
}

/**
 * Check whether a center grid line exists at X=0.
 * True only when N is an odd integer — the middle line index
 * (N−1)/2 then lands exactly at X=0.
 *
 * @param verticalLines - Number of grid lines
 * @returns true if X=0 is a snap point
 */
export function hasCenterLine(verticalLines: number): boolean {
  return Number.isInteger(verticalLines) && verticalLines % 2 === 1;
}

// ============================================================
// X Snap — snaps note X positions to a lane grid.
//
// The grid divides the full X range (−675 to +675) into `divisions`
// equal segments, producing `divisions + 1` snap positions.
//
// Recent change: Initial creation for Feature A (X Snap Grid).
// ============================================================

import { CANVAS_WIDTH } from "../types/chart";

/** Maximum X coordinate (half of CANVAS_WIDTH) */
const MAX_X = CANVAS_WIDTH / 2; // 675

/**
 * Snap an X position to the nearest lane in a grid of `divisions` lanes.
 *
 * Examples:
 *   divisions = 9  → 10 positions, step = 150: −675, −525, −375, ..., 675
 *   divisions = 18 → 19 positions, step = 75:  −675, −600, −525, ..., 675
 *   divisions = 30 → 31 positions, step = 45:  matches Icyxis convention
 *
 * @param rawX - The raw X position from the click (−675 to +675)
 * @param divisions - Number of divisions (0 = no snap / free placement)
 * @returns Snapped X position, or rawX if divisions is 0
 */
export function snapX(rawX: number, divisions: number): number {
  if (divisions <= 0) return rawX;

  const step = (MAX_X * 2) / divisions;
  const snapped = Math.round(rawX / step) * step;

  // Clamp to valid range
  return Math.max(-MAX_X, Math.min(MAX_X, snapped));
}

/**
 * Get all snap positions for rendering grid lines on the canvas.
 *
 * @param divisions - Number of divisions (0 = empty array)
 * @returns Array of X positions in chart coordinates
 */
export function getXSnapPositions(divisions: number): number[] {
  if (divisions <= 0) return [];

  const step = (MAX_X * 2) / divisions;
  const positions: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    positions.push(-MAX_X + i * step);
  }
  return positions;
}

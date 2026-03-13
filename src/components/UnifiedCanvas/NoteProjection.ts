// ============================================================
// Note Projection — Screen ↔ Chart Coordinate Math
//
// Converts between screen pixel coordinates and chart-space
// coordinates for note placement and editing.
//
// Key operations:
//   1. Transform a screen click into line-local coordinates
//   2. Determine noteX, above/below from local coordinates
//   3. Convert perpendicular distance from line to a beat
//      using binary search on distanceAt()
//   4. Snap the resulting beat to the editor's grid density
// ============================================================

import type { Line, Beat } from "../../types/chart";
import { CANVAS_WIDTH } from "../../types/chart";
import { distanceAt } from "../../canvas/events";
import { snapBeat } from "../../utils/beat";
import type { BpmList } from "../../utils/bpmList";

// ============================================================
// Types
// ============================================================

export interface ClickToLineResult {
  /** Position along the line (in Phigros x-coords, -675 to +675) */
  noteX: number;
  /** Whether the click was above (true) or below (false) the line */
  above: boolean;
  /** Perpendicular distance from the line in screen pixels (always >= 0) */
  perpDistance: number;
  /** Position along the line in screen pixels */
  parallelDistance: number;
}

export interface NotePlacementResult {
  /** Beat to place the note at (snapped to grid) */
  beat: Beat;
  /** Note X position in chart coordinates */
  x: number;
  /** Whether the note is above the line */
  above: boolean;
}

// ============================================================
// Screen → Line-Local Coordinate Transform
// ============================================================

/**
 * Transform a screen click position into line-local coordinates.
 *
 * The renderer draws each line by translating to (screenX, screenY)
 * then rotating by -state.rotation. To reverse this transform:
 *
 * 1. Subtract line's screen position to get delta
 * 2. Apply inverse rotation to get line-local coordinates
 *
 * In line-local space:
 *   - localX = position along the line (left/right)
 *   - localY = perpendicular distance from the line
 *     - Negative = above the line (notes fall from above)
 *     - Positive = below the line
 *
 * @param clickX - Click X in screen pixels
 * @param clickY - Click Y in screen pixels
 * @param lineScreenX - Line center X in screen pixels
 * @param lineScreenY - Line center Y in screen pixels
 * @param lineRotation - Line rotation in radians (from LineState, before negation)
 * @param canvasWidth - Canvas width in pixels
 * @returns Line-local position info
 */
export function screenToLineLocal(
  clickX: number,
  clickY: number,
  lineScreenX: number,
  lineScreenY: number,
  lineRotation: number,
  canvasWidth: number,
): ClickToLineResult {
  const dx = clickX - lineScreenX;
  const dy = clickY - lineScreenY;

  // The renderer applies ctx.rotate(-rotation), so a local point (lx, ly) maps to:
  //   dx = lx*cos(rot) + ly*sin(rot)
  //   dy = -lx*sin(rot) + ly*cos(rot)
  // To invert, apply R(+rot):
  //   lx = dx*cos(rot) - dy*sin(rot)
  //   ly = dx*sin(rot) + dy*cos(rot)
  const cos = Math.cos(lineRotation);
  const sin = Math.sin(lineRotation);

  // localX = along the line, localY = perpendicular
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Convert localX from screen pixels to Phigros coordinates
  const noteX = (localX / canvasWidth) * CANVAS_WIDTH;

  // Above = the rendering "above" side of the line
  // In the renderer, notes with above=true are drawn at -rawY (negative Y in line-local space)
  // In screen coords after the -rotation transform, "above" corresponds to localY < 0
  const above = localY < 0;

  return {
    noteX,
    above,
    perpDistance: Math.abs(localY),
    parallelDistance: localX,
  };
}

// ============================================================
// Distance → Beat Conversion (Binary Search)
// ============================================================

/**
 * Convert a perpendicular pixel distance from a line into a beat value.
 *
 * Uses the speed-integral distance function (distanceAt) which is
 * monotonically increasing, so we can binary search for the time
 * that produces the target distance, then convert time → beat.
 *
 * The rendering formula for note Y position is:
 *   rawY = (noteDistance - currentDistance) * note.speed * distanceScale
 *
 * Solving for noteDistance (assuming speed=1 for placement):
 *   noteDistance = currentDistance + pixelDistance / distanceScale
 *
 * Then we binary search for the time where distanceAt() ≈ noteDistance.
 *
 * @param pixelDistance - Perpendicular distance from line in screen pixels (always positive)
 * @param line - The line being edited
 * @param currentTime - Current playback time (seconds, already offset-adjusted)
 * @param bpmList - BPM list for time↔beat conversion
 * @param canvasHeight - Canvas height in pixels
 * @param density - Grid subdivision for snapping (e.g., 4 = quarter-beat)
 * @returns Beat tuple snapped to the grid
 */
export function beatFromScreenDistance(
  pixelDistance: number,
  line: Line,
  currentTime: number,
  bpmList: BpmList,
  canvasHeight: number,
  density: number,
): Beat {
  const speedEvents = line.events.filter((e) => e.kind === "speed");
  const distanceScale = canvasHeight * (120.0 / 900.0);
  const bpmTimeAt = (beat: Beat) => bpmList.timeAt(beat);

  const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);
  const bpmFactor = line.bpm_factor ?? 1;

  // Target distance the note would be at
  // Rendering divides distance deltas by bpmFactor, so the inverse multiplies
  const targetDistance = currentDistance + (pixelDistance * bpmFactor) / distanceScale;

  // Binary search: find time t where distanceAt(speedEvents, t, bpmTimeAt) ≈ targetDistance
  let lo = currentTime;
  let hi = currentTime + 60; // Search up to 60 seconds ahead

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (distanceAt(speedEvents, mid, bpmTimeAt) < targetDistance) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Convert time to beat, then snap to grid
  const beatFloat = bpmList.beatAtFloat((lo + hi) / 2);
  return snapBeat(beatFloat, density);
}

// ============================================================
// Full Note Placement Pipeline
// ============================================================

/**
 * Complete note placement: screen click → (beat, x, above).
 *
 * Combines the line-local transform with the distance-to-beat conversion
 * to produce a fully resolved note placement result.
 *
 * @param clickX - Click X in screen pixels
 * @param clickY - Click Y in screen pixels
 * @param lineScreenX - Line center X in screen pixels
 * @param lineScreenY - Line center Y in screen pixels
 * @param lineRotation - Line rotation in radians (from LineState)
 * @param line - The line to place the note on
 * @param currentTime - Current playback time (seconds, offset-adjusted)
 * @param bpmList - BPM list for time↔beat conversion
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param density - Grid subdivision for beat snapping
 * @returns Note placement result with (beat, x, above), or null if too close to line
 */
export function projectClickToNote(
  clickX: number,
  clickY: number,
  lineScreenX: number,
  lineScreenY: number,
  lineRotation: number,
  line: Line,
  currentTime: number,
  bpmList: BpmList,
  canvasWidth: number,
  canvasHeight: number,
  density: number,
): NotePlacementResult | null {
  // Step 1: Transform to line-local coordinates
  const local = screenToLineLocal(
    clickX, clickY,
    lineScreenX, lineScreenY,
    lineRotation, canvasWidth,
  );

  // Skip if too close to the line itself (< 5 pixels perpendicular)
  if (local.perpDistance < 5) return null;

  // Step 2: Convert perpendicular distance to a beat
  const beat = beatFromScreenDistance(
    local.perpDistance,
    line,
    currentTime,
    bpmList,
    canvasHeight,
    density,
  );

  // Step 3: Clamp noteX to reasonable range
  const x = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, Math.round(local.noteX)));

  return {
    beat,
    x,
    above: local.above,
  };
}

// ============================================================
// Ghost Note Preview Position
// ============================================================

/**
 * Compute a pending (ghost) note from current mouse position.
 *
 * Same as projectClickToNote but returns a PendingNote-compatible object.
 * Returns null if the mouse is too close to the line or outside
 * reasonable placement range.
 */
export function computeGhostNote(
  mouseX: number,
  mouseY: number,
  lineScreenX: number,
  lineScreenY: number,
  lineRotation: number,
  line: Line,
  currentTime: number,
  bpmList: BpmList,
  canvasWidth: number,
  canvasHeight: number,
  density: number,
  noteKind: string,
): { beat: Beat; x: number; kind: string; above: boolean } | null {
  const result = projectClickToNote(
    mouseX, mouseY,
    lineScreenX, lineScreenY,
    lineRotation, line,
    currentTime, bpmList,
    canvasWidth, canvasHeight,
    density,
  );

  if (!result) return null;

  return {
    beat: result.beat,
    x: result.x,
    kind: noteKind,
    above: result.above,
  };
}

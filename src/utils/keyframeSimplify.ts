// ============================================================
// Keyframe Simplification — Ramer-Douglas-Peucker
//
// Reduces recorded keyframe count by removing points that don't
// significantly change the curve shape.
// ============================================================

export interface SimplifiableKeyframe {
  beat: number;
  value: number;
}

/**
 * Simplify a recorded keyframe array using Ramer-Douglas-Peucker.
 *
 * @param keyframes Array of { beat, value } pairs (sorted by beat)
 * @param epsilon Maximum perpendicular distance threshold (0 = keep all)
 * @returns Simplified array of keyframes
 */
export function simplifyKeyframes(
  keyframes: Array<{ beat: number; value: number }>,
  epsilon: number,
): Array<{ beat: number; value: number }> {
  if (keyframes.length <= 2) return keyframes;

  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  let maxDist = 0;
  let maxIndex = 0;

  for (let i = 1; i < keyframes.length - 1; i++) {
    const dist = perpendicularDistance(keyframes[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyKeyframes(keyframes.slice(0, maxIndex + 1), epsilon);
    const right = simplifyKeyframes(keyframes.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

/**
 * Preview the result of simplification without creating the full output.
 * Returns just the count of keyframes that would remain.
 */
export function previewSimplification(
  keyframes: Array<{ beat: number; value: number }>,
  epsilon: number,
): number {
  return simplifyKeyframes(keyframes, epsilon).length;
}

function perpendicularDistance(
  point: { beat: number; value: number },
  lineStart: { beat: number; value: number },
  lineEnd: { beat: number; value: number },
): number {
  const dx = lineEnd.beat - lineStart.beat;
  const dy = lineEnd.value - lineStart.value;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) {
    return Math.sqrt(
      (point.beat - lineStart.beat) ** 2 + (point.value - lineStart.value) ** 2,
    );
  }
  return (
    Math.abs(
      dy * point.beat -
        dx * point.value +
        lineEnd.beat * lineStart.value -
        lineEnd.value * lineStart.beat,
    ) / len
  );
}

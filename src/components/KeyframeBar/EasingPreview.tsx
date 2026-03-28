// ============================================================
// Easing Preview — Small inline SVG thumbnail of an easing curve
// ============================================================

import type { EasingType } from "../../types/chart";

interface EasingPreviewProps {
  easing: EasingType;
  width?: number;
  height?: number;
  color?: string;
}

export function EasingPreview({
  easing,
  width = 32,
  height = 16,
  color = "var(--accent-primary)",
}: EasingPreviewProps) {
  const steps = 20;
  const points: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = simpleEval(t, easing);
    const x = (t * (width - 2)) + 1;
    const y = height - 1 - v * (height - 2);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
    </svg>
  );
}

function simpleEval(t: number, easing: EasingType): number {
  if (typeof easing !== "string") return t;
  switch (easing) {
    case "linear": return t;
    case "ease_in_quad": return t * t;
    case "ease_out_quad": return 1 - (1 - t) * (1 - t);
    case "ease_in_out_quad": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "ease_in_cubic": return t * t * t;
    case "ease_out_cubic": return 1 - Math.pow(1 - t, 3);
    case "ease_in_sine": return 1 - Math.cos((t * Math.PI) / 2);
    case "ease_out_sine": return Math.sin((t * Math.PI) / 2);
    default: return t; // Fallback to linear for preview
  }
}

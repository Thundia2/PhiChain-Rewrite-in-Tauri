// ============================================================
// Preset Curve Preview — Mini SVG showing preset shape
// ============================================================

import { EVENT_COLORS } from "../../constants/eventColors";
import type { EventPreset } from "../../types/preset";
import { beatToFloat } from "../../types/chart";

interface PresetCurvePreviewProps {
  preset: EventPreset;
  width?: number;
  height?: number;
}

export function PresetCurvePreview({ preset, width = 80, height = 40 }: PresetCurvePreviewProps) {
  const totalDuration = preset.defaultDuration ?? 4;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const tmpl of preset.template) {
    if ("beatOffset" in tmpl) {
      // BuiltinTemplateEntry format
      if ("constant" in tmpl.value) {
        const v = typeof tmpl.value.constant === "number" ? tmpl.value.constant : 0;
        minVal = Math.min(minVal, v);
        maxVal = Math.max(maxVal, v);
      } else {
        const s = typeof tmpl.value.transition.start === "number" ? tmpl.value.transition.start : 0;
        const e = typeof tmpl.value.transition.end === "number" ? tmpl.value.transition.end : 0;
        minVal = Math.min(minVal, s, e);
        maxVal = Math.max(maxVal, s, e);
      }
    } else {
      // EventTemplate format
      const s = typeof tmpl.startValue === "number" ? tmpl.startValue : 0;
      const e = typeof tmpl.endValue === "number" ? tmpl.endValue : 0;
      minVal = Math.min(minVal, s, e);
      maxVal = Math.max(maxVal, s, e);
    }
  }
  const valRange = maxVal - minVal || 1;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} rx={3} fill="rgba(12,12,18,0.6)" />
      {preset.template.map((tmpl, i) => {
        const points: string[] = [];
        const steps = 20;

        if ("beatOffset" in tmpl) {
          // BuiltinTemplateEntry format
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const beat = tmpl.beatOffset + (tmpl.endBeatOffset - tmpl.beatOffset) * t;
            const x = (beat / totalDuration) * width;

            let value: number;
            if ("constant" in tmpl.value) {
              value = typeof tmpl.value.constant === "number" ? tmpl.value.constant : 0;
            } else {
              const start = typeof tmpl.value.transition.start === "number" ? tmpl.value.transition.start : 0;
              const end = typeof tmpl.value.transition.end === "number" ? tmpl.value.transition.end : 0;
              value = start + (end - start) * t;
            }

            const normalizedY = 1 - (value - minVal) / valRange;
            const y = 3 + normalizedY * (height - 6);
            points.push(`${Math.round(x)},${Math.round(y)}`);
          }
        } else {
          // EventTemplate format
          const startBeat = beatToFloat(tmpl.startBeatOffset);
          const endBeat = beatToFloat(tmpl.endBeatOffset);
          const sVal = typeof tmpl.startValue === "number" ? tmpl.startValue : 0;
          const eVal = typeof tmpl.endValue === "number" ? tmpl.endValue : 0;

          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const beat = startBeat + (endBeat - startBeat) * t;
            const x = (beat / totalDuration) * width;
            const value = sVal + (eVal - sVal) * t;

            const normalizedY = 1 - (value - minVal) / valRange;
            const y = 3 + normalizedY * (height - 6);
            points.push(`${Math.round(x)},${Math.round(y)}`);
          }
        }

        return (
          <polyline
            key={i}
            points={points.join(" ")}
            fill="none"
            stroke={EVENT_COLORS[tmpl.kind] || "#888"}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}

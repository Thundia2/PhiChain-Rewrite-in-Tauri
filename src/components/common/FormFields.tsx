// ============================================================
// Shared Form Fields
//
// Reusable form components for the Inspector and Event Inspector.
// Extracted to avoid duplication across editor panels.
// ============================================================

import type { Beat } from "../../types/chart";

/** Small labeled input field */
export function Field({
  label,
  value,
  onChange,
  type = "number",
  step,
  disabled,
  min,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        className="flex-1 px-1 py-0.5 rounded text-xs"
        style={{
          backgroundColor: "var(--bg-active)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
        }}
        type={type}
        step={step}
        value={value}
        disabled={disabled}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Select dropdown field */
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select
        className="flex-1 px-1 py-0.5 rounded text-xs"
        style={{
          backgroundColor: "var(--bg-active)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Beat input field with [whole, numerator/denominator] */
export function BeatField({
  label,
  beat,
  onChange,
}: {
  label: string;
  beat: Beat;
  onChange: (b: Beat) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        <input
          className="w-10 px-1 py-0.5 rounded text-xs text-center"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          type="number"
          value={beat[0]}
          onChange={(e) => onChange([parseInt(e.target.value) || 0, beat[1], beat[2]])}
          title="Whole beats"
        />
        <input
          className="w-10 px-1 py-0.5 rounded text-xs text-center"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          type="number"
          min={0}
          value={beat[1]}
          onChange={(e) => onChange([beat[0], parseInt(e.target.value) || 0, beat[2]])}
          title="Numerator"
        />
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <input
          className="w-10 px-1 py-0.5 rounded text-xs text-center"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          type="number"
          min={1}
          value={beat[2]}
          onChange={(e) => onChange([beat[0], beat[1], Math.max(1, parseInt(e.target.value) || 1)])}
          title="Denominator"
        />
      </div>
    </label>
  );
}

/** Easing options list */
export const EASING_OPTIONS = [
  "linear",
  "ease_in_sine", "ease_out_sine", "ease_in_out_sine",
  "ease_in_quad", "ease_out_quad", "ease_in_out_quad",
  "ease_in_cubic", "ease_out_cubic", "ease_in_out_cubic",
  "ease_in_quart", "ease_out_quart", "ease_in_out_quart",
  "ease_in_quint", "ease_out_quint", "ease_in_out_quint",
  "ease_in_expo", "ease_out_expo", "ease_in_out_expo",
  "ease_in_circ", "ease_out_circ", "ease_in_out_circ",
  "ease_in_back", "ease_out_back", "ease_in_out_back",
  "ease_in_elastic", "ease_out_elastic", "ease_in_out_elastic",
  "ease_in_bounce", "ease_out_bounce", "ease_in_out_bounce",
].map((e) => ({ value: e, label: e.replace(/_/g, " ") }));

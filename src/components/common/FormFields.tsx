// ============================================================
// Shared Form Fields
//
// Reusable form components for the Inspector and Event Inspector.
// Extracted to avoid duplication across editor panels.
// ============================================================

import { useState, useEffect } from "react";
import type { Beat } from "../../types/chart";

/**
 * Safely parse a numeric input value.
 * Returns null for intermediate typing states (empty, "-", ".", "-.") so the
 * input isn't clobbered while the user is still typing (e.g. a negative number).
 */
export function safeParseNumber(v: string): number | null {
  if (v === "" || v === "-" || v === "." || v === "-.") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

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
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        className="flex-1 px-1 py-0.5 text-xs"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "0.5px solid var(--border-color)",
          borderRadius: 6,
          height: 24,
          fontSize: 11,
        }}
        type={type}
        step={step}
        value={localValue}
        disabled={disabled}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalValue(raw);
          if (type === "number") {
            const n = safeParseNumber(raw);
            if (n !== null) onChange(String(n));
          } else {
            onChange(raw);
          }
        }}
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
        className="flex-1 px-1 py-0.5 text-xs"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "0.5px solid var(--border-color)",
          borderRadius: 6,
          height: 24,
          fontSize: 11,
          cursor: "pointer",
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
  const [localWhole, setLocalWhole] = useState(String(beat[0]));
  const [localNum, setLocalNum] = useState(String(beat[1]));
  const [localDen, setLocalDen] = useState(String(beat[2]));

  useEffect(() => { setLocalWhole(String(beat[0])); }, [beat[0]]);
  useEffect(() => { setLocalNum(String(beat[1])); }, [beat[1]]);
  useEffect(() => { setLocalDen(String(beat[2])); }, [beat[2]]);

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        <input
          className="w-10 px-1 py-0.5 text-xs text-center"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "0.5px solid var(--border-color)",
            borderRadius: 6,
            height: 24,
            fontSize: 11,
          }}
          type="number"
          value={localWhole}
          onChange={(e) => { setLocalWhole(e.target.value); const n = safeParseNumber(e.target.value); if (n !== null) onChange([Math.trunc(n), beat[1], beat[2]]); }}
          title="Whole beats"
        />
        <input
          className="w-10 px-1 py-0.5 text-xs text-center"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "0.5px solid var(--border-color)",
            borderRadius: 6,
            height: 24,
            fontSize: 11,
          }}
          type="number"
          min={0}
          value={localNum}
          onChange={(e) => { setLocalNum(e.target.value); const n = safeParseNumber(e.target.value); if (n !== null) onChange([beat[0], Math.trunc(n), beat[2]]); }}
          title="Numerator"
        />
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <input
          className="w-10 px-1 py-0.5 text-xs text-center"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "0.5px solid var(--border-color)",
            borderRadius: 6,
            height: 24,
            fontSize: 11,
          }}
          type="number"
          min={1}
          value={localDen}
          onChange={(e) => { setLocalDen(e.target.value); const n = safeParseNumber(e.target.value); if (n !== null) onChange([beat[0], beat[1], Math.max(1, Math.trunc(n))]); }}
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

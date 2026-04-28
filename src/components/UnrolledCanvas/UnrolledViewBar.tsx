// ============================================================
// Unrolled View Bar
//
// Compact viewport bar above the UnrolledCanvas. Two tri-state
// segmented pill groups for layer visibility:
//
//   Notes  [All] [Ghost] [None]
//   Events [All] [Ghost] [None]
//
// Where:
//   "all"   — full opacity, hit-tests enabled (you can edit)
//   "ghost" — globalAlpha 0.3, hit-tests disabled (no misclicks)
//   "none"  — not rendered, not hit-tested
//
// The actual rendering + hit gating live in UnrolledCanvas.tsx and
// canvas/unrolledRenderer.ts; this bar is purely the control UI.
//
// State source: editorStore.unrolledNoteVisibility / .unrolledEventVisibility.
// These are volatile (reset on app load) — they describe transient
// view focus, not a persistent preference. The persistent setting
// lives in settingsStore.unrolledShowEventSpanTints (Settings →
// Editor → Unrolled Editor).
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import type { LayerVisibility } from "../../stores/editorStore";
import { Pill } from "../common/UIKit";

const STATES: LayerVisibility[] = ["all", "ghost", "none"];
const LABELS: Record<LayerVisibility, string> = {
  all: "All",
  ghost: "Ghost",
  none: "None",
};

/**
 * Single labeled tri-state pill group. Reusing UIKit's `Pill`
 * keeps it visually identical to the layer pills already in
 * KeyframeBar — same hover treatment, same active accent color,
 * same 0.15s transitions.
 */
function VisibilityGroup({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: LayerVisibility;
  onChange: (v: LayerVisibility) => void;
  title?: string;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 4 }}
      title={title}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-muted)",
          marginRight: 2,
        }}
      >
        {label}
      </span>
      {STATES.map((s) => (
        <Pill key={s} active={value === s} onClick={() => onChange(s)}>
          {LABELS[s]}
        </Pill>
      ))}
    </div>
  );
}

export function UnrolledViewBar() {
  const noteVis = useEditorStore((s) => s.unrolledNoteVisibility);
  const eventVis = useEditorStore((s) => s.unrolledEventVisibility);
  const setNoteVis = useEditorStore((s) => s.setUnrolledNoteVisibility);
  const setEventVis = useEditorStore((s) => s.setUnrolledEventVisibility);

  return (
    <div
      style={{
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 10px",
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <VisibilityGroup
        label="Notes"
        value={noteVis}
        onChange={setNoteVis}
        title={
          "Notes layer\n" +
          "All: render and edit notes normally\n" +
          "Ghost: dim and lock — keeps them as visual reference but no clicks land\n" +
          "None: hide entirely"
        }
      />

      {/* Inline divider — same 1×14 strip used between KeyframeBar groups */}
      <div
        style={{
          width: 1,
          height: 14,
          background: "var(--border-color)",
        }}
      />

      <VisibilityGroup
        label="Events"
        value={eventVis}
        onChange={setEventVis}
        title={
          "Events layer\n" +
          "All: render and click events (color-coded by kind)\n" +
          "Ghost: dim and lock — visual reference, no clicks\n" +
          "None: hide entirely (gutter collapses back to base width)"
        }
      />

      <div style={{ flex: 1 }} />
      {/*
        Spacer reserved for future viewport options. Likely candidates:
        mini-preview toggle, lane snap, keyframe bar pin. Adding any
        new option here keeps controls grouped and consistent.
      */}
    </div>
  );
}

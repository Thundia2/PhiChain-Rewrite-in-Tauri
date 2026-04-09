// ============================================================
// LineMode — Controls Sub-tab
//
// RPE Note Controls editor (alpha, size, pos, y, skew) and
// Timeline Overlay line comparison feature. Extracted from
// LineMode.tsx for size management.
// ============================================================

import { useState } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import type { NoteControlEntry, EasingType } from "../../../types/chart";
import { EASING_OPTIONS } from "../../common/FormFields";
import { SectionHeader } from "../shared/SectionHeader";

// ---- Control kind definitions ----

const CONTROL_KINDS = [
  { field: "pos_control" as const, label: "Position (X)", hint: "Multiplier for note X offset based on distance from line", defaultValue: 1.0 },
  { field: "alpha_control" as const, label: "Alpha", hint: "Note opacity (0-1) by distance from line", defaultValue: 1.0 },
  { field: "size_control" as const, label: "Size", hint: "Note size multiplier by distance from line", defaultValue: 1.0 },
  { field: "y_control" as const, label: "Y Offset", hint: "Note vertical offset by distance from line", defaultValue: 0 },
  { field: "skew_control" as const, label: "Skew", hint: "Note skew/shear by distance from line", defaultValue: 0 },
] as const;

type ControlField = typeof CONTROL_KINDS[number]["field"];

// ---- Controls Tab ----

export function ControlsTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const lines = useChartStore((s) => s.chart.lines);
  const editLine = useChartStore((s) => s.editLine);
  const [expandedKind, setExpandedKind] = useState<ControlField | null>(null);

  if (selectedLineIndex === null) return null;
  const line = lines[selectedLineIndex];
  if (!line) return null;

  const getEntries = (field: ControlField): NoteControlEntry[] => {
    return (line[field] as NoteControlEntry[] | undefined) ?? [];
  };

  const setEntries = (field: ControlField, entries: NoteControlEntry[]) => {
    editLine(selectedLineIndex, { [field]: entries.length > 0 ? entries : undefined });
  };

  const addEntry = (field: ControlField, defaultValue: number) => {
    const current = getEntries(field);
    const maxX = current.length > 0 ? Math.max(...current.map((e) => e.x)) : 0;
    const newEntry: NoteControlEntry = {
      x: maxX + 100,
      easing: "linear" as EasingType,
      value: defaultValue,
    };
    setEntries(field, [...current, newEntry]);
  };

  const updateEntry = (field: ControlField, index: number, changes: Partial<NoteControlEntry>) => {
    const entries = [...getEntries(field)];
    entries[index] = { ...entries[index], ...changes };
    entries.sort((a, b) => a.x - b.x);
    setEntries(field, entries);
  };

  const removeEntry = (field: ControlField, index: number) => {
    const entries = getEntries(field).filter((_, i) => i !== index);
    setEntries(field, entries);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", padding: "0 6px" }}>
        RPE note controls — define how note appearance changes based on distance from the judgment line.
      </div>
      {CONTROL_KINDS.map((kind) => {
        const entries = getEntries(kind.field);
        const isExpanded = expandedKind === kind.field;
        return (
          <div key={kind.field} style={{
            background: "var(--bg-primary)", borderRadius: 6,
            border: "1px solid var(--border-color)", overflow: "hidden",
          }}>
            {/* Header */}
            <button
              onClick={() => setExpandedKind(isExpanded ? null : kind.field)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "5px 8px", background: "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600 }}>
                {kind.label}
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6, fontSize: 9 }}>
                  {entries.length > 0 ? `${entries.length} pts` : "off"}
                </span>
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {isExpanded ? "\u25BE" : "\u25B8"}
              </span>
            </button>

            {/* Expanded: entries table + add button */}
            {isExpanded && (
              <div style={{ padding: "2px 6px 6px", borderTop: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 4 }}>{kind.hint}</div>

                {entries.length === 0 ? (
                  <div style={{ fontSize: 9, color: "var(--text-muted)", padding: "6px 0", textAlign: "center" }}>
                    No control points. Add one to enable this control.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "50px 70px 1fr 20px", gap: 3, fontSize: 8, color: "var(--text-muted)", padding: "0 2px" }}>
                      <span>Dist</span>
                      <span>Value</span>
                      <span>Easing</span>
                      <span></span>
                    </div>
                    {entries.map((entry, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 70px 1fr 20px", gap: 3, alignItems: "center" }}>
                        <input
                          type="number"
                          value={entry.x}
                          onChange={(e) => updateEntry(kind.field, i, { x: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: "100%", fontSize: 10, padding: "2px 4px", borderRadius: 3,
                            border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
                            color: "var(--text-primary)", fontFamily: "inherit",
                          }}
                          step={10}
                        />
                        <input
                          type="number"
                          value={entry.value}
                          onChange={(e) => updateEntry(kind.field, i, { value: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: "100%", fontSize: 10, padding: "2px 4px", borderRadius: 3,
                            border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
                            color: "var(--text-primary)", fontFamily: "inherit",
                          }}
                          step={0.1}
                        />
                        <select
                          value={String(entry.easing)}
                          onChange={(e) => updateEntry(kind.field, i, { easing: e.target.value as EasingType })}
                          style={{
                            width: "100%", fontSize: 9, padding: "2px 3px", borderRadius: 3,
                            border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
                            color: "var(--text-primary)", fontFamily: "inherit", cursor: "pointer",
                          }}
                        >
                          {EASING_OPTIONS.map((opt) => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeEntry(kind.field, i)}
                          style={{
                            width: 18, height: 18, fontSize: 10, padding: 0, borderRadius: 3,
                            border: "none", background: "transparent", color: "#ff6b6b",
                            cursor: "pointer", fontFamily: "inherit", display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}
                          title="Remove control point"
                        >
                          {"\u00D7"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => addEntry(kind.field, kind.defaultValue)}
                  style={{
                    marginTop: 4, width: "100%", padding: "3px 0", fontSize: 9,
                    border: "1px dashed var(--border-color)", borderRadius: 4,
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  + Add Control Point
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Timeline Overlay */}
      <TimelineOverlaySection />
    </div>
  );
}

// ---- Timeline Overlay Section ----

function TimelineOverlaySection() {
  const lines = useChartStore((s) => s.chart.lines);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const overlayEnabled = useEditorStore((s) => s.timelineOverlayEnabled);
  const overlayLines = useEditorStore((s) => s.timelineOverlayLines);
  const overlayOpacity = useEditorStore((s) => s.timelineOverlayOpacity);
  const toggleOverlay = useEditorStore((s) => s.toggleTimelineOverlay);
  const toggleOverlayLine = useEditorStore((s) => s.toggleTimelineOverlayLine);
  const setOverlayOpacity = useEditorStore((s) => s.setTimelineOverlayOpacity);

  return (
    <div style={{ marginTop: 8 }}>
      <SectionHeader label="TIMELINE OVERLAY" />
      <div style={{ padding: "4px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={toggleOverlay}
          style={{
            width: "100%", padding: "5px 0", borderRadius: 4,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 9, fontWeight: overlayEnabled ? 600 : 400,
            background: overlayEnabled ? "rgba(108,138,255,0.12)" : "var(--bg-active)",
            color: overlayEnabled ? "var(--accent-primary)" : "var(--text-muted)",
            transition: "all 0.12s",
          }}
        >
          {overlayEnabled ? "Overlay ON \u2014 showing ghost curves" : "Enable Overlay"}
        </button>

        {overlayEnabled && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "var(--text-muted)", minWidth: 42 }}>Opacity</span>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                style={{ flex: 1, height: 4, cursor: "pointer" }}
              />
              <span style={{ fontSize: 9, color: "var(--text-muted)", minWidth: 24, textAlign: "right" }}>
                {Math.round(overlayOpacity * 100)}%
              </span>
            </div>

            <div style={{
              maxHeight: 120, overflowY: "auto",
              border: "1px solid var(--border-color)", borderRadius: 4,
              background: "var(--bg-primary)",
            }}>
              {lines.map((line, idx) => {
                if (idx === selectedLineIndex) return null;
                const isChecked = overlayLines.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => toggleOverlayLine(idx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      width: "100%", padding: "3px 6px",
                      background: isChecked ? "rgba(108,138,255,0.06)" : "transparent",
                      border: "none", borderBottom: "1px solid var(--border-color)",
                      cursor: "pointer", fontFamily: "inherit",
                      fontSize: 9, color: isChecked ? "var(--accent-primary)" : "var(--text-muted)",
                      textAlign: "left", transition: "all 0.1s",
                    }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: 2,
                      border: isChecked ? "none" : "1px solid var(--border-color)",
                      background: isChecked ? "var(--accent-primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, color: "#fff", lineHeight: 1,
                    }}>
                      {isChecked && "\u2713"}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {line.name || `Line ${idx}`}
                    </span>
                    <span style={{ fontSize: 8, color: "var(--text-muted)", opacity: 0.5 }}>
                      {line.notes.length}N
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

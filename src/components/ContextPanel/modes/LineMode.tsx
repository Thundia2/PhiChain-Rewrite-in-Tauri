// ============================================================
// LineMode — Context panel content for single-line selection mode
//
// Recent change: Fixed X Snap reactivity bug in Events tab (was using
// getState() during render). Added "Open Popout Curve Editor" button
// to Events tab for direct curve editor access from ContextPanel.
// ============================================================

import React, { useState, useCallback } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import { useFavoritesStore } from "../../../stores/favoritesStore";
import { BUILTIN_PRESETS } from "../../../presets/builtinPresets";
import { applyPresetAtPlayhead } from "../../../utils/applyPreset";
import type { LineEventKind, LineEvent } from "../../../types/chart";
import { EVENT_KIND_META, EXTENDED_EVENT_KINDS } from "../../../constants/eventConfig";
import { getEasingLabel, getEventValueSummary, formatBeat } from "../../../utils/eventHelpers";
import { NumericInput } from "../../common/FormFields";
import { validateExpression } from "../../../utils/notePatternGenerator";

// ---- Extracted tab components ----
import { ControlsTab } from "./LineModeControlsTab";
import { NoteGenTab } from "./LineModeNoteGenTab";

// ---- Shared sub-components (extracted to shared/) ----
import { HotkeyButton } from "../shared/HotkeyButton";
import { SectionHeader } from "../shared/SectionHeader";
import { ActionButton } from "../shared/ActionButton";
import { ContextBadge } from "../shared/ContextBadge";

// ---- Category options ----

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "(none)" },
  { value: "gameplay", label: "Gameplay" },
  { value: "visual", label: "Visual" },
  { value: "text", label: "Text" },
  { value: "helper", label: "Helper" },
];

// ---- Props ----

export interface LineModeProps {
  activeTab: string;
}

// ---- Main component ----

export function LineMode({ activeTab }: LineModeProps) {
  const activeTool = useEditorStore((s) => s.activeTool);

  // Render content based on tab
  let content: React.ReactNode;
  switch (activeTab) {
    case "events": content = <EventsTab />; break;
    case "props": content = <PropertiesTab />; break;
    case "controls": content = <ControlsTab />; break;
    case "presets": content = <PresetsTab />; break;
    case "note-gen": content = <NoteGenTab />; break;
    case "hotkeys": content = <LineHotkeys />; break;
    default: content = <EventsTab />;
  }

  return (
    <>
      {/* Show pattern config banner when pattern tool is active */}
      {activeTool === "place_pattern" && <PatternConfigBanner />}
      {content}
    </>
  );
}

// ---- Pattern Config Banner — shown when pattern tool is active ----
// Compact inline config for the pattern tool ghost notes

const PATTERN_SHAPES = ["linear", "sine", "cosine", "zigzag", "staircase", "arc", "random", "custom"];
const PATTERN_KINDS = [
  { value: "tap", color: "#48b5ff" },
  { value: "drag", color: "#ffd24a" },
  { value: "flick", color: "#ff4a6a" },
  { value: "hold", color: "#4aff7a" },
];

function PatternConfigBanner() {
  const config = useEditorStore((s) => s.patternConfig);
  const setConfig = useEditorStore((s) => s.setPatternConfig);

  return (
    <div style={{
      margin: "0 0 6px 0", padding: "6px 8px",
      background: "rgba(192, 132, 252, 0.06)",
      border: "1px solid rgba(192, 132, 252, 0.2)",
      borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#c084fc" }}>{"\u2B1A"} PATTERN</span>
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
          {config.noteCount} notes · {config.shape}
        </span>
      </div>

      {/* Shape pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 4 }}>
        {PATTERN_SHAPES.map((s) => (
          <button key={s} onClick={() => setConfig({ shape: s })} style={{
            fontSize: 8, padding: "2px 5px", borderRadius: 3,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: config.shape === s ? "#c084fc" : "var(--bg-active)",
            color: config.shape === s ? "#000" : "var(--text-muted)",
            fontWeight: config.shape === s ? 700 : 400,
          }}>
            {s}
          </button>
        ))}
      </div>

      {/* Count + Kind row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 8, color: "var(--text-muted)" }}>Count</span>
          <input type="number" value={config.noteCount} min={1} step={1}
            onChange={(e) => setConfig({ noteCount: Math.max(1, parseInt(e.target.value) || 1) })}
            style={{
              width: "100%", fontSize: 9, padding: "2px 4px", borderRadius: 3,
              border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
              color: "var(--text-primary)", fontFamily: "inherit",
            }}
          />
        </div>
        {PATTERN_KINDS.map((k) => (
          <button key={k.value} onClick={() => setConfig({ noteKind: k.value })} style={{
            fontSize: 8, padding: "2px 5px", borderRadius: 3, marginTop: 10,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: config.noteKind === k.value ? k.color : "var(--bg-active)",
            color: config.noteKind === k.value ? "#000" : "var(--text-muted)",
            fontWeight: config.noteKind === k.value ? 600 : 400,
          }}>
            {k.value}
          </button>
        ))}
      </div>

      {/* Expression input — shown when "custom" shape is selected */}
      {config.shape === "custom" && (
        <div style={{ marginBottom: 2 }}>
          <input
            type="text"
            value={config.expression ?? ""}
            onChange={(e) => setConfig({ expression: e.target.value })}
            placeholder="300*sin(2*pi*t)"
            spellCheck={false}
            style={{
              width: "100%", fontSize: 8, padding: "3px 6px", borderRadius: 3,
              border: `1px solid ${validateExpression(config.expression ?? "") ? "#ff4a6a" : "#4ade80"}`,
              background: "var(--bg-tertiary)", color: "var(--text-primary)",
              fontFamily: "'JetBrains Mono', monospace", outline: "none",
            }}
          />
        </div>
      )}

      {/* Above/Below */}
      <div style={{ display: "flex", gap: 2 }}>
        <button onClick={() => setConfig({ above: true })} style={{
          flex: 1, fontSize: 8, padding: "2px 0", borderRadius: 3,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: config.above ? "#4ade80" : "var(--bg-active)",
          color: config.above ? "#000" : "var(--text-muted)",
        }}>Above</button>
        <button onClick={() => setConfig({ above: false })} style={{
          flex: 1, fontSize: 8, padding: "2px 0", borderRadius: 3,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: !config.above ? "#ef4444" : "var(--bg-active)",
          color: !config.above ? "#fff" : "var(--text-muted)",
        }}>Below</button>
      </div>
    </div>
  );
}

// ---- Events sub-tab ----

function EventsTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const xSnapEnabled = useEditorStore((s) => s.xSnapEnabled);
  const lanesVal = useEditorStore((s) => s.lanes);
  const lines = useChartStore((s) => s.chart.lines);
  const addEvent = useChartStore((s) => s.addEvent);

  if (selectedLineIndex === null) return null;
  const line = lines[selectedLineIndex];
  if (!line) return null;

  const noteCount = line.notes.length;

  // Group events by kind, tracking their real index in line.events
  // so we can select the correct event when clicked
  const eventsByKind: Record<string, Array<{ event: LineEvent; realIndex: number }>> = {};
  for (let i = 0; i < line.events.length; i++) {
    const ev = line.events[i];
    if (!eventsByKind[ev.kind]) eventsByKind[ev.kind] = [];
    eventsByKind[ev.kind].push({ event: ev, realIndex: i });
  }

  const coreKinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];

  // Count extended events (for the section header badge)
  const extendedEventCount = line.events.filter((ev) =>
    EXTENDED_EVENT_KINDS.includes(ev.kind as LineEventKind),
  ).length;

  const handleAddEvent = (kind: LineEventKind) => {
    addEvent(selectedLineIndex, {
      kind,
      start_beat: [0, 0, 1],
      end_beat: [4, 0, 1],
      value: { constant: kind === "opacity" ? 255 : kind === "speed" ? 1 : 0 },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ContextBadge
        icon={<span style={{ fontSize: 12 }}>{"\u2500"}</span>}
        label={line.name}
        detail={`${noteCount} notes, ${line.events.length} events`}
        variant="line"
      />

      {/* Core event groups — each event row is clickable to enter Event edit mode */}
      {coreKinds.map((kind) => {
        const config = EVENT_KIND_META[kind];
        const entries = eventsByKind[kind] ?? [];
        return (
          <EventGroup
            key={kind}
            kind={kind}
            color={config.color}
            label={config.label}
            entries={entries}
            onAdd={() => handleAddEvent(kind)}
          />
        );
      })}

      {/* Extended events — same clickable pattern as core events */}
      <div style={{ marginTop: 6, opacity: 0.6 }}>
        <SectionHeader label="EXTENDED EVENTS" count={extendedEventCount} />
        {EXTENDED_EVENT_KINDS.map((kind) => {
          const config = EVENT_KIND_META[kind];
          const entries = eventsByKind[kind] ?? [];
          if (entries.length === 0) return null;
          return (
            <EventGroup
              key={kind}
              kind={kind}
              color={config.color}
              label={config.label}
              entries={entries}
              onAdd={() => handleAddEvent(kind)}
            />
          );
        })}
        {extendedEventCount === 0 && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 8px" }}>
            No extended events. Add scale, color, text, incline, or GIF events from the timeline.
          </div>
        )}
      </div>

      {/* X Snap — toggle and lane presets (reactive via hook subscriptions) */}
      <SectionHeader label="X SNAP" />
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button onClick={() => useEditorStore.getState().toggleXSnap()} style={{
          flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 3,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: xSnapEnabled ? "#8b5cf618" : "var(--bg-active)",
          color: xSnapEnabled ? "#8b5cf6" : "var(--text-muted)",
          fontWeight: xSnapEnabled ? 700 : 400,
        }}>
          {xSnapEnabled ? `Snap ON (${lanesVal})` : "Snap OFF"}
        </button>
        {([9, 18, 30] as const).map((n) => {
          const isActive = xSnapEnabled && lanesVal === n;
          return (
            <button key={n} onClick={() => {
              useEditorStore.getState().setLanes(n);
              if (!useEditorStore.getState().xSnapEnabled) useEditorStore.getState().toggleXSnap();
            }} style={{
              width: 36, fontSize: 9, padding: "4px 0", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: isActive ? "#8b5cf6" : "var(--bg-active)",
              color: isActive ? "#fff" : "var(--text-muted)",
            }}>
              {n}
            </button>
          );
        })}
      </div>

      {/* Curve Editor — open the popout curve editor for this line's events */}
      <SectionHeader label="CURVE EDITOR" />
      <ActionButton
        icon={"\u223F"}
        label="Open Popout Curve Editor"
        onClick={() => {
          // Toggle the popout curve editor. It reads selectedLineIndex from editorStore
          // and renders event curves for the current line in a separate window.
          useEditorStore.getState().setCurveEditorPoppedOut(true);
        }}
      />
    </div>
  );
}

// ---- Event group row ----
// Each event row is clickable: clicking selects the event in editorStore,
// which triggers useContextPanelMode() to return "event", auto-switching
// the panel to EventMode where the user can edit timing, value, and easing.

function EventGroup({ color, label, entries, onAdd }: {
  kind?: LineEventKind;
  color: string;
  label: string;
  entries: Array<{ event: LineEvent; realIndex: number }>;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(entries.length <= 5);
  const setEventSelection = useEditorStore((s) => s.setEventSelection);

  // Clicking an event row selects it, which auto-switches to Event mode
  const handleEventClick = useCallback((realIndex: number) => {
    setEventSelection([realIndex]);
  }, [setEventSelection]);

  return (
    <div style={{ borderRadius: 5, border: "1px solid var(--border-color)", overflow: "hidden" }}>
      {/* Group header — click to expand/collapse */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
          cursor: "pointer", background: "var(--bg-primary)",
          borderBottom: expanded ? "1px solid var(--border-color)" : "none",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{label}</span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", padding: "0 5px", borderRadius: 8, background: "var(--bg-tertiary)" }}>
          {entries.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: "0 2px", lineHeight: 1 }}
        >
          +
        </button>
        <span style={{ fontSize: 8, color: "var(--text-muted)", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          {"\u25B6"}
        </span>
      </div>

      {/* Event list — each row clickable to enter Event edit mode */}
      {expanded && entries.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {entries.map(({ event: ev, realIndex }, i) => (
            <div
              key={realIndex}
              onClick={() => handleEventClick(realIndex)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px 4px 14px",
                fontSize: 10, color: "var(--text-secondary)",
                cursor: "pointer",
                transition: "background 0.1s",
                borderBottom: i < entries.length - 1 ? "1px solid rgba(42,42,53,0.5)" : "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-active)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Colored dot matching the event kind */}
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: color, flexShrink: 0,
              }} />
              {/* Beat range */}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--text-muted)", minWidth: 52, fontSize: 10,
              }}>
                {formatBeat(ev.start_beat)}{"\u2013"}{formatBeat(ev.end_beat)}
              </span>
              {/* Value summary */}
              <span style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {getEventValueSummary(ev)}
              </span>
              {/* Easing chip */}
              <span style={{
                fontSize: 8, padding: "1px 4px", borderRadius: 3,
                background: "var(--bg-tertiary)", color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {getEasingLabel(ev)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Properties sub-tab ----

function PropertiesTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const lines = useChartStore((s) => s.chart.lines);
  const editLine = useChartStore((s) => s.editLine);
  const duplicateLine = useChartStore((s) => s.duplicateLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const selectLine = useEditorStore((s) => s.selectLine);

  if (selectedLineIndex === null) return null;
  const line = lines[selectedLineIndex];
  if (!line) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editLine(selectedLineIndex, { name: e.target.value });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value || undefined;
    editLine(selectedLineIndex, { _category: val as any });
  };

  const handleZOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) editLine(selectedLineIndex, { z_order: val });
  };

  const handleDelete = () => {
    removeLine(selectedLineIndex);
    selectLine(null);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: "inherit",
    background: "var(--bg-primary)", border: "1px solid var(--border-color)",
    borderRadius: 4, color: "var(--text-primary)", outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: "none" as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  };

  const fieldRowStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 2,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Identity section */}
      <SectionHeader label="IDENTITY" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={line.name} onChange={handleNameChange} />
        </div>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Category</label>
          <select style={selectStyle} value={line._category ?? ""} onChange={handleCategoryChange}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Z-Order</label>
          <input
            style={inputStyle}
            type="number"
            value={line.z_order ?? 0}
            onChange={handleZOrderChange}
          />
        </div>
      </div>

      {/* Hierarchy section */}
      <SectionHeader label="HIERARCHY" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Parent</label>
          <input
            style={inputStyle}
            type="number"
            placeholder="Line index (-1 = none)"
            value={line.father_index ?? -1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) editLine(selectedLineIndex, { father_index: val });
            }}
          />
        </div>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Group</label>
          <input
            style={inputStyle}
            type="number"
            placeholder="Group index"
            value={line.group ?? 0}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) editLine(selectedLineIndex, { group: val });
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <input
            type="checkbox"
            checked={line.rotate_with_father !== false}
            onChange={(e) => editLine(selectedLineIndex, { rotate_with_father: e.target.checked })}
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Inherit parent rotation</span>
        </div>
      </div>

      {/* Texture section */}
      <SectionHeader label="TEXTURE" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        {line.texture ? (
          <div style={{ fontSize: 10, color: "var(--text-secondary)", padding: "4px 6px", background: "var(--bg-primary)", borderRadius: 4, border: "1px solid var(--border-color)" }}>
            {line.texture}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: 4 }}>
            No texture assigned
          </div>
        )}
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Anchor</label>
          {/* Anchor X/Y — can be 0 or negative for offset pivots */}
          <div style={{ display: "flex", gap: 4 }}>
            <NumericInput
              style={{ ...inputStyle, flex: 1 }}
              step="0.1"
              placeholder="X (0.5)"
              value={line.anchor?.[0] ?? 0.5}
              onChange={(val) => editLine(selectedLineIndex, { anchor: [val, line.anchor?.[1] ?? 0.5] })}
            />
            <NumericInput
              style={{ ...inputStyle, flex: 1 }}
              step="0.1"
              placeholder="Y (0.5)"
              value={line.anchor?.[1] ?? 0.5}
              onChange={(val) => editLine(selectedLineIndex, { anchor: [line.anchor?.[0] ?? 0.5, val] })}
            />
          </div>
        </div>
      </div>

      {/* Advanced section */}
      <SectionHeader label="ADVANCED" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        <div style={fieldRowStyle}>
          {/* BPM Factor — must be > 0, but allow intermediate typing (e.g. "0.5") */}
          <label style={labelStyle}>BPM Factor</label>
          <NumericInput
            style={inputStyle}
            step="0.1"
            value={line.bpm_factor ?? 1}
            onChange={(val) => {
              // BPM factor domain: strictly positive (> 0)
              if (val > 0) editLine(selectedLineIndex, { bpm_factor: val });
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <input
            type="checkbox"
            checked={line.is_cover !== false}
            onChange={(e) => editLine(selectedLineIndex, { is_cover: e.target.checked })}
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Is cover (occlude passed notes)</span>
        </div>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>Attach UI</label>
          <input
            style={inputStyle}
            placeholder="e.g. combo, score, bar"
            value={line.attach_ui ?? ""}
            onChange={(e) => editLine(selectedLineIndex, { attach_ui: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* Danger section */}
      <SectionHeader label="DANGER ZONE" />
      <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 4px" }}>
        <ActionButton icon={"\u2398"} label="Duplicate line" onClick={() => duplicateLine(selectedLineIndex)} />
        <ActionButton icon={"\u2716"} label="Delete line" danger onClick={handleDelete} />
      </div>
    </div>
  );
}

// ControlsTab extracted to LineModeControlsTab.tsx
// NoteGenTab extracted to LineModeNoteGenTab.tsx

// ---- Presets sub-tab ----

function PresetsTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const [search, setSearch] = useState("");
  const favoritePresetIds = useFavoritesStore((s) => s.favoritePresetIds);
  const toggleFavoritePreset = useFavoritesStore((s) => s.toggleFavoritePreset);

  if (selectedLineIndex === null) return null;

  const normalizedSearch = search.toLowerCase().trim();
  const filteredPresets = BUILTIN_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(normalizedSearch) ||
      p.description.toLowerCase().includes(normalizedSearch) ||
      (p.category ?? "").toLowerCase().includes(normalizedSearch),
  );

  // Sort: favorites first
  const sortedPresets = [...filteredPresets].sort((a, b) => {
    const aFav = favoritePresetIds.includes(a.id) ? 0 : 1;
    const bFav = favoritePresetIds.includes(b.id) ? 0 : 1;
    return aFav - bFav;
  });

  const handleApply = (presetId: string) => {
    const preset = BUILTIN_PRESETS.find((p) => p.id === presetId);
    if (preset) applyPresetAtPlayhead(selectedLineIndex, preset);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Search */}
      <input
        placeholder="Search presets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "5px 8px", fontSize: 11, fontFamily: "inherit",
          background: "var(--bg-primary)", border: "1px solid var(--border-color)",
          borderRadius: 5, color: "var(--text-primary)", outline: "none",
        }}
      />

      {/* Preset list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sortedPresets.map((preset) => {
          const isFav = favoritePresetIds.includes(preset.id);
          return (
            <div
              key={preset.id}
              onClick={() => handleApply(preset.id)}
              style={{
                display: "flex", flexDirection: "column", gap: 2,
                padding: "6px 8px", borderRadius: 5, cursor: "pointer",
                background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                transition: "border-color 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-color)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                  {preset.name}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); toggleFavoritePreset(preset.id); }}
                  style={{ fontSize: 12, cursor: "pointer", opacity: isFav ? 1 : 0.3 }}
                >
                  {isFav ? "\u2605" : "\u2606"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "var(--bg-tertiary)", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {preset.category}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {preset.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPresets.length === 0 && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
          No presets match your search.
        </div>
      )}
    </div>
  );
}

// ---- Hotkeys sub-tab ----

const LINE_HOTKEY_SECTIONS = [
  {
    title: "LINE EDITING",
    keys: [
      { icon: "N", label: "New line", hotkey: "Ctrl+N" },
      { icon: "D", label: "Duplicate", hotkey: "Ctrl+D" },
      { icon: "\u232B", label: "Delete line", hotkey: "Ctrl+Del" },
      { icon: "R", label: "Rename", hotkey: "F2" },
      { icon: "\u2191", label: "Move up", hotkey: "Alt+\u2191" },
      { icon: "\u2193", label: "Move down", hotkey: "Alt+\u2193" },
    ],
  },
  {
    title: "EVENT EDITING",
    keys: [
      { icon: "I", label: "Insert event", hotkey: "I" },
      { icon: "S", label: "Split at beat", hotkey: "S" },
      { icon: "M", label: "Merge events", hotkey: "M" },
      { icon: "F", label: "Fill gaps", hotkey: "F" },
      { icon: "P", label: "Apply preset", hotkey: "P" },
      { icon: "L", label: "Lock value", hotkey: "L" },
    ],
  },
  {
    title: "NOTE PLACEMENT",
    keys: [
      { icon: "1", label: "Tap", hotkey: "1" },
      { icon: "2", label: "Drag", hotkey: "2" },
      { icon: "3", label: "Flick", hotkey: "3" },
      { icon: "4", label: "Hold", hotkey: "4" },
      { icon: "T", label: "Toggle above", hotkey: "T" },
      { icon: "B", label: "Toggle below", hotkey: "B" },
    ],
  },
];

// ---- Hotkeys sub-tab ----

function LineHotkeys() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {LINE_HOTKEY_SECTIONS.map((section) => (
        <React.Fragment key={section.title}>
          <SectionHeader label={section.title} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
            {section.keys.map((k) => (
              <HotkeyButton key={k.label} icon={k.icon} label={k.label} hotkey={k.hotkey} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

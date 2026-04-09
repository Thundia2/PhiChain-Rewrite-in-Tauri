// ============================================================
// MultiLineMode — Context panel content for multi-line selection mode
// ============================================================

import React, { useState, useCallback } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import { BUILTIN_PRESETS } from "../../../presets/builtinPresets";
import { applyPresetAtPlayhead } from "../../../utils/applyPreset";
import { BatchOffsetEditor } from "../batch/BatchOffsetEditor";

// ---- Shared sub-components (extracted to shared/) ----
import { HotkeyButton } from "../shared/HotkeyButton";
import { SectionHeader } from "../shared/SectionHeader";
import { ActionButton } from "../shared/ActionButton";
import { ContextBadge } from "../shared/ContextBadge";

// ---- Props ----

export interface MultiLineModeProps {
  activeTab: string;
}

// ---- Main component ----

export function MultiLineMode({ activeTab }: MultiLineModeProps) {
  switch (activeTab) {
    case "batch": return <BatchOpsTab />;
    case "offset": return <BatchOffsetTab />;
    case "hotkeys": return <MultiLineHotkeys />;
    default: return <BatchOpsTab />;
  }
}

// ---- Batch Ops sub-tab ----

function BatchOpsTab() {
  const multiSelectedLineIndices = useEditorStore((s) => s.multiSelectedLineIndices);
  const lines = useChartStore((s) => s.chart.lines);
  const duplicateLine = useChartStore((s) => s.duplicateLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const editLine = useChartStore((s) => s.editLine);
  const addEvent = useChartStore((s) => s.addEvent);
  const clearMultiSelectedLines = useEditorStore((s) => s.clearMultiSelectedLines);

  const [presetSearch, setPresetSearch] = useState("");

  const selectedLines = multiSelectedLineIndices
    .filter((i) => i < lines.length)
    .map((i) => ({ line: lines[i], index: i }));

  const totalNotes = selectedLines.reduce((acc, { line }) => acc + line.notes.length, 0);

  const handleDeleteAll = useCallback(() => {
    const sorted = [...multiSelectedLineIndices].sort((a, b) => b - a);
    for (const idx of sorted) {
      removeLine(idx);
    }
    clearMultiSelectedLines();
  }, [multiSelectedLineIndices, removeLine, clearMultiSelectedLines]);

  const handleDuplicateAll = useCallback(() => {
    for (const idx of multiSelectedLineIndices) {
      duplicateLine(idx);
    }
  }, [multiSelectedLineIndices, duplicateLine]);

  const handleSetCategory = useCallback((category: string) => {
    for (const idx of multiSelectedLineIndices) {
      editLine(idx, { _category: (category || undefined) as any });
    }
  }, [multiSelectedLineIndices, editLine]);

  const handleSetGroup = useCallback((group: number) => {
    for (const idx of multiSelectedLineIndices) {
      editLine(idx, { group });
    }
  }, [multiSelectedLineIndices, editLine]);

  const handleSetParent = useCallback((parentIndex: number) => {
    for (const idx of multiSelectedLineIndices) {
      editLine(idx, { father_index: parentIndex });
    }
  }, [multiSelectedLineIndices, editLine]);

  const handleBatchFadeIn = useCallback(() => {
    for (const { index } of selectedLines) {
      addEvent(index, {
        kind: "opacity",
        start_beat: [0, 0, 1],
        end_beat: [2, 0, 1],
        value: { transition: { start: 0, end: 255, easing: "ease_out_sine" } },
      });
    }
  }, [selectedLines, addEvent]);

  const handleBatchFadeOut = useCallback(() => {
    for (const { index } of selectedLines) {
      addEvent(index, {
        kind: "opacity",
        start_beat: [0, 0, 1],
        end_beat: [2, 0, 1],
        value: { transition: { start: 255, end: 0, easing: "ease_in_sine" } },
      });
    }
  }, [selectedLines, addEvent]);

  const handleSyncSpeed = useCallback(() => {
    for (const { index } of selectedLines) {
      addEvent(index, {
        kind: "speed",
        start_beat: [0, 0, 1],
        end_beat: [1000, 0, 1],
        value: { constant: 1 },
      });
    }
  }, [selectedLines, addEvent]);

  // Filter presets for batch apply
  const normalizedSearch = presetSearch.toLowerCase().trim();
  const filteredPresets = normalizedSearch
    ? BUILTIN_PRESETS.filter(
        (p) =>
          p.name.toLowerCase().includes(normalizedSearch) ||
          (p.category ?? "").toLowerCase().includes(normalizedSearch),
      ).slice(0, 6)
    : [];

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: "inherit",
    background: "var(--bg-primary)", border: "1px solid var(--border-color)",
    borderRadius: 4, color: "var(--text-primary)", outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Context badge */}
      <ContextBadge
        icon={<span style={{ fontSize: 12 }}>{"\u2630"}</span>}
        label={`${selectedLines.length} lines selected`}
        detail={`${totalNotes} total notes`}
        variant="line"
      />

      {/* Selected lines list */}
      <SectionHeader label="SELECTED LINES" count={selectedLines.length} />
      <div style={{ maxHeight: 140, overflowY: "auto", borderRadius: 5, border: "1px solid var(--border-color)" }}>
        {selectedLines.map(({ line, index }) => (
          <div
            key={index}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
              fontSize: 10, borderBottom: "1px solid rgba(42,42,53,0.5)",
            }}
          >
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", width: 20, textAlign: "right" }}>
              #{index}
            </span>
            <span style={{ color: "var(--text-primary)", flex: 1 }}>{line.name}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 9 }}>{line.notes.length}n</span>
            {line._category && (
              <span style={{
                fontSize: 8, padding: "1px 4px", borderRadius: 3,
                background: "var(--bg-tertiary)", color: "var(--text-muted)",
              }}>
                {line._category}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Batch operations */}
      <SectionHeader label="BATCH PROPERTIES" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={labelStyle}>Set Parent (line index)</label>
          <input
            style={inputStyle}
            type="number"
            placeholder="-1 = none"
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) handleSetParent(val);
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={labelStyle}>Move to Group</label>
          <input
            style={inputStyle}
            type="number"
            placeholder="Group index"
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) handleSetGroup(val);
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={labelStyle}>Set Category</label>
          <select
            style={{ ...inputStyle, appearance: "none" as const }}
            onChange={(e) => handleSetCategory(e.target.value)}
          >
            <option value="">-- Choose --</option>
            <option value="">None</option>
            <option value="gameplay">Gameplay</option>
            <option value="visual">Visual</option>
            <option value="text">Text</option>
            <option value="helper">Helper</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={labelStyle}>Apply Preset</label>
          <input
            style={inputStyle}
            placeholder="Search presets..."
            value={presetSearch}
            onChange={(e) => setPresetSearch(e.target.value)}
          />
          {filteredPresets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
              {filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    for (const { index } of selectedLines) {
                      applyPresetAtPlayhead(index, preset);
                    }
                    setPresetSearch("");
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                    borderRadius: 4, cursor: "pointer",
                    background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                    fontSize: 10, color: "var(--text-secondary)", transition: "border-color 0.12s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-color)"; }}
                >
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{preset.name}</span>
                  <span style={{ fontSize: 8, color: "var(--text-muted)", marginLeft: "auto" }}>{preset.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Batch events */}
      <SectionHeader label="BATCH EVENTS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <ActionButton icon={"\u25B3"} label="Fade-in all (opacity 0\u2192255)" onClick={handleBatchFadeIn} />
        <ActionButton icon={"\u25BD"} label="Fade-out all (opacity 255\u21920)" onClick={handleBatchFadeOut} />
        <ActionButton icon={"\u21C4"} label="Sync speed (constant 1)" onClick={handleSyncSpeed} />
      </div>

      {/* Danger zone */}
      <SectionHeader label="DANGER ZONE" />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <ActionButton icon={"\u2398"} label={`Duplicate all ${selectedLines.length} lines`} onClick={handleDuplicateAll} />
        <ActionButton icon={"\u2716"} label={`Delete all ${selectedLines.length} lines`} danger onClick={handleDeleteAll} />
      </div>
    </div>
  );
}

// ---- Batch Offset sub-tab ----

function BatchOffsetTab() {
  return <BatchOffsetEditor />;
}

// ---- Hotkeys sub-tab ----

const MULTI_HOTKEY_SECTIONS = [
  {
    title: "MULTI-LINE SELECTION",
    keys: [
      { icon: "\u21E7", label: "Add to sel.", hotkey: "Shift+Click" },
      { icon: "A", label: "Select all", hotkey: "Ctrl+A" },
      { icon: "Esc", label: "Deselect", hotkey: "Esc" },
      { icon: "G", label: "Group sel.", hotkey: "Ctrl+G" },
      { icon: "U", label: "Ungroup", hotkey: "Ctrl+U" },
      { icon: "I", label: "Invert sel.", hotkey: "Ctrl+I" },
    ],
  },
  {
    title: "BATCH OPERATIONS",
    keys: [
      { icon: "D", label: "Dup. all", hotkey: "Ctrl+D" },
      { icon: "\u232B", label: "Del. all", hotkey: "Ctrl+Del" },
      { icon: "C", label: "Set cat.", hotkey: "Ctrl+Shift+C" },
      { icon: "P", label: "Set parent", hotkey: "Ctrl+Shift+P" },
      { icon: "M", label: "Move group", hotkey: "Ctrl+Shift+M" },
      { icon: "\u2B50", label: "Apply preset", hotkey: "Ctrl+Shift+A" },
    ],
  },
  {
    title: "ALIGNMENT",
    keys: [
      { icon: "\u2195", label: "Align Y", hotkey: "Alt+\u2195" },
      { icon: "\u2194", label: "Align X", hotkey: "Alt+\u2194" },
      { icon: "\u25CF", label: "Center", hotkey: "Alt+C" },
      { icon: "\u21C5", label: "Flip order", hotkey: "Alt+F" },
      { icon: "\u2263", label: "Distribute", hotkey: "Alt+D" },
      { icon: "\u21BB", label: "Rotate arr.", hotkey: "Alt+R" },
    ],
  },
];

function MultiLineHotkeys() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {MULTI_HOTKEY_SECTIONS.map((section) => (
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

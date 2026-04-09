// ============================================================
// Preset Panel — Grid of preset cards with curve previews
// ============================================================

import { useState, useMemo } from "react";
import { BUILTIN_PRESETS } from "../../presets/builtinPresets";
import { applyPresetAtPlayhead } from "../../utils/applyPreset";
import { useEditorStore } from "../../stores/editorStore";
import { PresetCurvePreview } from "./PresetCurvePreview";
import type { EventPreset } from "../../types/preset";

const CATEGORY_LABELS: Record<string, string> = {
  movement: "Movement",
  visibility: "Visibility",
  rotation: "Rotation",
  speed: "Speed",
  compound: "Compound",
};

const CATEGORY_COLORS: Record<string, string> = {
  movement: "#ff6b6b",
  visibility: "#cc5de8",
  rotation: "#ffd43b",
  speed: "#4dabf7",
  compound: "#51cf66",
};

export function PresetPanel() {
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);

  const filtered = useMemo(() => {
    let presets = BUILTIN_PRESETS;
    if (filter) {
      presets = presets.filter((p) => p.category === filter);
    }
    if (search) {
      const lower = search.toLowerCase();
      presets = presets.filter(
        (p) => p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower),
      );
    }
    return presets;
  }, [filter, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of BUILTIN_PRESETS) {
      const cat = p.category ?? "compound";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, []);

  const handleApply = (preset: EventPreset) => {
    if (selectedLineIndex === null) return;
    applyPresetAtPlayhead(selectedLineIndex, preset);
  };

  return (
    <div className="flex flex-col h-full text-xs" style={{ overflow: "hidden" }}>
      {/* Search bar */}
      <div className="px-2 py-1 border-b" style={{ borderColor: "var(--border-color)" }}>
        <input
          type="text"
          placeholder="Search presets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
          }}
        />
      </div>

      {/* Category filter */}
      <div
        className="flex items-center gap-1 px-2 py-1 border-b flex-wrap"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          className="px-1.5 py-0 rounded text-xs"
          style={{
            backgroundColor: filter === null ? "var(--bg-active)" : "transparent",
            color: filter === null ? "var(--text-primary)" : "var(--text-muted)",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => setFilter(null)}
        >
          All ({BUILTIN_PRESETS.length})
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className="px-1.5 py-0 rounded text-xs"
            style={{
              backgroundColor: filter === key ? CATEGORY_COLORS[key] + "25" : "transparent",
              color: filter === key ? CATEGORY_COLORS[key] : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
            }}
            onClick={() => setFilter(filter === key ? null : key)}
          >
            {label} ({categoryCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Preset grid */}
      <div
        className="flex-1 overflow-y-auto p-2"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, alignContent: "start" }}
      >
        {filtered.map((preset) => (
          <div
            key={preset.id}
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: 8,
              cursor: selectedLineIndex !== null ? "pointer" : "not-allowed",
              opacity: selectedLineIndex !== null ? 1 : 0.5,
            }}
            onClick={() => handleApply(preset)}
            title={preset.description}
          >
            <PresetCurvePreview preset={preset} width={120} height={36} />
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
              {preset.name}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>
              {preset.description}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
              {preset.channels.map((ch) => (
                <span
                  key={ch}
                  style={{
                    fontSize: 8,
                    padding: "0 3px",
                    borderRadius: 3,
                    backgroundColor: CATEGORY_COLORS[preset.category ?? "compound"] + "20",
                    color: CATEGORY_COLORS[preset.category ?? "compound"],
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--text-muted)", gridColumn: "1 / -1", textAlign: "center", padding: 16 }}>
            No presets match your search
          </div>
        )}
      </div>

      {selectedLineIndex === null && (
        <div
          className="px-2 py-1 border-t"
          style={{ borderColor: "var(--border-color)", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}
        >
          Select a line to apply presets
        </div>
      )}
    </div>
  );
}

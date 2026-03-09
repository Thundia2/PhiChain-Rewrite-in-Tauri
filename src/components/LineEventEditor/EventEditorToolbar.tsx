// ============================================================
// Event Editor Toolbar — Property selector and toggles
//
// Horizontal bar with property buttons (X/Y/R/O/S),
// show-all-lines toggle, show-notes toggle, and beat display.
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import type { LineEventKind } from "../../types/chart";

const EVENT_COLORS: Record<LineEventKind, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
};

const PROPERTY_LABELS: { kind: LineEventKind; short: string; full: string }[] = [
  { kind: "x", short: "X", full: "X Position" },
  { kind: "y", short: "Y", full: "Y Position" },
  { kind: "rotation", short: "R", full: "Rotation" },
  { kind: "opacity", short: "O", full: "Opacity" },
  { kind: "speed", short: "S", full: "Speed" },
];

export function EventEditorToolbar() {
  const activeProperty = useEditorStore((s) => s.eventEditorActiveProperty);
  const setActiveProperty = useEditorStore((s) => s.setEventEditorActiveProperty);
  const showAllLines = useEditorStore((s) => s.eventEditorShowAllLines);
  const showNotes = useEditorStore((s) => s.eventEditorShowNotes);
  const toggleShowAllLines = useEditorStore((s) => s.toggleEventEditorShowAllLines);
  const toggleShowNotes = useEditorStore((s) => s.toggleEventEditorShowNotes);
  const currentBeat = useEditorStore((s) => s.eventEditorCurrentBeat);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 border-b flex-shrink-0"
      style={{
        borderColor: "var(--border-primary)",
        backgroundColor: "var(--bg-secondary)",
        height: "32px",
      }}
    >
      {/* Property selector buttons */}
      <div className="flex gap-1">
        {PROPERTY_LABELS.map(({ kind, short, full }) => {
          const isActive = activeProperty === kind;
          return (
            <button
              key={kind}
              className="px-2 py-0.5 rounded text-xs font-bold"
              style={{
                backgroundColor: isActive ? EVENT_COLORS[kind] + "30" : "transparent",
                color: isActive ? EVENT_COLORS[kind] : "var(--text-muted)",
                border: isActive
                  ? `1px solid ${EVENT_COLORS[kind]}`
                  : "1px solid transparent",
                minWidth: "28px",
              }}
              onClick={() => setActiveProperty(kind)}
              title={full}
            >
              {short}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div
        className="w-px h-4"
        style={{ backgroundColor: "var(--border-primary)" }}
      />

      {/* Toggle: Show All Lines */}
      <label className="flex items-center gap-1 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={showAllLines}
          onChange={toggleShowAllLines}
          className="w-3 h-3"
        />
        <span style={{ color: "var(--text-secondary)" }}>All Lines</span>
      </label>

      {/* Toggle: Show Notes */}
      <label className="flex items-center gap-1 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={showNotes}
          onChange={toggleShowNotes}
          className="w-3 h-3"
        />
        <span style={{ color: "var(--text-secondary)" }}>Notes</span>
      </label>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Beat display */}
      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        Beat: {currentBeat.toFixed(2)}
      </span>
    </div>
  );
}

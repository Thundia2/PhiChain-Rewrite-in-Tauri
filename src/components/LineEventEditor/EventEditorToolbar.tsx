// ============================================================
// Event Editor Toolbar — Property selector and toggles
//
// Horizontal bar with property buttons (X/Y/R/O/S),
// show-all-lines toggle, show-notes toggle, and beat display.
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import { useChartStore } from "../../stores/chartStore";
import type { LineEventKind } from "../../types/chart";

export const EVENT_COLORS: Record<LineEventKind, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
  scale_x: "#ff922b",
  scale_y: "#20c997",
  color: "#e599f7",
  text: "#a9e34b",
  incline: "#74c0fc",
};

const CORE_PROPERTIES: { kind: LineEventKind; short: string; full: string }[] = [
  { kind: "x", short: "X", full: "X Position" },
  { kind: "y", short: "Y", full: "Y Position" },
  { kind: "rotation", short: "R", full: "Rotation" },
  { kind: "opacity", short: "O", full: "Opacity" },
  { kind: "speed", short: "S", full: "Speed" },
];

const EXTENDED_PROPERTIES: { kind: LineEventKind; short: string; full: string }[] = [
  { kind: "scale_x", short: "SX", full: "Scale X" },
  { kind: "scale_y", short: "SY", full: "Scale Y" },
  { kind: "color", short: "C", full: "Color" },
  { kind: "text", short: "T", full: "Text" },
  { kind: "incline", short: "I", full: "Incline" },
];

export function EventEditorToolbar() {
  const activeProperty = useEditorStore((s) => s.eventEditorActiveProperty);
  const setActiveProperty = useEditorStore((s) => s.setEventEditorActiveProperty);
  const activeLayer = useEditorStore((s) => s.eventEditorActiveLayer);
  const setActiveLayer = useEditorStore((s) => s.setEventEditorActiveLayer);
  const showAllLines = useEditorStore((s) => s.eventEditorShowAllLines);
  const showNotes = useEditorStore((s) => s.eventEditorShowNotes);
  const toggleShowAllLines = useEditorStore((s) => s.toggleEventEditorShowAllLines);
  const toggleShowNotes = useEditorStore((s) => s.toggleEventEditorShowNotes);
  const currentBeat = useEditorStore((s) => s.eventEditorCurrentBeat);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const hasLayers = useChartStore((s) => {
    if (selectedLineIndex === null) return false;
    const line = s.chart.lines[selectedLineIndex];
    return line?.event_layers != null && line.event_layers.length > 0;
  });

  const renderPropertyButton = ({ kind, short, full }: { kind: LineEventKind; short: string; full: string }) => {
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
  };

  return (
    <div
      className="flex flex-col border-b flex-shrink-0"
      style={{
        borderColor: "var(--border-primary)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      {/* Main toolbar row */}
      <div className="flex items-center gap-2 px-2 py-1" style={{ height: "32px" }}>
        {/* Core property buttons */}
        <div className="flex gap-1">
          {CORE_PROPERTIES.map(renderPropertyButton)}
        </div>

        {/* Separator */}
        <div className="w-px h-4" style={{ backgroundColor: "var(--border-primary)" }} />

        {/* Extended property buttons */}
        <div className="flex gap-1">
          {EXTENDED_PROPERTIES.map(renderPropertyButton)}
        </div>

        {/* Separator */}
        <div className="w-px h-4" style={{ backgroundColor: "var(--border-primary)" }} />

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

      {/* Layer selector row (only shown when line has event layers) */}
      {hasLayers && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 border-t"
          style={{ borderColor: "var(--border-primary)", height: "24px" }}
        >
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Layer:</span>
          {[0, 1, 2, 3, 4].map((i) => {
            const isActive = activeLayer === i;
            return (
              <button
                key={i}
                className="px-1.5 py-0 rounded text-xs"
                style={{
                  backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "#fff" : "var(--text-muted)",
                  border: isActive ? "1px solid var(--accent-primary)" : "1px solid transparent",
                  minWidth: "20px",
                }}
                onClick={() => setActiveLayer(i)}
                title={`Event Layer ${i}`}
              >
                {i}
              </button>
            );
          })}
          <button
            className="px-1.5 py-0 rounded text-xs"
            style={{
              backgroundColor: activeLayer === -1 ? "var(--accent-primary)" : "transparent",
              color: activeLayer === -1 ? "#fff" : "var(--text-muted)",
              border: activeLayer === -1 ? "1px solid var(--accent-primary)" : "1px solid transparent",
            }}
            onClick={() => setActiveLayer(-1)}
            title="Flat events (non-layered)"
          >
            Flat
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Keyframe Bar Header — Lane toggles, normalize, expand/popout
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import { EVENT_COLORS } from "../../constants/eventColors";
import type { LineEventKind } from "../../types/chart";

const LANE_DEFS: { kind: LineEventKind; short: string }[] = [
  { kind: "x", short: "X" },
  { kind: "y", short: "Y" },
  { kind: "rotation", short: "R" },
  { kind: "opacity", short: "O" },
  { kind: "speed", short: "S" },
  { kind: "scale_x", short: "SX" },
  { kind: "scale_y", short: "SY" },
  { kind: "color", short: "C" },
  { kind: "text", short: "T" },
];

export function KeyframeBarHeader() {
  const expanded = useEditorStore((s) => s.curveEditorExpanded);
  const poppedOut = useEditorStore((s) => s.curveEditorPoppedOut);
  const visibleLanes = useEditorStore((s) => s.curveEditorVisibleLanes);
  const normalized = useEditorStore((s) => s.curveEditorNormalized);
  const toggleLane = useEditorStore((s) => s.toggleCurveEditorLane);
  const toggleExpanded = useEditorStore((s) => s.toggleCurveEditorExpanded);
  const toggleNormalized = useEditorStore((s) => s.toggleCurveEditorNormalized);
  const setPoppedOut = useEditorStore((s) => s.setCurveEditorPoppedOut);

  return (
    <div
      className="flex items-center gap-1 px-2 flex-shrink-0"
      style={{
        height: 26,
        borderBottom: "1px solid var(--border-color)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        Curves
      </span>

      {/* Lane toggle pills */}
      <div className="flex gap-0.5">
        {LANE_DEFS.map(({ kind, short }) => {
          const active = visibleLanes.includes(kind);
          return (
            <button
              key={kind}
              className="px-1 py-0 rounded text-xs"
              style={{
                backgroundColor: active ? EVENT_COLORS[kind] + "30" : "transparent",
                color: active ? EVENT_COLORS[kind] : "var(--text-muted)",
                border: active ? `1px solid ${EVENT_COLORS[kind]}50` : "1px solid transparent",
                fontSize: 9,
                fontWeight: 600,
                cursor: "pointer",
                minWidth: 18,
                textAlign: "center",
                lineHeight: "16px",
              }}
              onClick={() => toggleLane(kind)}
              title={kind}
            >
              {short}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="w-px h-3" style={{ backgroundColor: "var(--border-color)", margin: "0 2px" }} />

      {/* Normalize toggle */}
      <button
        className="px-1.5 py-0 rounded text-xs"
        style={{
          backgroundColor: normalized ? "var(--accent-primary)" + "30" : "transparent",
          color: normalized ? "var(--accent-primary)" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          fontSize: 9,
        }}
        onClick={toggleNormalized}
        title="Normalize lanes to 0-1 range for comparison"
      >
        N
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Expand toggle */}
      <button
        className="px-1.5 py-0 rounded text-xs"
        style={{
          backgroundColor: expanded ? "var(--accent-primary)" + "20" : "transparent",
          color: expanded ? "var(--accent-primary)" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          fontSize: 10,
        }}
        onClick={toggleExpanded}
        title={expanded ? "Collapse curve graph (Shift+K)" : "Expand curve graph (Shift+K)"}
      >
        {expanded ? "\u25BC" : "\u25B2"}
      </button>

      {/* Pop-out button */}
      {expanded && (
        <button
          className="px-1.5 py-0 rounded text-xs"
          style={{
            color: poppedOut ? "var(--accent-primary)" : "var(--text-muted)",
            border: "none",
            cursor: "pointer",
            fontSize: 10,
          }}
          onClick={() => {
            if (poppedOut) {
              setPoppedOut(false);
            } else {
              setPoppedOut(true);
            }
          }}
          title="Pop out to separate window (Ctrl+Shift+K)"
        >
          {"\u29C9"}
        </button>
      )}
    </div>
  );
}

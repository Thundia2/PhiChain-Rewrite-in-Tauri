// ============================================================
// Status Bar — Bottom info strip (20px)
//
// Shows: Lines count, Notes count, Events count, Zoom %, editor label
// ============================================================

import type React from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useGroupStore } from "../../stores/groupStore";
import { useTabStore } from "../../stores/tabStore";

const toggleBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 9,
  padding: "1px 6px",
  fontFamily: "inherit",
};

export function StatusBar() {
  const lineCount = useChartStore((s) => s.chart.lines.length);
  const totalNotes = useChartStore((s) => s.totalNoteCount());
  const totalEvents = useChartStore((s) => s.totalEventCount());
  const zoom = useEditorStore((s) => s.canvasViewport.zoom);
  const improvisationMode = useEditorStore((s) => s.improvisationMode);
  const activeGroup = useGroupStore((s) => s.getActiveGroup());
  const keyframeBarOpen = useEditorStore((s) => s.keyframeBarOpen);
  const inspectorOpen = useEditorStore((s) => s.unifiedInspectorOpen);
  const toggleKeyframeBar = useEditorStore((s) => s.toggleKeyframeBar);
  const toggleInspector = useEditorStore((s) => s.toggleUnifiedInspector);
  const curveEditorExpanded = useEditorStore((s) => s.curveEditorExpanded);
  const toggleCurveEditorExpanded = useEditorStore((s) => s.toggleCurveEditorExpanded);
  // Read active tab type to display correct editor label
  const activeTabType = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.type;
  });

  return (
    <div
      style={{
        height: 20,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 16,
        background: "var(--bg-primary)",
        borderTop: "1px solid var(--border-color)",
        fontSize: 9,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      <span>Lines: {lineCount}</span>
      <span>Notes: {totalNotes}</span>
      <span>Events: {totalEvents}</span>
      {improvisationMode && (
        <>
          <span style={{ color: "var(--error)", fontWeight: "bold" }}>MARK MODE</span>
          <span style={{ color: "var(--text-secondary)", marginLeft: 4 }}>
            Q=Tap  W=Drag  E=Flick  R=Hold  1-3=Misc
          </span>
        </>
      )}
      {activeGroup && (
        <span style={{ color: activeGroup.color, fontWeight: "bold" }}>
          Group: {activeGroup.name}
        </span>
      )}
      {!keyframeBarOpen && (
        <button onClick={toggleKeyframeBar} style={toggleBtnStyle} title="Show keyframe bar (K)">
          Keyframes {"\u25B4"}
        </button>
      )}
      {!keyframeBarOpen && !inspectorOpen && (
        <button onClick={toggleInspector} style={toggleBtnStyle} title="Show inspector (I)">
          Inspector {"\u25B8"}
        </button>
      )}
      {keyframeBarOpen && (
        <button
          onClick={toggleCurveEditorExpanded}
          style={{
            ...toggleBtnStyle,
            color: curveEditorExpanded ? "var(--accent-primary)" : "var(--text-muted)",
            borderColor: curveEditorExpanded ? "var(--accent-primary)" : "var(--border-color)",
          }}
          title={curveEditorExpanded ? "Collapse curve editor (Shift+K)" : "Expand curve editor (Shift+K)"}
        >
          Curves {curveEditorExpanded ? "\u25BE" : "\u25B4"}
        </button>
      )}
      <div style={{ flex: 1 }} />
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      <span style={{ color: "var(--accent-primary)" }}>
        {activeTabType === "unrolled_editor" ? "Unrolled Editor" : "Unified Editor"}
      </span>
    </div>
  );
}

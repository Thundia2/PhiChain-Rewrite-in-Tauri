// ============================================================
// Status Bar — Bottom info strip (20px)
//
// Shows: Lines count, Notes count, Events count, Zoom %, editor label
// ============================================================

import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";

export function StatusBar() {
  const lineCount = useChartStore((s) => s.chart.lines.length);
  const totalNotes = useChartStore((s) => s.totalNoteCount());
  const totalEvents = useChartStore((s) => s.totalEventCount());
  const zoom = useEditorStore((s) => s.canvasViewport.zoom);

  return (
    <div
      style={{
        height: 20,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 16,
        background: "var(--bg-primary)",
        borderTop: "1px solid #222",
        fontSize: 9,
        color: "#555",
        flexShrink: 0,
      }}
    >
      <span>Lines: {lineCount}</span>
      <span>Notes: {totalNotes}</span>
      <span>Events: {totalEvents}</span>
      <div style={{ flex: 1 }} />
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      <span style={{ color: "var(--accent-primary)" }}>Unified Editor</span>
    </div>
  );
}

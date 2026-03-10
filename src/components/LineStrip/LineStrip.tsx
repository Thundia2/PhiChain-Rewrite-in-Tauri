// ============================================================
// Line Strip — Horizontal line selector chip bar
//
// 30px tall bar above the canvas with clickable chips for each line.
// Active chip highlighted in accent blue. "+" button to add lines.
// ============================================================

import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";

export function LineStrip() {
  const lines = useChartStore((s) => s.chart.lines);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const addLine = useChartStore((s) => s.addLine);

  return (
    <div
      style={{
        height: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 8px",
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-color)",
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        flexWrap: "nowrap",
        scrollbarWidth: "none", // Firefox
      }}
      className="linestrip-scroll"
    >
      {lines.map((line, i) => {
        const isActive = selectedLineIndex === i;
        return (
          <button
            key={i}
            onClick={() => selectLine(i)}
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              whiteSpace: "nowrap",
              flexShrink: 0,
              background: isActive ? "var(--accent-primary)" : "var(--bg-active)",
              color: isActive ? "#fff" : "#888",
              fontWeight: isActive ? 600 : 400,
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
          >
            {line.name || `Line ${i}`}
            <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 9 }}>
              {line.notes.length}
            </span>
          </button>
        );
      })}
      <button
        onClick={() => addLine()}
        style={{
          padding: "3px 8px",
          borderRadius: 4,
          border: "1px dashed #444",
          background: "transparent",
          color: "#555",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        +
      </button>
      {/* Hide scrollbar in webkit browsers */}
      <style>{`.linestrip-scroll::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

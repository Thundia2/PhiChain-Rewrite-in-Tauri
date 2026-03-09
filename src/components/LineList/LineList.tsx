import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTabStore } from "../../stores/tabStore";

export function LineList() {
  const lines = useChartStore((s) => s.chart.lines);
  const addLine = useChartStore((s) => s.addLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const reorderLines = useChartStore((s) => s.reorderLines);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const openLineEventEditor = useTabStore((s) => s.openLineEventEditor);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Action buttons */}
      <div
        className="flex gap-1 p-1 border-b"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
          onClick={() => addLine({ name: `Line ${lines.length + 1}` })}
          title="Add line"
        >
          + Add
        </button>
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
          onClick={() => {
            if (selectedLineIndex !== null) {
              removeLine(selectedLineIndex);
              selectLine(null);
            }
          }}
          disabled={selectedLineIndex === null}
          title="Remove selected line"
        >
          - Remove
        </button>
        {selectedLineIndex !== null && selectedLineIndex > 0 && (
          <button
            className="px-1 py-0.5 rounded text-xs"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
            onClick={() => {
              reorderLines(selectedLineIndex, selectedLineIndex - 1);
              selectLine(selectedLineIndex - 1);
            }}
            title="Move up"
          >
            ▲
          </button>
        )}
        {selectedLineIndex !== null && selectedLineIndex < lines.length - 1 && (
          <button
            className="px-1 py-0.5 rounded text-xs"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
            onClick={() => {
              reorderLines(selectedLineIndex, selectedLineIndex + 1);
              selectLine(selectedLineIndex + 1);
            }}
            title="Move down"
          >
            ▼
          </button>
        )}
      </div>

      {/* Line list */}
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="p-2 text-center" style={{ color: "var(--text-muted)" }}>
            No lines yet
          </div>
        ) : (
          lines.map((line, idx) => {
            const isSelected = selectedLineIndex === idx;
            return (
              <div key={idx}>
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected ? "var(--bg-active)" : "transparent",
                    color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                    borderLeft: isSelected
                      ? "2px solid var(--accent-primary)"
                      : "2px solid transparent",
                  }}
                  onClick={() => selectLine(idx)}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isSelected ? "var(--accent-primary)" : "var(--text-muted)" }}
                  />
                  <span className="flex-1 truncate">{line.name || `Line ${idx + 1}`}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                    {line.notes.length}N {line.events.length}E
                  </span>
                </button>
                {isSelected && (
                  <div className="pl-6 pr-2 pb-1">
                    <button
                      className="px-2 py-0.5 rounded text-xs w-full"
                      style={{
                        backgroundColor: "var(--accent-primary)",
                        color: "white",
                        fontSize: "10px",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openLineEventEditor(idx, line.name || `Line ${idx + 1}`);
                      }}
                      title="Open event editor for this line"
                    >
                      Adjust Events
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

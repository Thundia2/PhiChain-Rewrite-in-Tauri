import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";

export function StatusBar() {
  const totalNotes = useChartStore((s) => s.totalNoteCount());
  const totalEvents = useChartStore((s) => s.totalEventCount());
  const isDirty = useChartStore((s) => s.isDirty);
  const selectedNotes = useEditorStore((s) => s.selectedNoteIndices.length);
  const selectedEvents = useEditorStore((s) => s.selectedEventIndices.length);
  const activeTool = useEditorStore((s) => s.activeTool);

  return (
    <div
      className="flex items-center h-6 px-3 gap-4 text-xs flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderTop: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
      }}
    >
      <span>Phichain v0.1.0{isDirty ? " *" : ""}</span>
      <span>Notes: {totalNotes}</span>
      <span>Events: {totalEvents}</span>
      <span>Selected Notes: {selectedNotes}</span>
      <span>Selected Events: {selectedEvents}</span>
      <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
        Tool: {activeTool}
      </span>
    </div>
  );
}

// ============================================================
// Export Diff Dialog
//
// Shows a summary comparing the current chart vs. the original
// chart loaded from disk. Counts added/removed lines, notes,
// and events.
// ============================================================

import { useChartStore } from "../../stores/chartStore";

interface ExportDiffDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDiffDialog({ open, onClose }: ExportDiffDialogProps) {
  const diff = useChartStore((s) => s.getDiffSummary());

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div
        className="rounded-lg p-5 w-80"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <h3 className="text-sm font-semibold mb-3">Chart Changes Summary</h3>

        {diff === null ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            No original chart to compare against. Load a chart first.
          </div>
        ) : (
          <div className="text-xs space-y-2" style={{ color: "var(--text-secondary)" }}>
            <DiffRow label="Lines" added={diff.linesAdded} removed={diff.linesRemoved} />
            <DiffRow label="Notes" added={diff.notesAdded} removed={diff.notesRemoved} />
            <DiffRow label="Events" added={diff.eventsAdded} removed={diff.eventsRemoved} />
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            className="px-3 py-1.5 rounded text-xs"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ label, added, removed }: { label: string; added: number; removed: number }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 px-2 rounded"
      style={{ backgroundColor: "var(--bg-active)" }}
    >
      <span>{label}</span>
      <div className="flex gap-3">
        <span style={{ color: added > 0 ? "#4aff7a" : "var(--text-muted)" }}>
          +{added}
        </span>
        <span style={{ color: removed > 0 ? "#ff4a6a" : "var(--text-muted)" }}>
          -{removed}
        </span>
      </div>
    </div>
  );
}

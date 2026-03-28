// ============================================================
// Batch Note Operations
//
// Reusable component for multi-note editing operations:
// Distribute X, Offset X, Set All Kind, Flip All.
// Used by UnifiedInspector and FloatingInspector.
// ============================================================

import { useState, useCallback } from "react";
import { Field, SelectField, safeParseNumber } from "./FormFields";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { distributeX, offsetX } from "../../utils/batchNoteOps";
import type { NoteKind } from "../../types/chart";

const NOTE_KIND_OPTIONS = [
  { value: "", label: "— Set all —" },
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

export function BatchNoteOps() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const batchEditNotes = useChartStore((s) => s.batchEditNotes);
  const editNotes = useChartStore((s) => s.editNotes);
  const lines = useChartStore((s) => s.chart.lines);

  const [distStartX, setDistStartX] = useState(-300);
  const [distEndX, setDistEndX] = useState(300);
  const [offsetDelta, setOffsetDelta] = useState(50);

  const line = selectedLineIndex !== null ? lines[selectedLineIndex] : null;
  const noteCount = selectedNoteIndices.length;

  const handleDistributeX = useCallback(() => {
    if (!line || selectedLineIndex === null || noteCount < 2) return;
    const edits = distributeX(line.notes, selectedNoteIndices, distStartX, distEndX);
    batchEditNotes(selectedLineIndex, edits);
  }, [line, selectedLineIndex, selectedNoteIndices, distStartX, distEndX, noteCount, batchEditNotes]);

  const handleOffsetX = useCallback((delta: number) => {
    if (!line || selectedLineIndex === null) return;
    const edits = offsetX(line.notes, selectedNoteIndices, delta);
    batchEditNotes(selectedLineIndex, edits);
  }, [line, selectedLineIndex, selectedNoteIndices, batchEditNotes]);

  const handleSetKind = useCallback((kind: string) => {
    if (!kind || selectedLineIndex === null) return;
    editNotes(selectedLineIndex, selectedNoteIndices, { kind: kind as NoteKind });
  }, [selectedLineIndex, selectedNoteIndices, editNotes]);

  const handleFlipAll = useCallback(() => {
    if (!line || selectedLineIndex === null) return;
    const allAbove = selectedNoteIndices.every((i) => line.notes[i]?.above);
    editNotes(selectedLineIndex, selectedNoteIndices, { above: !allAbove });
  }, [line, selectedLineIndex, selectedNoteIndices, editNotes]);

  if (noteCount < 2) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: "bold", color: "var(--text-primary)",
        borderBottom: "1px solid var(--border-color)", paddingBottom: 4,
      }}>
        Batch ({noteCount} notes)
      </div>

      {/* Distribute X */}
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
        <Field label="From X" value={distStartX} onChange={(v) => {
          const n = safeParseNumber(v); if (n !== null) setDistStartX(n);
        }} />
        <Field label="To X" value={distEndX} onChange={(v) => {
          const n = safeParseNumber(v); if (n !== null) setDistEndX(n);
        }} />
        <button onClick={handleDistributeX} disabled={noteCount < 2} style={{
          padding: "3px 8px", fontSize: 10, borderRadius: 3, border: "none",
          background: "var(--accent-primary)", color: "#fff",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>Distribute</button>
      </div>

      {/* Offset X */}
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
        <Field label="Offset" value={offsetDelta} onChange={(v) => {
          const n = safeParseNumber(v); if (n !== null) setOffsetDelta(n);
        }} />
        <button onClick={() => handleOffsetX(-offsetDelta)} style={{
          padding: "3px 8px", fontSize: 10, borderRadius: 3, border: "none",
          background: "var(--bg-active)", color: "var(--text-primary)",
          cursor: "pointer", fontFamily: "inherit",
        }}>-X</button>
        <button onClick={() => handleOffsetX(offsetDelta)} style={{
          padding: "3px 8px", fontSize: 10, borderRadius: 3, border: "none",
          background: "var(--bg-active)", color: "var(--text-primary)",
          cursor: "pointer", fontFamily: "inherit",
        }}>+X</button>
      </div>

      {/* Set Kind / Flip */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <SelectField label="Kind" value="" options={NOTE_KIND_OPTIONS} onChange={handleSetKind} />
        <button onClick={handleFlipAll} style={{
          padding: "3px 8px", fontSize: 10, borderRadius: 3, border: "none",
          background: "var(--bg-active)", color: "var(--text-primary)",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>Flip</button>
      </div>
    </div>
  );
}

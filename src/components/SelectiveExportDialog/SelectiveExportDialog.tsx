// ============================================================
// Selective Export Dialog
//
// Allows exporting a subset of the chart by:
//   - Selecting a beat range (start, end)
//   - Choosing which lines to include
//   - Picking an export format
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { beatToFloat } from "../../types/chart";
import type { PhichainChart, Beat, Note, LineEvent } from "../../types/chart";

interface SelectiveExportDialogProps {
  open: boolean;
  onClose: () => void;
}

function beatInRange(beat: Beat, startBeat: number, endBeat: number): boolean {
  const b = beatToFloat(beat);
  return b >= startBeat && b <= endBeat;
}

function filterNotesInRange(notes: Note[], startBeat: number, endBeat: number): Note[] {
  return notes.filter((n) => beatInRange(n.beat, startBeat, endBeat));
}

function filterEventsInRange(events: LineEvent[], startBeat: number, endBeat: number): LineEvent[] {
  return events.filter((e) => {
    const start = beatToFloat(e.start_beat);
    const end = beatToFloat(e.end_beat);
    // Include events that overlap with the range
    return end >= startBeat && start <= endBeat;
  });
}

export function SelectiveExportDialog({ open, onClose }: SelectiveExportDialogProps) {
  const chart = useChartStore((s) => s.chart);

  const [startBeat, setStartBeat] = useState(0);
  const [endBeat, setEndBeat] = useState(32);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(
    () => new Set(chart.lines.map((_, i) => i)),
  );
  const [format, setFormat] = useState<"phichain" | "json">("phichain");

  const toggleLine = useCallback((idx: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const selectAllLines = useCallback(() => {
    setSelectedLines(new Set(chart.lines.map((_, i) => i)));
  }, [chart.lines]);

  const deselectAllLines = useCallback(() => {
    setSelectedLines(new Set());
  }, []);

  const previewStats = useMemo(() => {
    let notes = 0;
    let events = 0;
    for (const idx of selectedLines) {
      const line = chart.lines[idx];
      if (!line) continue;
      notes += filterNotesInRange(line.notes, startBeat, endBeat).length;
      events += filterEventsInRange(line.events, startBeat, endBeat).length;
    }
    return { lines: selectedLines.size, notes, events };
  }, [chart, selectedLines, startBeat, endBeat]);

  const handleExport = useCallback(() => {
    const trimmedChart: PhichainChart = {
      format: chart.format,
      offset: chart.offset,
      bpm_list: chart.bpm_list,
      lines: chart.lines
        .filter((_, idx) => selectedLines.has(idx))
        .map((line) => ({
          ...line,
          notes: filterNotesInRange(line.notes, startBeat, endBeat),
          events: filterEventsInRange(line.events, startBeat, endBeat),
        })),
    };

    const jsonStr = JSON.stringify(trimmedChart, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-export-${startBeat}-${endBeat}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }, [chart, selectedLines, startBeat, endBeat, onClose]);

  if (!open) return null;

  const inputStyle = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div
        className="rounded-lg p-5"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          width: 400,
        }}
      >
        <h3 className="text-sm font-semibold mb-4">Selective Export</h3>

        {/* Beat range */}
        <div className="flex gap-3 mb-3">
          <label className="flex-1">
            <span className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Start Beat</span>
            <input
              className="w-full px-2 py-1 rounded text-xs"
              style={inputStyle}
              type="number"
              min={0}
              step={1}
              value={startBeat}
              onChange={(e) => setStartBeat(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </label>
          <label className="flex-1">
            <span className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>End Beat</span>
            <input
              className="w-full px-2 py-1 rounded text-xs"
              style={inputStyle}
              type="number"
              min={0}
              step={1}
              value={endBeat}
              onChange={(e) => setEndBeat(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </label>
        </div>

        {/* Line selection */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Lines</span>
            <div className="flex gap-2">
              <button
                className="text-[10px] underline"
                style={{ color: "var(--accent-primary)" }}
                onClick={selectAllLines}
              >
                All
              </button>
              <button
                className="text-[10px] underline"
                style={{ color: "var(--accent-primary)" }}
                onClick={deselectAllLines}
              >
                None
              </button>
            </div>
          </div>
          <div
            className="max-h-32 overflow-y-auto rounded p-1"
            style={{ backgroundColor: "var(--bg-active)", border: "1px solid var(--border-primary)" }}
          >
            {chart.lines.map((line, idx) => (
              <label key={idx} className="flex items-center gap-2 px-1 py-0.5 text-xs cursor-pointer hover:bg-white/5 rounded">
                <input
                  type="checkbox"
                  checked={selectedLines.has(idx)}
                  onChange={() => toggleLine(idx)}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
                <span style={{ color: selectedLines.has(idx) ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {line.name || `Line ${idx + 1}`}
                </span>
                <span className="ml-auto" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                  {line.notes.length}N
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Format selector */}
        <label className="flex items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Format</span>
          <select
            className="px-2 py-1 rounded text-xs"
            style={inputStyle}
            value={format}
            onChange={(e) => setFormat(e.target.value as "phichain" | "json")}
          >
            <option value="phichain">Phichain JSON</option>
            <option value="json">Raw JSON</option>
          </select>
        </label>

        {/* Preview stats */}
        <div
          className="text-xs py-2 px-3 mb-3 rounded"
          style={{ backgroundColor: "var(--bg-active)", color: "var(--text-secondary)" }}
        >
          Export: {previewStats.lines} lines, {previewStats.notes} notes, {previewStats.events} events
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-1.5 rounded text-xs"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
            onClick={handleExport}
            disabled={selectedLines.size === 0}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

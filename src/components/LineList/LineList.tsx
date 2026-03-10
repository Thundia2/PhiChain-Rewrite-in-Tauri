import { useState, useMemo, useRef, useEffect } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useTabStore } from "../../stores/tabStore";
import { evaluateLineEventsWithLayers, getFirstAppearanceBeat } from "../../canvas/events";
import { BpmList } from "../../utils/bpmList";
import type { LineSortMode } from "../../types/editor";

/**
 * Subscribe to the current beat, throttled to 100ms to avoid
 * re-rendering the line list at 60fps from audio time updates.
 */
function useThrottledBeat(): number {
  const [beat, setBeat] = useState(0);
  const lastUpdate = useRef(0);

  const bpmPoints = useChartStore((s) => s.chart.bpm_list);
  const offset = useChartStore((s) => s.chart.offset);

  useEffect(() => {
    const bpmList = new BpmList(bpmPoints);

    const unsub = useAudioStore.subscribe((state) => {
      const now = performance.now();
      if (now - lastUpdate.current < 100) return;
      lastUpdate.current = now;

      const adjustedTime = Math.max(0, state.currentTime - offset);
      const currentBeat = bpmList.beatAtFloat(adjustedTime);
      setBeat(currentBeat);
    });

    return unsub;
  }, [bpmPoints, offset]);

  return beat;
}

export function LineList() {
  const lines = useChartStore((s) => s.chart.lines);
  const addLine = useChartStore((s) => s.addLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const reorderLines = useChartStore((s) => s.reorderLines);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const lineSortMode = useEditorStore((s) => s.lineSortMode);
  const setLineSortMode = useEditorStore((s) => s.setLineSortMode);
  const openLineEventEditor = useTabStore((s) => s.openLineEventEditor);
  const currentBeat = useThrottledBeat();

  // Pre-compute line states for active_first mode (avoid double evaluation)
  const sortedData = useMemo(() => {
    const indices = lines.map((_: unknown, i: number) => i);

    // Only evaluate line states when needed
    const lineStates = lineSortMode === "active_first"
      ? lines.map((line) => evaluateLineEventsWithLayers(line.events, line.event_layers, currentBeat))
      : null;

    if (lineSortMode === "first_appearance") {
      indices.sort((a: number, b: number) => {
        const beatA = getFirstAppearanceBeat(lines[a].events);
        const beatB = getFirstAppearanceBeat(lines[b].events);
        if (beatA !== beatB) return beatA - beatB;
        return a - b; // stable: preserve chart order for ties
      });
    } else if (lineSortMode === "active_first" && lineStates) {
      indices.sort((a: number, b: number) => {
        const visA = lineStates[a].opacity > 0 ? 1 : 0;
        const visB = lineStates[b].opacity > 0 ? 1 : 0;
        if (visA !== visB) return visB - visA; // visible lines first
        return a - b; // stable: preserve chart order within groups
      });
    }

    return { indices, lineStates };
  }, [lines, lineSortMode, currentBeat]);

  const isChartOrder = lineSortMode === "chart_order";

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Action buttons */}
      <div
        className="flex gap-1 p-1 border-b flex-wrap"
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
        {isChartOrder && selectedLineIndex !== null && selectedLineIndex > 0 && (
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
        {isChartOrder && selectedLineIndex !== null && selectedLineIndex < lines.length - 1 && (
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
        {/* Sort mode selector */}
        <select
          className="px-1 py-0.5 rounded text-xs ml-auto"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
            fontSize: "10px",
          }}
          value={lineSortMode}
          onChange={(e) => setLineSortMode(e.target.value as LineSortMode)}
          title="Sort lines"
        >
          <option value="chart_order">Chart Order</option>
          <option value="first_appearance">First Appearance</option>
          <option value="active_first">Active First</option>
        </select>
      </div>

      {/* Line list */}
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="p-2 text-center" style={{ color: "var(--text-muted)" }}>
            No lines yet
          </div>
        ) : (
          sortedData.indices.map((idx: number) => {
            const line = lines[idx];
            const isSelected = selectedLineIndex === idx;
            const isVisible = sortedData.lineStates
              ? sortedData.lineStates[idx].opacity > 0
              : null;

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
                  {/* Visibility indicator (active_first mode) or selection dot */}
                  {lineSortMode === "active_first" && isVisible !== null ? (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: isVisible ? "#4ade80" : "#6b7280",
                      }}
                      title={isVisible ? "Visible" : "Hidden"}
                    />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isSelected ? "var(--accent-primary)" : "var(--text-muted)" }}
                    />
                  )}
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

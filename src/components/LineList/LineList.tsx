import { useState, useMemo, useRef, useEffect } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useTabStore } from "../../stores/tabStore";
import { useGroupStore } from "../../stores/groupStore";
import { evaluateLineEventsWithLayers, getFirstAppearanceBeat } from "../../canvas/events";
import { BpmList } from "../../utils/bpmList";
import type { LineSortMode } from "../../types/editor";
import { ActionButton, Badge, SELECT_STYLE } from "../common/UIKit";
import { LINE_CATEGORY_COLORS, LINE_CATEGORY_LABELS, autoCategorize } from "./lineCategories";
import { LineContextMenu } from "./LineContextMenu";

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
  const groups = useGroupStore((s) => s.groups);
  const editLine = useChartStore((s) => s.editLine);
  const currentBeat = useThrottledBeat();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    lineIndex: number;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { gameplay: 0, visual: 0, text: 0, helper: 0, none: 0 };
    for (const line of lines) {
      const cat = line._category;
      if (cat && counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts.none++;
      }
    }
    return counts;
  }, [lines]);

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
        style={{ borderColor: "var(--border-color)" }}
      >
        <ActionButton
          variant="primary"
          onClick={() => addLine({ name: `Line ${lines.length + 1}` })}
          title="Add line"
        >
          + Add
        </ActionButton>
        <ActionButton
          variant="danger"
          onClick={() => {
            if (selectedLineIndex !== null) {
              removeLine(selectedLineIndex);
              selectLine(null);
            }
          }}
          disabled={selectedLineIndex === null}
          title="Remove selected line"
        >
          Remove
        </ActionButton>
        {isChartOrder && selectedLineIndex !== null && selectedLineIndex > 0 && (
          <ActionButton
            variant="default"
            onClick={() => {
              reorderLines(selectedLineIndex, selectedLineIndex - 1);
              selectLine(selectedLineIndex - 1);
            }}
            title="Move up"
          >
            ▲
          </ActionButton>
        )}
        {isChartOrder && selectedLineIndex !== null && selectedLineIndex < lines.length - 1 && (
          <ActionButton
            variant="default"
            onClick={() => {
              reorderLines(selectedLineIndex, selectedLineIndex + 1);
              selectLine(selectedLineIndex + 1);
            }}
            title="Move down"
          >
            ▼
          </ActionButton>
        )}
        {/* Sort mode selector */}
        <select
          className="ml-auto"
          style={{
            ...SELECT_STYLE,
            fontSize: 10,
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

      {/* Category filter bar */}
      <div
        className="flex items-center gap-1 px-1 py-0.5 border-b flex-wrap"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          className="px-1.5 py-0 rounded text-xs"
          style={{
            backgroundColor: categoryFilter === null ? "var(--bg-active)" : "transparent",
            color: categoryFilter === null ? "var(--text-primary)" : "var(--text-muted)",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => setCategoryFilter(null)}
          title="Show all lines"
        >
          All
        </button>
        {(["gameplay", "visual", "text", "helper"] as const).map((cat) => (
          <button
            key={cat}
            className="flex items-center gap-1 px-1 py-0 rounded text-xs"
            style={{
              backgroundColor: categoryFilter === cat ? LINE_CATEGORY_COLORS[cat] + "25" : "transparent",
              color: categoryFilter === cat ? LINE_CATEGORY_COLORS[cat] : "var(--text-muted)",
              border: categoryFilter === cat ? `1px solid ${LINE_CATEGORY_COLORS[cat]}50` : "1px solid transparent",
              cursor: "pointer",
            }}
            onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            title={LINE_CATEGORY_LABELS[cat]}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: LINE_CATEGORY_COLORS[cat],
                flexShrink: 0,
              }}
            />
            {categoryCounts[cat]}
          </button>
        ))}
        <button
          className="ml-auto px-1 py-0 rounded text-xs"
          style={{
            color: "var(--text-muted)",
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
          }}
          onClick={() => {
            for (let i = 0; i < lines.length; i++) {
              if (!lines[i]._category) {
                const cat = autoCategorize(lines[i]);
                if (cat) editLine(i, { _category: cat });
              }
            }
          }}
          title="Auto-categorize lines without a category"
        >
          Auto
        </button>
      </div>

      {/* Line list */}
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="p-2 text-center" style={{ color: "var(--text-muted)" }}>
            No lines yet
          </div>
        ) : (
          sortedData.indices
            .filter((idx: number) => {
              if (categoryFilter === null) return true;
              return lines[idx]._category === categoryFilter;
            })
            .map((idx: number) => {
            const line = lines[idx];
            const isSelected = selectedLineIndex === idx;
            const isVisible = sortedData.lineStates
              ? sortedData.lineStates[idx].opacity > 0
              : null;

            return (
              <div
                key={idx}
                style={{
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex: idx });
                  }}
                >
                  {/* Category dot */}
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: line._category
                        ? LINE_CATEGORY_COLORS[line._category]
                        : "transparent",
                      border: line._category
                        ? "none"
                        : "1px solid var(--text-muted)",
                      flexShrink: 0,
                    }}
                    title={line._category ? LINE_CATEGORY_LABELS[line._category] : "No category"}
                  />
                  {/* Visibility indicator (active_first mode) */}
                  {lineSortMode === "active_first" && isVisible !== null && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: isVisible ? "var(--success)" : "var(--text-muted)",
                      }}
                      title={isVisible ? "Visible" : "Hidden"}
                    />
                  )}
                  <span className="flex-1 truncate" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    {groups.filter((g) => g.type === "line" && g.lines.some((l: { lineIndex: number }) => l.lineIndex === idx)).map((g) => (
                      <span
                        key={g.id}
                        style={{ width: 5, height: 5, borderRadius: "50%", background: g.color, flexShrink: 0 }}
                        title={`Group: ${g.name}`}
                      />
                    ))}
                    {line.texture ? "\u{1F5BC} " : ""}{line.name || `Line ${idx + 1}`}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                    {line.notes.length}N {line.events.length}E
                  </span>
                </button>
                {isSelected && (
                  <div className="pl-6 pr-2 pb-1">
                    <ActionButton
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLineEventEditor(idx, line.name || `Line ${idx + 1}`);
                      }}
                      title="Open event editor for this line"
                      style={{ width: "100%", fontSize: 10 }}
                    >
                      Adjust Events
                    </ActionButton>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <LineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          lineIndex={contextMenu.lineIndex}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

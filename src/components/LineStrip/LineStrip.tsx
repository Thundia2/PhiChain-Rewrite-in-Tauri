// ============================================================
// Line Strip — Horizontal line selector chip bar
//
// 30px tall bar above the canvas with clickable chips for each line.
// Lines are sorted by activity and color-coded:
//   - Active (opacity > 0): solid green
//   - Coming soon (within 8 beats): faded green
//   - Just passed (within 8 beats): yellow
//   - Long ago passed: faded yellow
//   - Recurring: blue tint
//   - Inactive: default gray
// ============================================================

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useGroupStore } from "../../stores/groupStore";
import { useTabStore } from "../../stores/tabStore";
import { evaluateLineEventsWithLayers } from "../../canvas/events";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../utils/beat";
import { LINE_CATEGORY_COLORS } from "../LineList/lineCategories";
import { autoCategorize } from "../LineList/lineCategories";

type LineActivity = "active" | "coming-soon" | "just-passed" | "long-passed" | "inactive";

const LOOKAHEAD_BEATS = 8;
const LOOKBEHIND_BEATS = 8;
const LONG_PASSED_BEATS = 32;

/** Get all beat ranges where a line has opacity > 0 */
function getOpacityRanges(
  events: { kind: string; start_beat: [number, number, number]; end_beat: [number, number, number]; value: any }[],
): { start: number; end: number }[] {
  const opacityEvents = events
    .filter((e) => e.kind === "opacity")
    .sort((a, b) => beatToFloat(a.start_beat) - beatToFloat(b.start_beat));

  if (opacityEvents.length === 0) return [];

  const ranges: { start: number; end: number }[] = [];
  let rangeStart: number | null = null;

  for (const event of opacityEvents) {
    const start = beatToFloat(event.start_beat);
    const end = beatToFloat(event.end_beat);

    let hasOpacity = false;
    if ("constant" in event.value) {
      hasOpacity = event.value.constant > 0;
    } else if ("transition" in event.value) {
      hasOpacity = event.value.transition.start > 0 || event.value.transition.end > 0;
    }

    if (hasOpacity) {
      if (rangeStart === null) rangeStart = start;
      // Extend to end of this event
      if (ranges.length > 0 && ranges[ranges.length - 1].end >= start) {
        ranges[ranges.length - 1].end = Math.max(ranges[ranges.length - 1].end, end);
      } else {
        if (rangeStart !== null && ranges.length > 0) {
          ranges[ranges.length - 1].end = Math.max(ranges[ranges.length - 1].end, start);
        }
        ranges.push({ start, end });
      }
      rangeStart = null;
    } else {
      // Opacity goes to 0 — close current range at start of this event
      if (ranges.length > 0) {
        ranges[ranges.length - 1].end = Math.min(ranges[ranges.length - 1].end, end);
      }
      rangeStart = null;
    }
  }

  return ranges;
}

/** Classify a line's activity status at a given beat */
function classifyLine(
  events: any[],
  eventLayers: any[] | undefined,
  beat: number,
): { activity: LineActivity; isRecurring: boolean; sortKey: number } {
  // Evaluate opacity at current beat
  const state = evaluateLineEventsWithLayers(events, eventLayers, beat);
  const isVisible = state.opacity > 0;

  // Get opacity ranges to check proximity
  const ranges = getOpacityRanges(events);
  const isRecurring = ranges.length > 1;

  if (isVisible) {
    return { activity: "active", isRecurring, sortKey: 0 };
  }

  // Check "coming soon": is there a visible range starting within LOOKAHEAD_BEATS?
  let nearestFuture = Infinity;
  let nearestPast = -Infinity;

  for (const range of ranges) {
    if (range.start > beat && range.start - beat < nearestFuture) {
      nearestFuture = range.start - beat;
    }
    if (range.end <= beat && beat - range.end < Math.abs(nearestPast)) {
      nearestPast = beat - range.end;
    }
  }

  if (nearestFuture <= LOOKAHEAD_BEATS) {
    return { activity: "coming-soon", isRecurring, sortKey: 1 + nearestFuture / LOOKAHEAD_BEATS };
  }

  if (nearestPast >= 0 && nearestPast <= LOOKBEHIND_BEATS) {
    return { activity: "just-passed", isRecurring, sortKey: 2 + nearestPast / LOOKBEHIND_BEATS };
  }

  if (nearestPast >= 0 && nearestPast <= LONG_PASSED_BEATS) {
    return { activity: "long-passed", isRecurring, sortKey: 3 + nearestPast / LONG_PASSED_BEATS };
  }

  // Inactive — sort by how far ahead they appear
  if (nearestFuture < Infinity) {
    return { activity: "inactive", isRecurring, sortKey: 4 + nearestFuture / 1000 };
  }

  return { activity: "inactive", isRecurring, sortKey: 5 };
}

/** Style for each activity type */
function getChipStyle(
  activity: LineActivity,
  isRecurring: boolean,
  isSelected: boolean,
): { background: string; color: string; borderLeft: string } {
  if (isSelected) {
    return {
      background: "var(--accent-primary)",
      color: "#fff",
      borderLeft: "2px solid var(--accent-primary)",
    };
  }

  if (isRecurring) {
    switch (activity) {
      case "active":
        return { background: "#22c55e30", color: "#4ade80", borderLeft: "2px solid #22c55e" };
      case "coming-soon":
        return { background: "#3b82f620", color: "#60a5fa", borderLeft: "2px solid #3b82f680" };
      case "just-passed":
        return { background: "#eab30820", color: "#fbbf24", borderLeft: "2px solid #eab30880" };
      case "long-passed":
        return { background: "#eab30810", color: "#fbbf2460", borderLeft: "2px solid #eab30840" };
      default:
        return { background: "var(--bg-active)", color: "#555", borderLeft: "2px solid transparent" };
    }
  }

  switch (activity) {
    case "active":
      return { background: "#22c55e28", color: "#4ade80", borderLeft: "2px solid #22c55e" };
    case "coming-soon":
      return { background: "#22c55e14", color: "#4ade8080", borderLeft: "2px solid #22c55e60" };
    case "just-passed":
      return { background: "#eab30820", color: "#fbbf24", borderLeft: "2px solid #eab308" };
    case "long-passed":
      return { background: "#eab30810", color: "#fbbf2450", borderLeft: "2px solid #eab30840" };
    default:
      return { background: "var(--bg-active)", color: "#555", borderLeft: "2px solid transparent" };
  }
}

export function LineStrip() {
  const lines = useChartStore((s) => s.chart.lines);
  const bpmPoints = useChartStore((s) => s.chart.bpm_list);
  const offset = useChartStore((s) => s.chart.offset);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const toggleMultiSelectedLine = useEditorStore((s) => s.toggleMultiSelectedLine);
  const multiSelectedLineIndices = useEditorStore((s) => s.multiSelectedLineIndices);
  const addLine = useChartStore((s) => s.addLine);
  const groups = useGroupStore((s) => s.groups);
  const openLineEventEditor = useTabStore((s) => s.openLineEventEditor);
  const currentTime = useAudioStore((s) => s.currentTime);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // LineStrip filter state
  const searchOpen = useEditorStore((s) => s.lineStripSearchOpen);
  const searchQuery = useEditorStore((s) => s.lineStripSearchQuery);
  const categoryFilter = useEditorStore((s) => s.lineStripCategoryFilter);
  const setLineStripSearch = useEditorStore((s) => s.setLineStripSearch);
  const toggleLineStripSearch = useEditorStore((s) => s.toggleLineStripSearch);
  const toggleLineStripCategory = useEditorStore((s) => s.toggleLineStripCategory);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // BpmList for time-to-beat conversion
  const bpmList = useMemo(() => new BpmList(bpmPoints), [bpmPoints]);
  const currentBeat = useMemo(() => bpmList.beatAtFloat(currentTime - offset), [bpmList, currentTime, offset]);

  // Classify all lines and compute sort order
  const lineData = useMemo(() => {
    return lines.map((line, i) => {
      const classification = classifyLine(line.events, line.event_layers, currentBeat);
      const category = line._category ?? autoCategorize(line);
      return { index: i, line, category, ...classification };
    });
  }, [lines, currentBeat]);

  // Sort: active first, then coming-soon, just-passed, long-passed, inactive
  const sortedLines = useMemo(() => {
    return [...lineData].sort((a, b) => a.sortKey - b.sortKey);
  }, [lineData]);

  // Apply search and category filters
  const filteredLines = useMemo(() => {
    let result = sortedLines;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(({ line, index }) =>
        (line.name || `Line ${index}`).toLowerCase().includes(q),
      );
    }
    if (categoryFilter) {
      result = result.filter(({ category }) => category && categoryFilter.includes(category));
    }
    return result;
  }, [sortedLines, searchQuery, categoryFilter]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggleLineStripSearch();
    }
  }, [toggleLineStripSearch]);

  // Auto-scroll selected line into view
  useEffect(() => {
    if (selectedLineIndex === null || !scrollRef.current) return;
    const chip = scrollRef.current.querySelector(`[data-line-index="${selectedLineIndex}"]`);
    if (chip) {
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [selectedLineIndex]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: 30,
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "0 8px",
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-color)",
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        flexWrap: "nowrap",
        scrollbarWidth: "none",
      }}
      className="linestrip-scroll"
    >
      {/* Search toggle button */}
      <button
        onClick={toggleLineStripSearch}
        style={{
          width: 24, height: 22, borderRadius: 3, border: "none",
          background: searchOpen ? "var(--accent-primary)" : "transparent",
          color: searchOpen ? "#fff" : "var(--text-muted)",
          cursor: "pointer", fontSize: 12, flexShrink: 0, padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit",
        }}
        title="Search lines (Ctrl+L)"
      >
        S
      </button>

      {/* Search input (visible when open) */}
      {searchOpen && (
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setLineStripSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search..."
          style={{
            width: 100, height: 22, borderRadius: 3, fontSize: 10,
            border: "1px solid var(--border-color)",
            background: "var(--bg-primary)", color: "var(--text-primary)",
            padding: "0 6px", flexShrink: 0, outline: "none",
            fontFamily: "inherit",
          }}
        />
      )}

      {/* Category filter dots */}
      {(["gameplay", "visual", "text", "helper"] as const).map((cat) => (
        <button
          key={cat}
          onClick={() => toggleLineStripCategory(cat)}
          style={{
            width: 10, height: 10, borderRadius: "50%", border: "none",
            background: LINE_CATEGORY_COLORS[cat],
            opacity: !categoryFilter || categoryFilter.includes(cat) ? 1 : 0.25,
            cursor: "pointer", flexShrink: 0, padding: 0,
            outline: categoryFilter?.includes(cat) ? `2px solid ${LINE_CATEGORY_COLORS[cat]}` : "none",
            outlineOffset: 1,
          }}
          title={`Filter: ${cat}`}
        />
      ))}

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)", flexShrink: 0 }} />

      {filteredLines.map(({ index, line, activity, isRecurring, category }) => {
        const isSelected = selectedLineIndex === index;
        const isMultiSelected = multiSelectedLineIndices.includes(index);
        const style = getChipStyle(activity, isRecurring, isSelected);
        const lineGroups = groups.filter((g) => g.type === "line" && g.lines.some((l: { lineIndex: number }) => l.lineIndex === index));

        return (
          <button
            key={index}
            data-line-index={index}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                toggleMultiSelectedLine(index);
              } else {
                selectLine(isSelected ? null : index);
              }
            }}
            onDoubleClick={() => {
              selectLine(index);
              openLineEventEditor(index, line.name || `Line ${index + 1}`);
            }}
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              border: "none",
              outline: isMultiSelected ? "2px solid #f59e0b" : "none",
              outlineOffset: -1,
              cursor: "pointer",
              fontSize: 10,
              whiteSpace: "nowrap",
              flexShrink: 0,
              background: style.background,
              color: style.color,
              borderLeft: style.borderLeft,
              fontWeight: isSelected ? 600 : activity === "active" ? 500 : 400,
              transition: "all 0.15s",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
            title={`${line.name || `Line ${index}`} — ${activity}${isRecurring ? " (recurring)" : ""}${lineGroups.length > 0 ? ` [${lineGroups.map((g) => g.name).join(", ")}]` : ""}`}
          >
            {category && LINE_CATEGORY_COLORS[category] && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: LINE_CATEGORY_COLORS[category], flexShrink: 0,
              }} />
            )}
            {lineGroups.map((g) => (
              <span
                key={g.id}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: g.color,
                  flexShrink: 0,
                }}
              />
            ))}
            {line.name || `Untitled`}
            <span style={{ marginLeft: 2, opacity: 0.5, fontSize: 9 }}>
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
      <style>{`.linestrip-scroll::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

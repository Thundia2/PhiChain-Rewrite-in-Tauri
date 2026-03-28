// ============================================================
// Text Event Helpers
//
// Utilities for creating and managing text events on lines.
// Automatically creates dedicated text lines when needed.
// ============================================================

import { useChartStore } from "../stores/chartStore";
import type { Line } from "../types/chart";

/**
 * Ensure the target line is suitable for text events.
 * If the current line has notes, create a new dedicated text line.
 * Returns the line index to use.
 */
export function ensureTextLine(currentLineIndex: number | null): number {
  const cs = useChartStore.getState();

  if (currentLineIndex === null) {
    return createNewTextLine();
  }

  const line = cs.chart.lines[currentLineIndex];
  if (!line) return createNewTextLine();

  const hasTextEvents = line.events.some((e) => e.kind === "text");
  const hasNotes = line.notes.length > 0;

  if (hasTextEvents && !hasNotes) {
    return currentLineIndex; // Already a text line
  }

  if (hasNotes) {
    return createNewTextLine(); // Create separate text line
  }

  return currentLineIndex; // Available for text use
}

function createNewTextLine(): number {
  const cs = useChartStore.getState();
  const existingTextLines = cs.chart.lines.filter((l) =>
    l.events.some((e) => e.kind === "text"),
  ).length;

  cs.addLine({
    name: `Lyrics ${existingTextLines + 1}`,
    _category: "text",
  } as Partial<Line>);

  const freshState = useChartStore.getState();
  const newLineIndex = freshState.chart.lines.length - 1;
  const newLine = freshState.chart.lines[newLineIndex];

  // Set opacity to 0 so the line itself is invisible (only text shows)
  if (newLine) {
    const opacityEventIndex = newLine.events.findIndex((e) => e.kind === "opacity");
    if (opacityEventIndex >= 0) {
      useChartStore.getState().editEvent(newLineIndex, opacityEventIndex, {
        value: { constant: 0 },
      });
    }
  }

  return newLineIndex;
}

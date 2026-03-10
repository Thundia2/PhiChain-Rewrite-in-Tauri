// ============================================================
// Global Hotkey System
//
// Registers all keyboard shortcuts using react-hotkeys-hook.
// Call useGlobalHotkeys() once in App.tsx to activate them.
// ============================================================

import { useHotkeys } from "react-hotkeys-hook";
import { useEditorStore } from "../stores/editorStore";
import { useChartStore } from "../stores/chartStore";
import { audioEngine } from "../audio/audioEngine";
import { CANVAS_WIDTH } from "../types/chart";
import { addBeats, subtractBeats, minimumBeat } from "../utils/beat";
import type { EditorTool } from "../types/editor";

export function useGlobalHotkeys(callbacks: {
  onNewChart?: () => void;
}) {
  // ---- Tool shortcuts ----
  const setTool = (tool: EditorTool) => () => useEditorStore.getState().setTool(tool);

  useHotkeys("v", setTool("select"), { preventDefault: true });
  useHotkeys("q", setTool("place_tap"), { preventDefault: true });
  useHotkeys("w", setTool("place_drag"), { preventDefault: true });
  useHotkeys("e", setTool("place_flick"), { preventDefault: true });
  useHotkeys("r", setTool("place_hold"), { preventDefault: true });
  useHotkeys("x", setTool("eraser"), { preventDefault: true });

  // ---- Unified Editor panels ----
  useHotkeys("l", () => useEditorStore.getState().toggleLineDrawer(), { preventDefault: true });
  useHotkeys("i", () => useEditorStore.getState().toggleUnifiedInspector(), { preventDefault: true });

  // ---- Undo / Redo ----
  useHotkeys("ctrl+z, meta+z", () => useChartStore.getState().undo(), { preventDefault: true });
  useHotkeys("ctrl+shift+z, meta+shift+z", () => useChartStore.getState().redo(), { preventDefault: true });

  // ---- Delete selected ----
  useHotkeys("delete, backspace", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;

    if (es.selectedNoteIndices.length > 0) {
      cs.removeNotes(es.selectedLineIndex, es.selectedNoteIndices);
      es.clearSelection();
    } else if (es.selectedEventIndices.length > 0) {
      cs.removeEvents(es.selectedLineIndex, es.selectedEventIndices);
      es.clearSelection();
    }
  }, { preventDefault: true });

  // ---- Select all notes on current line ----
  useHotkeys("ctrl+a, meta+a", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;
    es.setNoteSelection(line.notes.map((_, i) => i));
  }, { preventDefault: true });

  // ---- Move selected notes/events with arrow keys ----

  // ArrowUp: Move selected notes/events forward in time by one grid step
  useHotkeys("up", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;
    const step = minimumBeat(es.density);

    if (es.selectedNoteIndices.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      if (!line) return;
      cs.batchEditNotes(es.selectedLineIndex,
        es.selectedNoteIndices.map((idx) => ({
          noteIndex: idx,
          changes: { beat: addBeats(line.notes[idx].beat, step) },
        })),
      );
    } else if (es.selectedEventIndices.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      if (!line) return;
      cs.batchEditEvents(es.selectedLineIndex,
        es.selectedEventIndices.map((idx) => ({
          eventIndex: idx,
          changes: {
            start_beat: addBeats(line.events[idx].start_beat, step),
            end_beat: addBeats(line.events[idx].end_beat, step),
          },
        })),
      );
    }
  }, { preventDefault: true });

  // ArrowDown: Move selected notes/events backward in time
  useHotkeys("down", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;
    const step = minimumBeat(es.density);

    if (es.selectedNoteIndices.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      if (!line) return;
      cs.batchEditNotes(es.selectedLineIndex,
        es.selectedNoteIndices.map((idx) => ({
          noteIndex: idx,
          changes: { beat: subtractBeats(line.notes[idx].beat, step) },
        })),
      );
    } else if (es.selectedEventIndices.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      if (!line) return;
      cs.batchEditEvents(es.selectedLineIndex,
        es.selectedEventIndices.map((idx) => ({
          eventIndex: idx,
          changes: {
            start_beat: subtractBeats(line.events[idx].start_beat, step),
            end_beat: subtractBeats(line.events[idx].end_beat, step),
          },
        })),
      );
    }
  }, { preventDefault: true });

  // ArrowRight: Move selected notes right in X position
  useHotkeys("right", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length === 0) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    const xStep = Math.round(CANVAS_WIDTH / es.lanes);
    cs.batchEditNotes(es.selectedLineIndex,
      es.selectedNoteIndices.map((idx) => ({
        noteIndex: idx,
        changes: { x: line.notes[idx].x + xStep },
      })),
    );
  }, { preventDefault: true });

  // ArrowLeft: Move selected notes left in X position
  useHotkeys("left", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length === 0) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    const xStep = Math.round(CANVAS_WIDTH / es.lanes);
    cs.batchEditNotes(es.selectedLineIndex,
      es.selectedNoteIndices.map((idx) => ({
        noteIndex: idx,
        changes: { x: line.notes[idx].x - xStep },
      })),
    );
  }, { preventDefault: true });

  // ---- Playback ----
  useHotkeys("space", () => {
    audioEngine.togglePlayPause();
  }, { preventDefault: true });

  // ---- Save ----
  useHotkeys("ctrl+s, meta+s", async () => {
    const cs = useChartStore.getState();
    if (!cs.isLoaded || !cs.projectPath) return;
    try {
      const { saveProject } = await import("../utils/ipc");
      await saveProject(cs.projectPath, cs.getChartJson());
      cs.markClean();
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, { preventDefault: true });

  // ---- New chart ----
  useHotkeys("ctrl+n, meta+n", () => {
    callbacks.onNewChart?.();
  }, { preventDefault: true });

  // ---- Flip selected notes above/below ----
  useHotkeys("f", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length === 0) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    cs.batchEditNotes(es.selectedLineIndex,
      es.selectedNoteIndices.map((idx) => ({
        noteIndex: idx,
        changes: { above: !line.notes[idx].above },
      })),
    );
  }, { preventDefault: true });

  // ---- Fit All (Shift+F) — zoom to fit all visible lines ----
  useHotkeys("shift+f", () => {
    useEditorStore.getState().resetCanvasViewport();
  }, { preventDefault: true });
}

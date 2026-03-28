// ============================================================
// Global Hotkey System
//
// Registers all keyboard shortcuts using react-hotkeys-hook.
// Call useGlobalHotkeys() once in App.tsx to activate them.
// ============================================================

import { useHotkeys } from "react-hotkeys-hook";
import { useEditorStore } from "../stores/editorStore";
import { useChartStore } from "../stores/chartStore";
import { useAudioStore } from "../stores/audioStore";
import { useGroupStore } from "../stores/groupStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { audioEngine } from "../audio/audioEngine";
import { CANVAS_WIDTH } from "../types/chart";
import type { BookmarkPreset } from "../types/bookmark";
import { addBeats, subtractBeats, minimumBeat, snapBeat } from "../utils/beat";
import { BpmList } from "../utils/bpmList";
import type { EditorTool } from "../types/editor";
import { useToastStore } from "../stores/toastStore";

export function useGlobalHotkeys(callbacks: {
  onNewChart?: () => void;
  onCommandPalette?: () => void;
  onImportChart?: () => void;
}) {
  // ---- Tool shortcuts ----
  const setTool = (tool: EditorTool) => () => useEditorStore.getState().setTool(tool);

  useHotkeys("v", setTool("select"), { preventDefault: true });
  useHotkeys("x", setTool("eraser"), { preventDefault: true });

  // Q/W/E/R: place markers in mark mode, switch tools otherwise
  useHotkeys("q", () => {
    if (useEditorStore.getState().improvisationMode) { improvPlace("tap"); return; }
    useEditorStore.getState().setTool("place_tap");
  }, { preventDefault: true });
  useHotkeys("w", () => {
    if (useEditorStore.getState().improvisationMode) { improvPlace("drag"); return; }
    useEditorStore.getState().setTool("place_drag");
  }, { preventDefault: true });
  useHotkeys("e", () => {
    if (useEditorStore.getState().improvisationMode) { improvPlace("flick"); return; }
    useEditorStore.getState().setTool("place_flick");
  }, { preventDefault: true });
  useHotkeys("r", () => {
    if (useEditorStore.getState().improvisationMode) { improvPlace("hold"); return; }
    useEditorStore.getState().setTool("place_hold");
  }, { preventDefault: true });

  // ---- Unified Editor panels ----
  useHotkeys("l", () => useEditorStore.getState().toggleLineDrawer(), { preventDefault: true });
  useHotkeys("i", () => useEditorStore.getState().toggleUnifiedInspector(), { preventDefault: true });
  useHotkeys("k", () => useEditorStore.getState().toggleKeyframeBar(), { preventDefault: true });
  useHotkeys("shift+k", () => useEditorStore.getState().toggleCurveEditorExpanded(), { preventDefault: true });
  useHotkeys("ctrl+shift+k, meta+shift+k", () => {
    const es = useEditorStore.getState();
    if (es.curveEditorExpanded) {
      es.setCurveEditorPoppedOut(!es.curveEditorPoppedOut);
    }
  }, { preventDefault: true });

  // ---- Quick panel hotkeys ----
  useHotkeys("alt+1", () => useEditorStore.getState().toggleCanvasPanel("timeline"), { preventDefault: true });
  useHotkeys("alt+2", () => useEditorStore.getState().toggleCanvasPanel("line-list"), { preventDefault: true });
  useHotkeys("alt+3", () => useEditorStore.getState().toggleCanvasPanel("effects"), { preventDefault: true });

  // ---- LineStrip search ----
  useHotkeys("ctrl+l, meta+l", () => useEditorStore.getState().toggleLineStripSearch(), { preventDefault: true });

  // ---- Record mode ----
  useHotkeys("alt+r", () => useEditorStore.getState().toggleRecordMode(), { preventDefault: true });

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
    } else if (es.multiSelectedLineIndices.length > 0) {
      // Delete multi-selected lines (in reverse order to preserve indices)
      const sorted = [...es.multiSelectedLineIndices].sort((a, b) => b - a);
      for (const idx of sorted) {
        cs.removeLine(idx);
      }
      es.clearMultiSelectedLines();
      es.selectLine(null);
    } else if (cs.chart.lines.length > 0) {
      // Delete the currently selected line
      cs.removeLine(es.selectedLineIndex);
      // Select an adjacent line, or deselect if none left
      const remaining = cs.chart.lines.length; // already removed
      if (remaining === 0) {
        es.selectLine(null);
      } else {
        es.selectLine(Math.min(es.selectedLineIndex, remaining - 1));
      }
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
    if (!cs.isLoaded) return;
    try {
      if (cs.projectPath) {
        const { saveProject } = await import("../utils/ipc");
        await saveProject(cs.projectPath, cs.getChartJson());
      }
      cs.markClean();
      useToastStore.getState().addToast({ message: "Project saved", type: "success", duration: 1500 });
    } catch (e) {
      console.error("Save failed:", e);
      useToastStore.getState().addToast({ message: "Save failed", type: "error" });
    }
  }, { preventDefault: true });

  // ---- New chart ----
  useHotkeys("ctrl+n, meta+n", () => {
    callbacks.onNewChart?.();
  }, { preventDefault: true });

  // ---- Command palette ----
  useHotkeys("ctrl+k, meta+k", () => {
    callbacks.onCommandPalette?.();
  }, { preventDefault: true });

  // ---- Import chart ----
  useHotkeys("ctrl+o, meta+o", () => {
    callbacks.onImportChart?.();
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

  // ---- Beat Sync placement toggle ----
  useHotkeys("t", () => {
    useEditorStore.getState().toggleBeatSyncPlacement();
  }, { preventDefault: true, enableOnFormTags: false });

  // ---- Group editing ----

  // Ctrl+G: Toggle pattern tool
  useHotkeys("ctrl+g, meta+g", () => {
    const es = useEditorStore.getState();
    es.setTool(es.activeTool === "place_pattern" ? "select" : "place_pattern");
  }, { preventDefault: true });

  // Ctrl+Shift+G: Create group from currently selected lines or notes
  useHotkeys("ctrl+shift+g, meta+shift+g", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const gs = useGroupStore.getState();

    // Collect selected notes (from current line)
    const notesToAdd: Array<{ uid: string; lineIndex: number }> = [];
    if (es.selectedLineIndex !== null && es.selectedNoteIndices.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      if (line) {
        for (const ni of es.selectedNoteIndices) {
          const note = line.notes[ni];
          if (note?.uid) {
            notesToAdd.push({ uid: note.uid, lineIndex: es.selectedLineIndex });
          }
        }
      }
    }

    // If notes are selected, create a Note Group
    if (notesToAdd.length > 0) {
      const groupId = gs.createNoteGroup(
        `Note Group ${gs.groups.length + 1}`,
        [0, 0, 1],
        [999, 0, 1],
      );
      for (const { uid, lineIndex } of notesToAdd) {
        gs.addNoteToGroup(groupId, uid, lineIndex);
      }
      gs.enterGroupEditMode(groupId);
      useEditorStore.getState().setCanvasActivePanel("group-manager");
      return;
    }

    // Otherwise, create a Line Group from selected lines
    const linesToAdd = es.multiSelectedLineIndices.length > 0
      ? es.multiSelectedLineIndices
      : es.selectedLineIndex !== null ? [es.selectedLineIndex] : [];

    if (linesToAdd.length === 0) return;

    const groupId = gs.createLineGroup(
      `Line Group ${gs.groups.length + 1}`,
      [0, 0, 1],
      [999, 0, 1],
    );
    for (const li of linesToAdd) {
      gs.addLineToGroup(groupId, li);
    }
    gs.enterGroupEditMode(groupId);
    useEditorStore.getState().setCanvasActivePanel("group-manager");
  }, { preventDefault: true });

  // Escape: Exit group edit mode (when in group mode)
  useHotkeys("escape", () => {
    const gs = useGroupStore.getState();
    if (gs.activeGroupId) {
      gs.exitGroupEditMode();
    }
  }, { preventDefault: false });

  // G: Enter group edit mode for group containing selected line
  useHotkeys("g", () => {
    const es = useEditorStore.getState();
    const gs = useGroupStore.getState();

    // If already in group mode, ignore
    if (gs.activeGroupId) return;

    if (es.selectedLineIndex === null) return;
    const lineGroups = gs.getGroupsForLine(es.selectedLineIndex);
    if (lineGroups.length > 0) {
      gs.enterGroupEditMode(lineGroups[0].id);
    }
  }, { preventDefault: true, enableOnFormTags: false });

  // ---- Mark mode toggle ----
  useHotkeys("shift+i", () => {
    useEditorStore.getState().toggleImprovisationMode();
  }, { preventDefault: true });

  // ---- Mark mode: place colored bookmarks during playback ----
  const improvPlace = (preset: BookmarkPreset) => {
    const es = useEditorStore.getState();
    const as_ = useAudioStore.getState();
    const cs = useChartStore.getState();

    if (!es.improvisationMode || !as_.isPlaying) return;
    if (es.selectedLineIndex === null) return;

    const bpmList = new BpmList(cs.chart.bpm_list);
    const bs = useBookmarkStore.getState();

    // Latency compensation: shift time back so the marker lands
    // where the sound was, not where the playhead is when your finger hits the key
    const compensatedTime = as_.currentTime + (bs.latencyOffset / 1000);
    const currentBeat = bpmList.beatAtFloat(compensatedTime - cs.chart.offset);
    const beat = snapBeat(currentBeat, es.density);

    bs.addBookmark(beat, 0, true, es.selectedLineIndex, preset);
  };

  // Misc markers (1-3) — only fire in mark mode
  useHotkeys("1", () => {
    if (useEditorStore.getState().improvisationMode) improvPlace("orange");
  }, { preventDefault: false, enableOnFormTags: false });
  useHotkeys("2", () => {
    if (useEditorStore.getState().improvisationMode) improvPlace("green");
  }, { preventDefault: false, enableOnFormTags: false });
  useHotkeys("3", () => {
    if (useEditorStore.getState().improvisationMode) improvPlace("violet");
  }, { preventDefault: false, enableOnFormTags: false });
}

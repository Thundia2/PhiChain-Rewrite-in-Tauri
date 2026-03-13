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
import { audioEngine } from "../audio/audioEngine";
import { CANVAS_WIDTH, floatToBeat } from "../types/chart";
import type { Note, NoteKind } from "../types/chart";
import { addBeats, subtractBeats, minimumBeat } from "../utils/beat";
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
  useHotkeys("q", setTool("place_tap"), { preventDefault: true });
  useHotkeys("w", setTool("place_drag"), { preventDefault: true });
  useHotkeys("e", setTool("place_flick"), { preventDefault: true });
  useHotkeys("r", setTool("place_hold"), { preventDefault: true });
  useHotkeys("x", setTool("eraser"), { preventDefault: true });

  // ---- Unified Editor panels ----
  useHotkeys("l", () => useEditorStore.getState().toggleLineDrawer(), { preventDefault: true });
  useHotkeys("i", () => useEditorStore.getState().toggleUnifiedInspector(), { preventDefault: true });
  useHotkeys("k", () => useEditorStore.getState().toggleKeyframeBar(), { preventDefault: true });

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

  // Ctrl+G: Create group from currently selected lines or notes
  useHotkeys("ctrl+g, meta+g", () => {
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

  // ---- Improvisation mode toggle ----
  useHotkeys("shift+i", () => {
    useEditorStore.getState().toggleImprovisationMode();
  }, { preventDefault: true });

  // ---- Improvisation mode: place notes during playback ----
  // Keys: 1=tap, 2=drag, 3=flick, 4=hold (above), shift+1/2/3/4 (below)
  const improvisingPlace = (kind: NoteKind, above: boolean) => {
    const es = useEditorStore.getState();
    const as_ = useAudioStore.getState();
    const cs = useChartStore.getState();

    if (!es.improvisationMode || !as_.isPlaying) return;
    if (es.selectedLineIndex === null) return;

    const bpmList = new BpmList(cs.chart.bpm_list);
    const currentBeat = bpmList.beatAtFloat(as_.currentTime - cs.chart.offset);
    const beat = floatToBeat(currentBeat);

    const newNote: Note = {
      kind,
      above,
      beat,
      x: 0, // Center of line
      speed: 1,
    };

    cs.addNote(es.selectedLineIndex, newNote);
  };

  useHotkeys("1", () => improvisingPlace("tap", true), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("2", () => improvisingPlace("drag", true), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("3", () => improvisingPlace("flick", true), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("4", () => improvisingPlace("hold", true), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("shift+1", () => improvisingPlace("tap", false), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("shift+2", () => improvisingPlace("drag", false), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("shift+3", () => improvisingPlace("flick", false), { preventDefault: false, enableOnFormTags: false });
  useHotkeys("shift+4", () => improvisingPlace("hold", false), { preventDefault: false, enableOnFormTags: false });
}

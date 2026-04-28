// ============================================================
// Global Hotkey System
//
// Registers all keyboard shortcuts using react-hotkeys-hook.
// Call useGlobalHotkeys() once in App.tsx to activate them.
//
// Recent change: Added F2 hotkey for inline tab rename.
// ============================================================

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useEditorStore } from "../stores/editorStore";
import { useChartStore } from "../stores/chartStore";
import { useAudioStore } from "../stores/audioStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useGroupStore } from "../stores/groupStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useTabStore } from "../stores/tabStore";
import { audioEngine } from "../audio/audioEngine";
import { CANVAS_WIDTH } from "../types/chart";
import type { BookmarkPreset } from "../types/bookmark";
import { addBeats, subtractBeats, minimumBeat, snapBeat, beatToFloat, floatToBeat } from "../utils/beat";
import { BpmList } from "../utils/bpmList";
import { addMarkerAtCurrentBeat, seekToPrevBookmark, seekToNextBookmark } from "../utils/bookmarkNavigation";
import type { EditorTool } from "../types/editor";
import { useToastStore } from "../stores/toastStore";
import { useContextPanelStore } from "../stores/contextPanelStore";

export function useGlobalHotkeys(callbacks: {
  onNewChart?: () => void;
  onCommandPalette?: () => void;
  onImportChart?: () => void;
  onShowGoToBeat?: () => void;
  onShowPasteSpecial?: () => void;
  onShowOnsetCalibration?: () => void;
}) {
  // ---- Tool shortcuts ----
  const setTool = (tool: EditorTool) => () => useEditorStore.getState().setTool(tool);

  useHotkeys("v", setTool("select"), { preventDefault: true });
  useHotkeys("x", setTool("eraser"), { preventDefault: true });

  // Q/W/E/R: CapsLock = event tool; else mark / step record / note tool.
  // CapsLock takes priority — see plan tingly-napping-crayon.md §4.
  // event.getModifierState("CapsLock") reads the OS state and works
  // in Tauri's webview the same as in the browser.
  useHotkeys("q", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_x"); return; }
    if (es.improvisationMode) { improvPlace("tap"); return; }
    if (es.stepRecordActive) { es.setStepRecordNoteKind("tap"); return; }
    es.setTool("place_tap");
  }, { preventDefault: true });
  useHotkeys("w", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_y"); return; }
    if (es.improvisationMode) { improvPlace("drag"); return; }
    if (es.stepRecordActive) { es.setStepRecordNoteKind("drag"); return; }
    es.setTool("place_drag");
  }, { preventDefault: true });
  useHotkeys("e", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_rotation"); return; }
    if (es.improvisationMode) { improvPlace("flick"); return; }
    if (es.stepRecordActive) { es.setStepRecordNoteKind("flick"); return; }
    es.setTool("place_flick");
  }, { preventDefault: true });
  useHotkeys("r", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_opacity"); return; }
    if (es.improvisationMode) { improvPlace("hold"); return; }
    if (es.stepRecordActive) { es.setStepRecordNoteKind("hold"); return; }
    es.setTool("place_hold");
  }, { preventDefault: true });

  // ---- Unified Editor panels ----
  useHotkeys("l", () => useEditorStore.getState().toggleLineDrawer(), { preventDefault: true });
  // I: CapsLock = Color event tool; else toggle Unified Inspector
  useHotkeys("i", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_color"); return; }
    es.toggleUnifiedInspector();
  }, { preventDefault: true });
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

  // ---- Onset Detection toggle ----
  useHotkeys("shift+o", () => {
    const ss = useSettingsStore.getState();
    ss.updateSettings({ onsetDetectionEnabled: !ss.onsetDetectionEnabled });
  }, { preventDefault: true });

  // ---- Undo / Redo ----
  // Interleaved: compare sequence numbers to decide which store (chart vs bookmark) to undo/redo
  useHotkeys("ctrl+z, meta+z", () => {
    const cs = useChartStore.getState();
    const bs = useBookmarkStore.getState();
    const es = useEditorStore.getState();

    // Determine which store had the most recent action by comparing top-of-stack sequence numbers
    const chartTopSeq = cs._pastSeqs.length > 0 ? cs._pastSeqs[cs._pastSeqs.length - 1] : 0;
    const bmTopSeq = bs._pastSeqs.length > 0 ? bs._pastSeqs[bs._pastSeqs.length - 1] : 0;

    if (bmTopSeq > chartTopSeq && bs.canUndo()) {
      bs.undo();
    } else {
      cs.undo();
      // If in step record mode, also rewind the beat counter
      if (es.stepRecordActive && es.stepRecordNotesPlaced > 0) {
        es.rewindStepBeat();
      }
    }
  }, { preventDefault: true });
  // Redo — Ctrl+Y added as alias alongside Ctrl+Shift+Z
  useHotkeys("ctrl+shift+z, meta+shift+z, ctrl+y", () => {
    const cs = useChartStore.getState();
    const bs = useBookmarkStore.getState();

    const chartRedoSeq = cs._futureSeqs.length > 0 ? cs._futureSeqs[cs._futureSeqs.length - 1] : 0;
    const bmRedoSeq = bs._futureSeqs.length > 0 ? bs._futureSeqs[bs._futureSeqs.length - 1] : 0;

    if (bmRedoSeq > chartRedoSeq && bs.canRedo()) {
      bs.redo();
    } else {
      cs.redo();
    }
  }, { preventDefault: true });

  // ---- Delete selected ----
  useHotkeys("delete, backspace", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const bs = useBookmarkStore.getState();

    // Check for selected bookmarks first — they take priority so we don't
    // accidentally delete a line when the user just wanted to remove markers
    if (bs.selectedBookmarkIds.length > 0) {
      bs.deleteSelected();
      return;
    }

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

  // ---- AI tab hotkey (Ctrl+Shift+A) — switch to AI tab in context panel ----
  // Must be registered BEFORE ctrl+a so the modifier check takes priority
  useHotkeys("ctrl+shift+a, meta+shift+a", () => {
    if (!useSettingsStore.getState().aiEnabled) return;
    const es = useEditorStore.getState();
    const multiLen = es.multiSelectedLineIndices.length;
    let mode: string;
    if (multiLen > 1) mode = "multi";
    else if (es.selectedEventIndices.length > 0) mode = "event";
    else if (es.selectedNoteIndices.length > 0) mode = "note";
    else if (es.selectedLineIndex !== null) mode = "line";
    else mode = "global";
    useContextPanelStore.getState().setActiveTab(mode, "ai");
    useContextPanelStore.getState().setCollapsed(false);
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

    const xStep = es.verticalLines >= 2 ? Math.round(CANVAS_WIDTH / (es.verticalLines - 1)) : 0;
    if (xStep === 0) return;
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

    const xStep = es.verticalLines >= 2 ? Math.round(CANVAS_WIDTH / (es.verticalLines - 1)) : 0;
    if (xStep === 0) return;
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

  // ---- Loop region markers ----
  // [ — set loop start at current playhead beat
  useHotkeys("[", () => {
    const as_ = useAudioStore.getState();
    const cs = useChartStore.getState();
    if (!cs.isLoaded) return;
    const bpmList = new BpmList(cs.chart.bpm_list);
    const currentBeat = bpmList.beatAtFloat(Math.max(0, as_.currentTime - cs.chart.offset));
    as_.setLoopStart(currentBeat);
  }, { preventDefault: true });

  // ] — set loop end at current playhead beat
  useHotkeys("]", () => {
    const as_ = useAudioStore.getState();
    const cs = useChartStore.getState();
    if (!cs.isLoaded) return;
    const bpmList = new BpmList(cs.chart.bpm_list);
    const currentBeat = bpmList.beatAtFloat(Math.max(0, as_.currentTime - cs.chart.offset));
    as_.setLoopEnd(currentBeat);
  }, { preventDefault: true });

  // \ — toggle loop on/off
  useHotkeys("\\", () => {
    useAudioStore.getState().toggleLoop();
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

  // ---- Rename active tab ----
  useHotkeys("f2", () => {
    useTabStore.getState().startRenameTab();
  }, { preventDefault: true });

  // ---- Import chart ----
  useHotkeys("ctrl+o, meta+o", () => {
    callbacks.onImportChart?.();
  }, { preventDefault: true });

  // ---- Go to Beat dialog ----
  useHotkeys("ctrl+j, meta+j", () => {
    callbacks.onShowGoToBeat?.();
  }, { preventDefault: true });

  // ---- Onset Calibration dialog (Phase C of onset plan, 2026-04-20) ----
  useHotkeys("ctrl+shift+o, meta+shift+o", () => {
    callbacks.onShowOnsetCalibration?.();
  }, { preventDefault: true });

  // ---- Paste Special dialog ----
  useHotkeys("ctrl+alt+v, meta+alt+v", () => {
    callbacks.onShowPasteSpecial?.();
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

  // ---- Mirror selected notes horizontally (negate X) ----
  useHotkeys("m", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length === 0) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    cs.batchEditNotes(es.selectedLineIndex,
      es.selectedNoteIndices.map((idx) => ({
        noteIndex: idx,
        changes: { x: -line.notes[idx].x },
      })),
    );
  }, { preventDefault: true });

  // ---- Quantize selected notes to beat grid ----
  useHotkeys("ctrl+q, meta+q", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length === 0) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    cs.batchEditNotes(es.selectedLineIndex,
      es.selectedNoteIndices.map((idx) => ({
        noteIndex: idx,
        changes: { beat: snapBeat(beatToFloat(line.notes[idx].beat), es.density) },
      })),
    );
  }, { preventDefault: true });

  // ---- Distribute selected notes evenly in time ----
  useHotkeys("ctrl+d, meta+d", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length < 3) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    // Sort selected notes by beat to find the range
    const sorted = [...es.selectedNoteIndices]
      .map((idx) => ({ idx, beat: beatToFloat(line.notes[idx].beat) }))
      .sort((a, b) => a.beat - b.beat);

    const firstBeat = sorted[0].beat;
    const lastBeat = sorted[sorted.length - 1].beat;
    if (lastBeat <= firstBeat) return; // All at same beat — nothing to distribute
    const step = (lastBeat - firstBeat) / (sorted.length - 1);

    cs.batchEditNotes(es.selectedLineIndex,
      sorted.map((entry, i) => ({
        noteIndex: entry.idx,
        changes: { beat: floatToBeat(firstBeat + i * step) },
      })),
    );
  }, { preventDefault: true });

  // ---- Strum/stagger selected notes (spread beats by X position order) ----
  useHotkeys("ctrl+shift+s, meta+shift+s", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null || es.selectedNoteIndices.length < 2) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    // Sort selected notes by X position (left to right)
    const sorted = [...es.selectedNoteIndices]
      .map((idx) => ({ idx, x: line.notes[idx].x, beat: beatToFloat(line.notes[idx].beat) }))
      .sort((a, b) => a.x - b.x);

    // Apply incremental beat offset: each note gets +i * (1/density) beats
    const strumStep = 1 / es.density;
    cs.batchEditNotes(es.selectedLineIndex,
      sorted.map((entry, i) => ({
        noteIndex: entry.idx,
        changes: { beat: floatToBeat(entry.beat + i * strumStep) },
      })),
    );
  }, { preventDefault: true });

  // ---- Fit All (Shift+F) — zoom to fit all visible lines ----
  useHotkeys("shift+f", () => {
    useEditorStore.getState().resetCanvasViewport();
  }, { preventDefault: true });

  // ---- Beat Sync placement toggle ----
  // T: CapsLock = Speed event tool; else toggle Beat Sync placement.
  useHotkeys("t", (event) => {
    const es = useEditorStore.getState();
    if (event.getModifierState("CapsLock")) { es.setTool("place_event_speed"); return; }
    es.toggleBeatSyncPlacement();
  }, { preventDefault: true, enableOnFormTags: false });

  // ---- Y / U / O — CapsLock-only event hotkeys ----
  // These keys aren't bound otherwise, but per the user's spec they
  // STILL require CapsLock so the event-mode dimension remains
  // consistent across the QWERTY top row. No-op without CapsLock.
  useHotkeys("y", (event) => {
    if (!event.getModifierState("CapsLock")) return;
    useEditorStore.getState().setTool("place_event_scale_x");
  }, { preventDefault: true });
  useHotkeys("u", (event) => {
    if (!event.getModifierState("CapsLock")) return;
    useEditorStore.getState().setTool("place_event_scale_y");
  }, { preventDefault: true });
  useHotkeys("o", (event) => {
    if (!event.getModifierState("CapsLock")) return;
    useEditorStore.getState().setTool("place_event_text");
  }, { preventDefault: true });

  // ---- Step Record toggle ----
  useHotkeys("s", () => {
    useEditorStore.getState().toggleStepRecord();
  }, { preventDefault: true, enableOnFormTags: false });

  // ---- X Snap toggle ----
  useHotkeys("shift+x", () => {
    useEditorStore.getState().toggleXSnap();
  }, { preventDefault: true });

  // ---- Step size adjustment (only during step recording) ----
  useHotkeys("shift+up", () => {
    const es = useEditorStore.getState();
    if (es.stepRecordActive) es.doubleStepSize();
  }, { preventDefault: true });

  useHotkeys("shift+down", () => {
    const es = useEditorStore.getState();
    if (es.stepRecordActive) es.halveStepSize();
  }, { preventDefault: true });

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

  // Escape: Exit step record first, then group edit mode, then clear loop
  useHotkeys("escape", () => {
    const es = useEditorStore.getState();
    if (es.stepRecordActive) { es.exitStepRecord(); return; }
    const gs = useGroupStore.getState();
    if (gs.activeGroupId) { gs.exitGroupEditMode(); return; }
    // Clear loop region markers if set
    const as_ = useAudioStore.getState();
    if (as_.loopStartBeat !== null || as_.loopEndBeat !== null) {
      as_.clearLoop();
    }
  }, { preventDefault: false });

  // G: Context-aware — toggle mini preview in unrolled editor, else enter group edit mode
  useHotkeys("g", () => {
    // Check which tab type is active to decide behavior
    const activeTab = useTabStore.getState().tabs.find(
      (t) => t.id === useTabStore.getState().activeTabId
    );

    // In unrolled editor: toggle mini game preview
    if (activeTab?.type === "unrolled_editor") {
      useEditorStore.getState().toggleMiniPreview();
      return;
    }

    // Elsewhere: existing group edit mode behavior
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

  // Ctrl+Shift+U: Open/focus the unrolled editor tab
  useHotkeys("ctrl+shift+u, meta+shift+u", () => {
    useTabStore.getState().openUnrolledEditor();
  }, { preventDefault: true });

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

  // ---- Section marker hotkey (Ctrl+B) — add marker at current beat ----
  useHotkeys("ctrl+b, meta+b", () => {
    addMarkerAtCurrentBeat();
  }, { preventDefault: true });

  // ---- Ctrl+Shift+Scroll for bookmark navigation ----
  // Uses Ctrl+Shift+wheel to avoid conflicting with Ctrl+wheel (canvas zoom)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Require BOTH Ctrl and Shift to avoid conflict with canvas Ctrl+scroll zoom
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (!useChartStore.getState().isLoaded) return;

      // Only navigate if there are bookmarks to navigate to
      const bookmarks = useBookmarkStore.getState().bookmarks;
      if (!bookmarks || bookmarks.length === 0) return;

      if (e.deltaY < 0) {
        seekToNextBookmark();
      } else if (e.deltaY > 0) {
        seekToPrevBookmark();
      }
      e.preventDefault();
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);
}

// ============================================================
// Clipboard — Copy/Paste Notes and Events
//
// Stores copied notes/events in an in-memory clipboard (not the
// system clipboard, since note data isn't plain text).
//
// Paste offsets notes to the current scroll position.
// ============================================================

import { useHotkeys } from "react-hotkeys-hook";
import { useEditorStore } from "../stores/editorStore";
import { useChartStore } from "../stores/chartStore";
import { useAudioStore } from "../stores/audioStore";
import { BpmList } from "../utils/bpmList";
import { beatToFloat, floatToBeat } from "../types/chart";
import type { Note, LineEvent, Beat } from "../types/chart";

interface ClipboardData {
  notes: Note[];
  events: LineEvent[];
  /** The beat of the earliest item — used to compute paste offset */
  baseBeat: number;
}

let clipboard: ClipboardData | null = null;

function offsetBeat(beat: Beat, delta: number): Beat {
  return floatToBeat(Math.max(0, beatToFloat(beat) + delta));
}

export function useClipboard() {
  // ---- Copy (Ctrl+C) ----
  useHotkeys("ctrl+c, meta+c", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    const copiedNotes: Note[] = [];
    const copiedEvents: LineEvent[] = [];
    let baseBeat = Infinity;

    for (const idx of es.selectedNoteIndices) {
      const note = line.notes[idx];
      if (note) {
        copiedNotes.push(structuredClone(note));
        baseBeat = Math.min(baseBeat, beatToFloat(note.beat));
      }
    }

    for (const idx of es.selectedEventIndices) {
      const event = line.events[idx];
      if (event) {
        copiedEvents.push(structuredClone(event));
        baseBeat = Math.min(baseBeat, beatToFloat(event.start_beat));
      }
    }

    if (copiedNotes.length === 0 && copiedEvents.length === 0) return;

    clipboard = {
      notes: copiedNotes,
      events: copiedEvents,
      baseBeat: baseBeat === Infinity ? 0 : baseBeat,
    };
  }, { preventDefault: true });

  // ---- Cut (Ctrl+X) ----
  useHotkeys("ctrl+x, meta+x", () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    // Copy first
    const copiedNotes: Note[] = [];
    const copiedEvents: LineEvent[] = [];
    let baseBeat = Infinity;

    for (const idx of es.selectedNoteIndices) {
      const note = line.notes[idx];
      if (note) {
        copiedNotes.push(structuredClone(note));
        baseBeat = Math.min(baseBeat, beatToFloat(note.beat));
      }
    }

    for (const idx of es.selectedEventIndices) {
      const event = line.events[idx];
      if (event) {
        copiedEvents.push(structuredClone(event));
        baseBeat = Math.min(baseBeat, beatToFloat(event.start_beat));
      }
    }

    if (copiedNotes.length === 0 && copiedEvents.length === 0) return;

    clipboard = {
      notes: copiedNotes,
      events: copiedEvents,
      baseBeat: baseBeat === Infinity ? 0 : baseBeat,
    };

    // Then delete selected
    if (es.selectedNoteIndices.length > 0) {
      cs.removeNotes(es.selectedLineIndex, es.selectedNoteIndices);
    }
    if (es.selectedEventIndices.length > 0) {
      cs.removeEvents(es.selectedLineIndex, es.selectedEventIndices);
    }
    es.clearSelection();
  }, { preventDefault: true });

  // ---- Paste (Ctrl+V) ----
  useHotkeys("ctrl+v, meta+v", () => {
    if (!clipboard) return;
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;

    // Compute paste offset: paste at the current playback position
    const { currentTime } = useAudioStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const currentBeat = bpmList.beatAtFloat(currentTime - cs.chart.offset);
    const beatOffset = currentBeat - clipboard.baseBeat;

    // Paste notes
    const newNoteIndices: number[] = [];
    const existingNoteCount = cs.chart.lines[es.selectedLineIndex].notes.length;

    for (const note of clipboard.notes) {
      const pasted: Note = {
        ...structuredClone(note),
        beat: offsetBeat(note.beat, beatOffset),
      };
      cs.addNote(es.selectedLineIndex, pasted);
    }

    // Paste events
    for (const event of clipboard.events) {
      const duration = beatToFloat(event.end_beat) - beatToFloat(event.start_beat);
      const pasted: LineEvent = {
        ...structuredClone(event),
        start_beat: offsetBeat(event.start_beat, beatOffset),
        end_beat: offsetBeat(event.start_beat, beatOffset + duration),
      };
      cs.addEvent(es.selectedLineIndex, pasted);
    }

    // Select the pasted notes
    if (clipboard.notes.length > 0) {
      const line = cs.chart.lines[es.selectedLineIndex];
      const count = line.notes.length;
      // The newest notes are at the end (after sorting)
      es.setNoteSelection(
        Array.from({ length: clipboard.notes.length }, (_, i) => existingNoteCount + i)
          .filter(i => i < count)
      );
    }
  }, { preventDefault: true });
}

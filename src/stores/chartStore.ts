// ============================================================
// Chart Store — Zustand + Immer
//
// Recent change: Added _pastSeqs/_futureSeqs sequence tracking
// to undo/redo stacks (via undoSequence.ts) so Ctrl+Z/Ctrl+Y
// correctly interleaves chart and bookmark undo operations.
// ============================================================

import { create } from "zustand";
import { produce, current } from "immer";
import type {
  PhichainChart,
  ProjectMeta,
  ProjectData,
  Line,
  Note,
  LineEvent,
  BpmPoint,
  CurveNoteTrack,
  EventLayer,
  LineEventKind,
} from "../types/chart";
import { beatToFloat } from "../types/chart";
import type { ExtraConfig } from "../types/extra";
import { DEFAULT_EXTRA_CONFIG } from "../types/extra";
import { ensureNoteUids, generateNoteUid } from "../utils/noteUid";
import { BpmList } from "../utils/bpmList";
import { nextUndoSeq } from "../utils/undoSequence";

// ============================================================
// CONFIGURABLE: Maximum undo history depth
// ============================================================
const MAX_HISTORY = 200;

// ---- Cached BpmList — avoids re-creating on every consumer call ----
// Rebuilds only when the bpm_list reference changes.
let _cachedBpmListRef: BpmPoint[] | null = null;
let _cachedBpmList: BpmList | null = null;

/**
 * Get a cached BpmList instance for the current chart.
 * Consumers should call this instead of `new BpmList(cs.chart.bpm_list)`.
 */
export function getCachedBpmList(): BpmList {
  const bpmListRef = useChartStore.getState().chart.bpm_list;
  if (bpmListRef !== _cachedBpmListRef || !_cachedBpmList) {
    _cachedBpmListRef = bpmListRef;
    _cachedBpmList = new BpmList(bpmListRef);
  }
  return _cachedBpmList;
}

// ---- Cached multi-highlight beats — avoids O(all notes) per frame ----
// Rebuilds only when the lines array reference changes (Immer produces new ref on mutation).
let _cachedMultiBeatsLinesRef: Line[] | null = null;
let _cachedMultiBeats: Set<number> | null = null;

/**
 * Get the set of beat positions that have notes on multiple lines.
 * Cached across frames — only rebuilt when chart.lines changes.
 */
export function getCachedMultiBeats(): Set<number> {
  const lines = useChartStore.getState().chart.lines;
  if (lines !== _cachedMultiBeatsLinesRef || !_cachedMultiBeats) {
    _cachedMultiBeatsLinesRef = lines;
    const beatCounts = new Map<number, number>();
    for (const line of lines) {
      for (const note of line.notes) {
        const b = beatToFloat(note.beat);
        beatCounts.set(b, (beatCounts.get(b) ?? 0) + 1);
      }
    }
    _cachedMultiBeats = new Set<number>();
    for (const [b, count] of beatCounts) {
      if (count > 1) _cachedMultiBeats.add(b);
    }
  }
  return _cachedMultiBeats;
}

// Default empty chart
const DEFAULT_CHART: PhichainChart = {
  format: 1,
  offset: 0,
  bpm_list: [{ beat: [0, 0, 1], bpm: 120 }],
  lines: [],
};

const DEFAULT_META: ProjectMeta = {
  composer: "",
  charter: "",
  illustrator: "",
  name: "",
  level: "",
};

// ---- Helper: create a default line with initial events ----
function createDefaultLine(name?: string, index?: number): Line {
  const defaultBeat: [number, number, number] = [0, 0, 1];
  const farBeat: [number, number, number] = [1000, 0, 1];
  return {
    name: name ?? `Line ${(index ?? 0) + 1}`,
    notes: [],
    events: [
      { kind: "x" as const, start_beat: defaultBeat, end_beat: farBeat, value: { constant: 0 } },
      { kind: "y" as const, start_beat: defaultBeat, end_beat: farBeat, value: { constant: 0 } },
      { kind: "rotation" as const, start_beat: defaultBeat, end_beat: farBeat, value: { constant: 0 } },
      { kind: "opacity" as const, start_beat: defaultBeat, end_beat: farBeat, value: { constant: 255 } },
      { kind: "speed" as const, start_beat: defaultBeat, end_beat: farBeat, value: { constant: 1 } },
    ],
    children: [],
    curve_note_tracks: [],
  };
}

// ---- Helper: push current chart to past, clear future ----
function pushHistory(state: ChartState) {
  state._past.push(current(state.chart));
  state._pastSeqs.push(nextUndoSeq());
  if (state._past.length > MAX_HISTORY) {
    state._past.shift();
    state._pastSeqs.shift();
  }
  state._future = [];
  state._futureSeqs = [];
  state.isDirty = true;
}

// ---- Helper: sort notes by beat within a line ----
function sortNotes(notes: Note[]) {
  notes.sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));
}

// ---- Helper: sort events by start beat ----
function sortEvents(events: LineEvent[]) {
  events.sort((a, b) => beatToFloat(a.start_beat) - beatToFloat(b.start_beat));
}

// ---- Helper: get the events array for a given kind within an event layer ----
function getLayerEvents(layer: EventLayer, kind: LineEventKind): LineEvent[] {
  switch (kind) {
    case "x": return layer.move_x_events;
    case "y": return layer.move_y_events;
    case "rotation": return layer.rotate_events;
    case "opacity": return layer.alpha_events;
    case "speed": return layer.speed_events;
    default: return [];
  }
}

// ---- Helper: create an empty event layer ----
function createEmptyLayer(): EventLayer {
  return {
    move_x_events: [],
    move_y_events: [],
    rotate_events: [],
    alpha_events: [],
    speed_events: [],
  };
}

// ============================================================
// State shape
// ============================================================

export interface ChartState {
  // Project info
  projectPath: string | null;
  musicPath: string | null;
  illustrationPath: string | null;
  meta: ProjectMeta;
  isDirty: boolean;
  isLoaded: boolean;

  // Chart data (serialized to/from chart.json)
  chart: PhichainChart;

  // Undo/redo stacks
  _past: PhichainChart[];
  _future: PhichainChart[];
  /** Parallel sequence arrays — each entry's index matches the corresponding _past/_future entry */
  _pastSeqs: number[];
  _futureSeqs: number[];

  // ---- Project lifecycle ----
  /** Load a project from disk data. Resets undo history and marks clean. */
  loadFromProjectData: (data: ProjectData) => void;
  /** Close current project, reset all state to defaults. */
  closeProject: () => void;
  /** Mark the project as saved (isDirty = false). */
  markClean: () => void;

  // ---- Chart-level mutations ----
  /** Set the chart's audio offset in seconds. Pushes undo. */
  setOffset: (offset: number) => void;
  /** Update project metadata (name, composer, charter, etc.). Pushes undo. */
  setMeta: (changes: Partial<ProjectMeta>) => void;
  /** Replace the entire BPM list. Invalidates the cached BpmList instance. Pushes undo. */
  setBpmList: (bpmList: BpmPoint[]) => void;
  /** Set the per-chart onset-detection target density (Phase B, 2026-04-20).
   *  Phichain-native only — dropped on Official/RPE/PEC export. When absent,
   *  the editor falls back to `settingsStore.onsetTargetDensity`. Pushes undo
   *  so density changes are reversible with Ctrl+Z just like any other chart
   *  edit. */
  setOnsetTargetDensity: (density: number | undefined) => void;

  // ---- Line mutations ----
  /** Add a new line with optional overrides. Generates a unique name if none given. Pushes undo. */
  addLine: (line?: Partial<Line>) => void;
  /** Add multiple lines in a single undo entry. */
  batchAddLines: (partials: Partial<Line>[]) => void;
  /** Remove a line by index. Clears selection if the removed line was selected. Pushes undo. */
  removeLine: (lineIndex: number) => void;
  /** Deep-clone a line and insert after the original. Pushes undo. */
  duplicateLine: (lineIndex: number) => void;
  /** Merge partial changes into a line. Only sorts events if beat fields changed. Pushes undo. */
  editLine: (lineIndex: number, changes: Partial<Line>) => void;
  /** Move a line from one position to another. Pushes undo. */
  reorderLines: (fromIndex: number, toIndex: number) => void;

  // ---- Note mutations ----
  /** Add a note to a line. Assigns a UID, sorts by beat. Pushes undo. */
  addNote: (lineIndex: number, note: Note) => void;
  /** Remove notes by their indices within a line. Pushes undo. */
  removeNotes: (lineIndex: number, noteIndices: number[]) => void;
  /** Edit a single note's properties. Pushes undo. */
  editNote: (lineIndex: number, noteIndex: number, changes: Partial<Note>) => void;
  /** Edit multiple notes with the same changes. Pushes undo. */
  editNotes: (lineIndex: number, noteIndices: number[], changes: Partial<Note>) => void;

  // ---- Batch note/event mutations (single undo entry) ----
  /** Add multiple notes to a line. Assigns UIDs, sorts by beat. Single undo entry. */
  batchAddNotes: (lineIndex: number, notes: Note[]) => void;
  /** Apply different edits to different notes. Single undo entry. */
  batchEditNotes: (lineIndex: number, edits: Array<{ noteIndex: number; changes: Partial<Note> }>) => void;
  /** Apply different edits to different events. Single undo entry. */
  batchEditEvents: (lineIndex: number, edits: Array<{ eventIndex: number; changes: Partial<LineEvent> }>) => void;

  /** Atomically apply mutations across multiple lines as a single undo entry (used by group batch operations) */
  batchMultiLineMutations: (mutations: Array<{
    lineIndex: number;
    noteEdits?: Array<{ noteIndex: number; changes: Partial<Note> }>;
    eventEdits?: Array<{ eventIndex: number; changes: Partial<LineEvent> }>;
    newEvents?: LineEvent[];
    newNotes?: Note[];
    removeEventIndices?: number[];
  }>) => void;

  // ---- Event mutations ----
  /** Add an event to a line's flat event array. Sorts by start_beat. Pushes undo. */
  addEvent: (lineIndex: number, event: LineEvent) => void;
  /** Remove events by indices from a line's flat event array. Pushes undo. */
  removeEvents: (lineIndex: number, eventIndices: number[]) => void;
  /** Edit a single event's properties. Pushes undo. */
  editEvent: (lineIndex: number, eventIndex: number, changes: Partial<LineEvent>) => void;
  /** Atomically replace one event with one or more new events (single undo entry) */
  replaceEvent: (lineIndex: number, oldEventIndex: number, newEvents: LineEvent[]) => void;

  // ---- Event layer mutations (RPE multi-layer events) ----
  /** Add an event to a specific RPE event layer. Creates the layer if needed. Pushes undo. */
  addEventToLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, event: LineEvent) => void;
  /** Remove events from a specific RPE event layer. Pushes undo. */
  removeEventsFromLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, eventIndices: number[]) => void;
  /** Edit a single event within a specific RPE event layer. Pushes undo. */
  editEventInLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, eventIndex: number, changes: Partial<LineEvent>) => void;
  /** Ensure a line has at least one event_layers entry (creates empty layers if missing). */
  ensureEventLayers: (lineIndex: number) => void;
  /** Batch-add events to a specific event layer as a single undo entry */
  batchAddEventsToLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, events: LineEvent[]) => void;

  // ---- Curve note track mutations ----
  addCurveNoteTrack: (lineIndex: number, track: CurveNoteTrack) => void;
  removeCurveNoteTrack: (lineIndex: number, trackIndex: number) => void;
  editCurveNoteTrack: (lineIndex: number, trackIndex: number, changes: Partial<CurveNoteTrack["options"]>) => void;

  // ---- Illustration ----
  illustrationImage: HTMLImageElement | null;
  loadIllustration: (src: string) => Promise<void>;
  clearIllustration: () => void;

  // ---- Line textures (custom images for texture lines) ----
  lineTextures: Map<string, Blob>;
  setLineTexture: (name: string, blob: Blob) => void;
  removeLineTexture: (name: string) => void;
  clearLineTextures: () => void;

  // ---- Extra config (prpr/Phira extra.json) ----
  extraConfig: ExtraConfig;
  setExtraConfig: (config: ExtraConfig) => void;

  // ---- Chart font (custom font from chart ZIP for text events) ----
  chartFontFamily: string | null;
  setChartFontFamily: (family: string | null) => void;

  // ---- Undo/redo ----
  /** Revert to previous chart state. Moves current state to _future stack. */
  undo: () => void;
  /** Re-apply a previously undone change. Moves state from _future to _past. */
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- Derived data helpers ----
  totalNoteCount: () => number;
  totalEventCount: () => number;
  getChartJson: () => string;

  // ---- Diff summary (stub — no original chart snapshot yet) ----
  getDiffSummary: () => { linesAdded: number; linesRemoved: number; notesAdded: number; notesRemoved: number; eventsAdded: number; eventsRemoved: number } | null;
}

// ============================================================
// Store
// ============================================================

export const useChartStore = create<ChartState>()((set, get) => ({
  // ---- Initial state ----
  projectPath: null,
  musicPath: null,
  illustrationPath: null,
  meta: { ...DEFAULT_META },
  isDirty: false,
  isLoaded: false,
  chart: structuredClone(DEFAULT_CHART),
  _past: [],
  _future: [],
  _pastSeqs: [],
  _futureSeqs: [],
  illustrationImage: null,
  lineTextures: new Map<string, Blob>(),
  extraConfig: { ...DEFAULT_EXTRA_CONFIG },
  chartFontFamily: null,

  // ---- Project lifecycle ----

  loadFromProjectData: (data) => {
    const chart = JSON.parse(data.chart_json) as PhichainChart;
    ensureNoteUids(chart);
    set({
      projectPath: data.project_path,
      musicPath: data.music_path,
      illustrationPath: data.illustration_path,
      meta: data.meta,
      chart,
      isDirty: false,
      isLoaded: true,
      _past: [],
      _future: [],
      _pastSeqs: [],
      _futureSeqs: [],
      lineTextures: new Map<string, Blob>(),
      chartFontFamily: null,
    });
  },

  closeProject: () =>
    set({
      projectPath: null,
      musicPath: null,
      illustrationPath: null,
      illustrationImage: null, // Clear the illustration HTMLImageElement reference
      meta: { ...DEFAULT_META },
      chart: structuredClone(DEFAULT_CHART),
      isDirty: false,
      isLoaded: false,
      _past: [],
      _future: [],
      _pastSeqs: [],
      _futureSeqs: [],
      lineTextures: new Map<string, Blob>(),
      chartFontFamily: null,
      extraConfig: { ...DEFAULT_EXTRA_CONFIG },
    }),

  markClean: () => set({ isDirty: false }),

  // ---- Chart-level mutations ----

  setOffset: (offset) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        state.chart.offset = offset;
      }),
    ),

  setMeta: (changes) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        Object.assign(state.meta, changes);
      }),
    ),

  setBpmList: (bpmList) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        state.chart.bpm_list = bpmList;
      }),
    ),

  setOnsetTargetDensity: (density) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        // Pass `undefined` to clear the field → falls back to the global
        // settingsStore default at read time in useOnsetDetection.
        if (density === undefined) {
          delete state.chart.onset_target_density;
        } else {
          state.chart.onset_target_density = density;
        }
      }),
    ),

  // ---- Line mutations ----

  addLine: (partial) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        const line = { ...createDefaultLine(undefined, state.chart.lines.length), ...partial };
        state.chart.lines.push(line);
      }),
    ),

  batchAddLines: (partials) =>
    set(
      produce((state: ChartState) => {
        if (partials.length === 0) return;
        pushHistory(state);
        for (const partial of partials) {
          const line = { ...createDefaultLine(undefined, state.chart.lines.length), ...partial };
          state.chart.lines.push(line);
        }
      }),
    ),

  removeLine: (lineIndex) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        state.chart.lines.splice(lineIndex, 1);
      }),
    ),

  duplicateLine: (lineIndex) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        const original = state.chart.lines[lineIndex];
        const duplicated = JSON.parse(JSON.stringify(original));
        duplicated.name = (duplicated.name || `Line ${lineIndex}`) + " (copy)";
        state.chart.lines.splice(lineIndex + 1, 0, duplicated);
      }),
    ),

  editLine: (lineIndex, changes) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        Object.assign(state.chart.lines[lineIndex], changes);
      }),
    ),

  reorderLines: (fromIndex, toIndex) =>
    set(
      produce((state: ChartState) => {
        const lines = state.chart.lines;
        if (
          fromIndex < 0 || fromIndex >= lines.length ||
          toIndex < 0 || toIndex >= lines.length ||
          fromIndex === toIndex
        ) return;
        pushHistory(state);
        const [moved] = lines.splice(fromIndex, 1);
        lines.splice(toIndex, 0, moved);
      }),
    ),

  // ---- Note mutations ----

  addNote: (lineIndex, note) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        if (!note.uid) {
          note.uid = generateNoteUid();
        }
        state.chart.lines[lineIndex].notes.push(note);
        sortNotes(state.chart.lines[lineIndex].notes);
      }),
    ),

  removeNotes: (lineIndex, noteIndices) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        if (noteIndices.length === 0) return;
        pushHistory(state);
        // Remove in reverse order to preserve indices
        const sorted = [...noteIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          state.chart.lines[lineIndex].notes.splice(idx, 1);
        }
      }),
    ),

  editNote: (lineIndex, noteIndex, changes) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || noteIndex < 0 || noteIndex >= line.notes.length) return;
        pushHistory(state);
        Object.assign(line.notes[noteIndex], changes);
        sortNotes(line.notes);
      }),
    ),

  editNotes: (lineIndex, noteIndices, changes) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || noteIndices.length === 0) return;
        pushHistory(state);
        for (const idx of noteIndices) {
          if (idx >= 0 && idx < line.notes.length) {
            Object.assign(line.notes[idx], changes);
          }
        }
        // Only sort if beat was changed — skip for non-beat edits (x, kind, alpha, etc.)
        if ("beat" in changes) sortNotes(line.notes);
      }),
    ),

  // ---- Batch note/event mutations ----

  batchAddNotes: (lineIndex, notes) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        if (notes.length === 0) return;
        pushHistory(state);
        for (const note of notes) {
          state.chart.lines[lineIndex].notes.push(note);
        }
        sortNotes(state.chart.lines[lineIndex].notes);
      }),
    ),

  batchEditNotes: (lineIndex, edits) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || edits.length === 0) return;
        pushHistory(state);
        let beatChanged = false;
        for (const { noteIndex, changes } of edits) {
          if (noteIndex >= 0 && noteIndex < line.notes.length) {
            Object.assign(line.notes[noteIndex], changes);
            if ("beat" in changes) beatChanged = true;
          }
        }
        // Only sort if any beat was changed — skip for non-beat edits (x, kind, alpha, etc.)
        if (beatChanged) sortNotes(line.notes);
      }),
    ),

  batchEditEvents: (lineIndex, edits) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || edits.length === 0) return;
        pushHistory(state);
        for (const { eventIndex, changes } of edits) {
          if (eventIndex >= 0 && eventIndex < line.events.length) {
            Object.assign(line.events[eventIndex], changes);
          }
        }
        sortEvents(line.events);
      }),
    ),

  batchMultiLineMutations: (mutations) =>
    set(
      produce((state: ChartState) => {
        if (mutations.length === 0) return;
        pushHistory(state);
        for (const mut of mutations) {
          const line = state.chart.lines[mut.lineIndex];
          if (!line) continue;
          if (mut.noteEdits) {
            for (const { noteIndex, changes } of mut.noteEdits) {
              if (noteIndex >= 0 && noteIndex < line.notes.length) {
                Object.assign(line.notes[noteIndex], changes);
              }
            }
            sortNotes(line.notes);
          }
          if (mut.eventEdits) {
            for (const { eventIndex, changes } of mut.eventEdits) {
              if (eventIndex >= 0 && eventIndex < line.events.length) {
                Object.assign(line.events[eventIndex], changes);
              }
            }
          }
          if (mut.removeEventIndices && mut.removeEventIndices.length > 0) {
            const sorted = [...mut.removeEventIndices].sort((a, b) => b - a);
            for (const idx of sorted) {
              if (idx >= 0 && idx < line.events.length) {
                line.events.splice(idx, 1);
              }
            }
          }
          if (mut.newNotes && mut.newNotes.length > 0) {
            for (const note of mut.newNotes) {
              if (!note.uid) note.uid = generateNoteUid();
              line.notes.push(note);
            }
            sortNotes(line.notes);
          }
          if (mut.newEvents) {
            line.events.push(...mut.newEvents);
          }
          sortEvents(line.events);
        }
      }),
    ),

  // ---- Event mutations ----

  addEvent: (lineIndex, event) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        state.chart.lines[lineIndex].events.push(event);
        sortEvents(state.chart.lines[lineIndex].events);
      }),
    ),

  removeEvents: (lineIndex, eventIndices) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        if (eventIndices.length === 0) return;
        pushHistory(state);
        const sorted = [...eventIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          state.chart.lines[lineIndex].events.splice(idx, 1);
        }
      }),
    ),

  editEvent: (lineIndex, eventIndex, changes) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || eventIndex < 0 || eventIndex >= line.events.length) return;
        pushHistory(state);
        Object.assign(line.events[eventIndex], changes);
        sortEvents(line.events);
      }),
    ),

  replaceEvent: (lineIndex, oldEventIndex, newEvents) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || oldEventIndex < 0 || oldEventIndex >= line.events.length) return;
        pushHistory(state);
        line.events.splice(oldEventIndex, 1, ...newEvents);
        sortEvents(line.events);
      }),
    ),

  // ---- Undo/redo ----

  undo: () =>
    set(
      produce((state: ChartState) => {
        if (state._past.length === 0) return;
        state._future.push(current(state.chart));
        state._futureSeqs.push(state._pastSeqs.pop()!);
        state.chart = state._past.pop()!;
        state.isDirty = true;
      }),
    ),

  redo: () =>
    set(
      produce((state: ChartState) => {
        if (state._future.length === 0) return;
        state._past.push(current(state.chart));
        state._pastSeqs.push(state._futureSeqs.pop()!);
        state.chart = state._future.pop()!;
        state.isDirty = true;
      }),
    ),

  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,

  // ---- Derived data helpers ----

  totalNoteCount: () => {
    const { lines } = get().chart;
    return lines.reduce((sum, line) => sum + line.notes.length, 0);
  },

  totalEventCount: () => {
    const { lines } = get().chart;
    return lines.reduce((sum, line) => sum + line.events.length, 0);
  },

  getChartJson: () => JSON.stringify(get().chart),

  // Stub — no original chart snapshot for diffing yet
  getDiffSummary: () => null,

  // ---- Event layer mutations ----

  addEventToLayer: (lineIndex, layerIndex, kind, event) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || !line.event_layers) return;
        if (layerIndex < 0 || layerIndex >= line.event_layers.length) return;
        pushHistory(state);
        const events = getLayerEvents(line.event_layers[layerIndex], kind);
        events.push(event);
        sortEvents(events);
      }),
    ),

  removeEventsFromLayer: (lineIndex, layerIndex, kind, eventIndices) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || !line.event_layers) return;
        if (layerIndex < 0 || layerIndex >= line.event_layers.length) return;
        if (eventIndices.length === 0) return;
        pushHistory(state);
        const events = getLayerEvents(line.event_layers[layerIndex], kind);
        const sorted = [...eventIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          if (idx >= 0 && idx < events.length) {
            events.splice(idx, 1);
          }
        }
      }),
    ),

  editEventInLayer: (lineIndex, layerIndex, kind, eventIndex, changes) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || !line.event_layers) return;
        if (layerIndex < 0 || layerIndex >= line.event_layers.length) return;
        const events = getLayerEvents(line.event_layers[layerIndex], kind);
        if (eventIndex < 0 || eventIndex >= events.length) return;
        pushHistory(state);
        Object.assign(events[eventIndex], changes);
        sortEvents(events);
      }),
    ),

  ensureEventLayers: (lineIndex) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line) return;
        if (!line.event_layers || line.event_layers.length === 0) {
          pushHistory(state);
          line.event_layers = [createEmptyLayer()];
        }
      }),
    ),

  // Batch-add events to a specific event layer (single undo entry)
  batchAddEventsToLayer: (lineIndex, layerIndex, kind, events) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || !line.event_layers) return;
        if (layerIndex < 0 || layerIndex >= line.event_layers.length) return;
        if (events.length === 0) return;
        pushHistory(state);
        const layerEvents = getLayerEvents(line.event_layers[layerIndex], kind);
        layerEvents.push(...events);
        sortEvents(layerEvents);
      }),
    ),

  // ---- Curve note track mutations ----

  addCurveNoteTrack: (lineIndex, track) =>
    set(
      produce((state: ChartState) => {
        if (lineIndex < 0 || lineIndex >= state.chart.lines.length) return;
        pushHistory(state);
        state.chart.lines[lineIndex].curve_note_tracks.push(track);
      }),
    ),

  removeCurveNoteTrack: (lineIndex, trackIndex) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || trackIndex < 0 || trackIndex >= line.curve_note_tracks.length) return;
        pushHistory(state);
        line.curve_note_tracks.splice(trackIndex, 1);
      }),
    ),

  editCurveNoteTrack: (lineIndex, trackIndex, changes) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || trackIndex < 0 || trackIndex >= line.curve_note_tracks.length) return;
        pushHistory(state);
        Object.assign(line.curve_note_tracks[trackIndex].options, changes);
      }),
    ),

  // ---- Illustration ----

  loadIllustration: async (src) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        set({ illustrationImage: img });
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load illustration"));
      img.src = src;
    });
  },

  clearIllustration: () => set({ illustrationImage: null }),

  // ---- Line textures ----
  setLineTexture: (name, blob) =>
    set((state) => {
      const newMap = new Map(state.lineTextures);
      newMap.set(name, blob);
      return { lineTextures: newMap };
    }),

  removeLineTexture: (name) =>
    set((state) => {
      const newMap = new Map(state.lineTextures);
      newMap.delete(name);
      return { lineTextures: newMap };
    }),

  clearLineTextures: () => set({ lineTextures: new Map<string, Blob>() }),

  // ---- Extra config ----
  setExtraConfig: (config) => set({ extraConfig: config }),

  // ---- Chart font ----
  setChartFontFamily: (family) => set({ chartFontFamily: family }),
}));

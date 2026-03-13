// ============================================================
// Chart Store — Zustand + Immer
//
// Holds the chart data (lines, notes, events, BPM, offset) and
// project metadata. All mutations are tracked for undo/redo via
// a past/future snapshot stack.
//
// Usage:
//   const lines = useChartStore(s => s.chart.lines);
//   const addNote = useChartStore(s => s.addNote);
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

// ============================================================
// CONFIGURABLE: Maximum undo history depth
// ============================================================
const MAX_HISTORY = 200;

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
  if (state._past.length > MAX_HISTORY) {
    state._past.shift();
  }
  state._future = [];
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

  // ---- Project lifecycle ----
  loadFromProjectData: (data: ProjectData) => void;
  closeProject: () => void;
  markClean: () => void;

  // ---- Chart-level mutations ----
  setOffset: (offset: number) => void;
  setMeta: (changes: Partial<ProjectMeta>) => void;
  setBpmList: (bpmList: BpmPoint[]) => void;

  // ---- Line mutations ----
  addLine: (line?: Partial<Line>) => void;
  removeLine: (lineIndex: number) => void;
  duplicateLine: (lineIndex: number) => void;
  editLine: (lineIndex: number, changes: Partial<Line>) => void;
  reorderLines: (fromIndex: number, toIndex: number) => void;

  // ---- Note mutations ----
  addNote: (lineIndex: number, note: Note) => void;
  removeNotes: (lineIndex: number, noteIndices: number[]) => void;
  editNote: (lineIndex: number, noteIndex: number, changes: Partial<Note>) => void;
  editNotes: (lineIndex: number, noteIndices: number[], changes: Partial<Note>) => void;

  // ---- Batch note/event mutations (single undo entry) ----
  batchEditNotes: (lineIndex: number, edits: Array<{ noteIndex: number; changes: Partial<Note> }>) => void;
  batchEditEvents: (lineIndex: number, edits: Array<{ eventIndex: number; changes: Partial<LineEvent> }>) => void;

  /** Atomically apply mutations across multiple lines as a single undo entry (used by group batch operations) */
  batchMultiLineMutations: (mutations: Array<{
    lineIndex: number;
    noteEdits?: Array<{ noteIndex: number; changes: Partial<Note> }>;
    eventEdits?: Array<{ eventIndex: number; changes: Partial<LineEvent> }>;
    newEvents?: LineEvent[];
    removeEventIndices?: number[];
  }>) => void;

  // ---- Event mutations ----
  addEvent: (lineIndex: number, event: LineEvent) => void;
  removeEvents: (lineIndex: number, eventIndices: number[]) => void;
  editEvent: (lineIndex: number, eventIndex: number, changes: Partial<LineEvent>) => void;
  /** Atomically replace one event with one or more new events (single undo entry) */
  replaceEvent: (lineIndex: number, oldEventIndex: number, newEvents: LineEvent[]) => void;

  // ---- Event layer mutations ----
  addEventToLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, event: LineEvent) => void;
  removeEventsFromLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, eventIndices: number[]) => void;
  editEventInLayer: (lineIndex: number, layerIndex: number, kind: LineEventKind, eventIndex: number, changes: Partial<LineEvent>) => void;
  ensureEventLayers: (lineIndex: number) => void;

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
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- Derived data helpers ----
  totalNoteCount: () => number;
  totalEventCount: () => number;
  getChartJson: () => string;
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
      lineTextures: new Map<string, Blob>(),
      chartFontFamily: null,
    });
  },

  closeProject: () =>
    set({
      projectPath: null,
      musicPath: null,
      illustrationPath: null,
      meta: { ...DEFAULT_META },
      chart: structuredClone(DEFAULT_CHART),
      isDirty: false,
      isLoaded: false,
      _past: [],
      _future: [],
      lineTextures: new Map<string, Blob>(),
      chartFontFamily: null,
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
        Object.assign(state.meta, changes);
        state.isDirty = true;
      }),
    ),

  setBpmList: (bpmList) =>
    set(
      produce((state: ChartState) => {
        pushHistory(state);
        state.chart.bpm_list = bpmList;
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
        sortNotes(line.notes);
      }),
    ),

  // ---- Batch note/event mutations ----

  batchEditNotes: (lineIndex, edits) =>
    set(
      produce((state: ChartState) => {
        const line = state.chart.lines[lineIndex];
        if (!line || edits.length === 0) return;
        pushHistory(state);
        for (const { noteIndex, changes } of edits) {
          if (noteIndex >= 0 && noteIndex < line.notes.length) {
            Object.assign(line.notes[noteIndex], changes);
          }
        }
        sortNotes(line.notes);
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
        state.chart = state._past.pop()!;
        state.isDirty = true;
      }),
    ),

  redo: () =>
    set(
      produce((state: ChartState) => {
        if (state._future.length === 0) return;
        state._past.push(current(state.chart));
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

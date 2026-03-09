// ============================================================
// Editor Store — Zustand
//
// UI-only state: selection, active tool, timeline settings.
// None of this is persisted to disk (that's settingsStore).
//
// Usage:
//   const tool = useEditorStore(s => s.activeTool);
//   const selectLine = useEditorStore(s => s.selectLine);
// ============================================================

import { create } from "zustand";
import type { EditorTool, NoteSideFilter } from "../types/editor";
import type { Beat, NoteKind, LineEventKind } from "../types/chart";

export interface DragSelectionRect {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface PendingNote {
  beat: Beat;
  x: number;
  kind: NoteKind;
}

export interface EditorState {
  // ---- Selection ----
  selectedLineIndex: number | null;
  selectedNoteIndices: number[];
  selectedEventIndices: number[];

  // ---- Tool ----
  activeTool: EditorTool;

  // ---- Timeline settings ----
  timelineZoom: number;
  density: number; // Beat grid subdivision (e.g., 4 = quarter-beat grid)
  lanes: number; // Number of vertical lane guides
  noteSideFilter: NoteSideFilter;
  showSpectrogram: boolean;
  spectrogramOpacity: number;

  // ---- Drag selection ----
  dragSelectionRect: DragSelectionRect | null;

  // ---- Hold note resize ----
  holdResizeState: { noteIndex: number; handle: "head" | "tail" } | null;

  // ---- Pending/ghost note ----
  pendingNote: PendingNote | null;

  // ---- Curve note track creation ----
  curveTrackCreation: { fromNoteIndex: number } | null;

  // ---- FC/AP tracking ----
  isFcValid: boolean;

  // ---- Line Event Editor state ----
  eventEditorCurrentBeat: number;
  eventEditorShowAllLines: boolean;
  eventEditorShowNotes: boolean;
  eventEditorActiveProperty: LineEventKind;
  eventEditorDragState: {
    isDragging: boolean;
    dragType: "translate" | "rotate" | null;
    startMouseX: number;
    startMouseY: number;
    startValue: { x: number; y: number; rotation: number };
  } | null;

  // ---- Selection actions ----
  selectLine: (index: number | null) => void;
  setNoteSelection: (indices: number[]) => void;
  toggleNoteSelection: (index: number) => void;
  setEventSelection: (indices: number[]) => void;
  toggleEventSelection: (index: number) => void;
  clearSelection: () => void;

  // ---- Tool actions ----
  setTool: (tool: EditorTool) => void;

  // ---- Timeline actions ----
  setTimelineZoom: (zoom: number) => void;
  setDensity: (density: number) => void;
  setLanes: (lanes: number) => void;
  setNoteSideFilter: (filter: NoteSideFilter) => void;
  setShowSpectrogram: (show: boolean) => void;
  setSpectrogramOpacity: (opacity: number) => void;

  // ---- Drag selection actions ----
  setDragSelectionRect: (rect: DragSelectionRect | null) => void;

  // ---- Hold resize actions ----
  setHoldResizeState: (state: { noteIndex: number; handle: "head" | "tail" } | null) => void;

  // ---- Pending note actions ----
  setPendingNote: (note: PendingNote | null) => void;

  // ---- Curve track creation actions ----
  setCurveTrackCreation: (state: { fromNoteIndex: number } | null) => void;

  // ---- FC/AP actions ----
  setFcValid: (valid: boolean) => void;
  resetFcValid: () => void;

  // ---- Line Event Editor actions ----
  setEventEditorBeat: (beat: number) => void;
  toggleEventEditorShowAllLines: () => void;
  toggleEventEditorShowNotes: () => void;
  setEventEditorActiveProperty: (prop: LineEventKind) => void;
  setEventEditorDragState: (state: EditorState["eventEditorDragState"]) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  // ---- Initial state ----
  selectedLineIndex: null,
  selectedNoteIndices: [],
  selectedEventIndices: [],
  activeTool: "select",
  timelineZoom: 1.0,
  density: 4,
  lanes: 9,
  noteSideFilter: "all",
  showSpectrogram: false,
  spectrogramOpacity: 0.5,
  dragSelectionRect: null,
  holdResizeState: null,
  pendingNote: null,
  curveTrackCreation: null,
  isFcValid: true,
  eventEditorCurrentBeat: 0,
  eventEditorShowAllLines: false,
  eventEditorShowNotes: false,
  eventEditorActiveProperty: "x",
  eventEditorDragState: null,

  // ---- Selection ----

  selectLine: (index) =>
    set({
      selectedLineIndex: index,
      selectedNoteIndices: [],
      selectedEventIndices: [],
    }),

  setNoteSelection: (indices) =>
    set({ selectedNoteIndices: indices, selectedEventIndices: [] }),

  toggleNoteSelection: (index) =>
    set((state) => {
      const existing = state.selectedNoteIndices;
      const pos = existing.indexOf(index);
      if (pos >= 0) {
        return {
          selectedNoteIndices: existing.filter((_, i) => i !== pos),
          selectedEventIndices: [],
        };
      }
      return {
        selectedNoteIndices: [...existing, index],
        selectedEventIndices: [],
      };
    }),

  setEventSelection: (indices) =>
    set({ selectedEventIndices: indices, selectedNoteIndices: [] }),

  toggleEventSelection: (index) =>
    set((state) => {
      const existing = state.selectedEventIndices;
      const pos = existing.indexOf(index);
      if (pos >= 0) {
        return {
          selectedEventIndices: existing.filter((_, i) => i !== pos),
          selectedNoteIndices: [],
        };
      }
      return {
        selectedEventIndices: [...existing, index],
        selectedNoteIndices: [],
      };
    }),

  clearSelection: () =>
    set({ selectedNoteIndices: [], selectedEventIndices: [] }),

  // ---- Tool ----

  setTool: (tool) => set({ activeTool: tool }),

  // ---- Timeline ----

  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.max(0.1, Math.min(10, zoom)) }),

  setDensity: (density) =>
    set({ density: Math.max(1, Math.min(32, density)) }),

  setLanes: (lanes) =>
    set({ lanes: Math.max(1, Math.min(32, lanes)) }),

  setNoteSideFilter: (filter) => set({ noteSideFilter: filter }),

  setShowSpectrogram: (show) => set({ showSpectrogram: show }),

  setSpectrogramOpacity: (opacity) =>
    set({ spectrogramOpacity: Math.max(0, Math.min(1, opacity)) }),

  // ---- Drag selection ----
  setDragSelectionRect: (rect) => set({ dragSelectionRect: rect }),

  // ---- Hold resize ----
  setHoldResizeState: (state) => set({ holdResizeState: state }),

  // ---- Pending note ----
  setPendingNote: (note) => set({ pendingNote: note }),

  // ---- Curve track creation ----
  setCurveTrackCreation: (state) => set({ curveTrackCreation: state }),

  // ---- FC/AP ----
  setFcValid: (valid) => set({ isFcValid: valid }),
  resetFcValid: () => set({ isFcValid: true }),

  // ---- Line Event Editor ----
  setEventEditorBeat: (beat) => set({ eventEditorCurrentBeat: Math.max(0, beat) }),
  toggleEventEditorShowAllLines: () => set((s) => ({ eventEditorShowAllLines: !s.eventEditorShowAllLines })),
  toggleEventEditorShowNotes: () => set((s) => ({ eventEditorShowNotes: !s.eventEditorShowNotes })),
  setEventEditorActiveProperty: (prop) => set({ eventEditorActiveProperty: prop }),
  setEventEditorDragState: (state) => set({ eventEditorDragState: state }),
}));

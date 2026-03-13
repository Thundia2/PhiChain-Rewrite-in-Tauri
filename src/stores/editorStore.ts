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
import type { EditorTool, NoteSideFilter, LineSortMode, PanelId } from "../types/editor";
import type { Beat, NoteKind, LineEventKind } from "../types/chart";

export interface DragSelectionRect {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface PendingNote {
  beat: Beat;
  x: number;
  kind: NoteKind;
  above: boolean;
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

  // ---- Line list sort ----
  lineSortMode: LineSortMode;

  // ---- Line Event Editor state ----
  eventEditorCurrentBeat: number;
  eventEditorShowAllLines: boolean;
  eventEditorShowNotes: boolean;
  eventEditorActiveProperty: LineEventKind;
  eventEditorActiveLayer: number; // 0-4 for event layers, -1 for flat events
  eventEditorDragState: {
    isDragging: boolean;
    dragType: "translate" | "rotate" | null;
    startMouseX: number;
    startMouseY: number;
    startValue: { x: number; y: number; rotation: number };
  } | null;

  // ---- Beat-sync placement ----
  beatSyncPlacement: boolean;

  // ---- Improvisation mode ----
  improvisationMode: boolean;
  improvisationNoteKind: NoteKind;

  // ---- Multi-line selection (batch editing) ----
  multiSelectedLineIndices: number[];

  // ---- Unified Canvas state ----
  canvasInteractionMode:
    | "idle"
    | "dragging_translate"
    | "dragging_rotate"
    | "placing_note"
    | "drag_selecting"
    | "dragging_note"
    | "panning";
  canvasViewport: {
    offsetX: number;
    offsetY: number;
    zoom: number;
  };
  lineVisibility: Record<number, boolean>;
  lineLocked: Record<number, boolean>;
  lineDrawerOpen: boolean;
  unifiedInspectorOpen: boolean;
  canvasActivePanelId: PanelId | null;  // Active bottom panel in canvas mode
  canvasPanelHeight: number;            // Height of the bottom panel drawer
  keyframeBarOpen: boolean;
  keyframeBarHeight: number;            // 50-200px range, default 90

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

  // ---- Line list sort actions ----
  setLineSortMode: (mode: LineSortMode) => void;

  // ---- Line Event Editor actions ----
  setEventEditorBeat: (beat: number) => void;
  toggleEventEditorShowAllLines: () => void;
  toggleEventEditorShowNotes: () => void;
  setEventEditorActiveProperty: (prop: LineEventKind) => void;
  setEventEditorActiveLayer: (layer: number) => void;
  setEventEditorDragState: (state: EditorState["eventEditorDragState"]) => void;

  // ---- Beat-sync placement actions ----
  toggleBeatSyncPlacement: () => void;

  // ---- Improvisation mode actions ----
  toggleImprovisationMode: () => void;
  setImprovisationNoteKind: (kind: NoteKind) => void;

  // ---- Multi-line selection actions ----
  setMultiSelectedLines: (indices: number[]) => void;
  toggleMultiSelectedLine: (index: number) => void;
  clearMultiSelectedLines: () => void;

  // ---- Unified Canvas actions ----
  setCanvasInteractionMode: (mode: EditorState["canvasInteractionMode"]) => void;
  setCanvasViewport: (viewport: Partial<EditorState["canvasViewport"]>) => void;
  resetCanvasViewport: () => void;
  toggleLineVisibility: (index: number) => void;
  toggleLineLocked: (index: number) => void;
  toggleLineDrawer: () => void;
  toggleUnifiedInspector: () => void;
  setCanvasActivePanel: (panelId: PanelId | null) => void;
  toggleCanvasPanel: (panelId: PanelId) => void;
  setCanvasPanelHeight: (height: number) => void;
  toggleKeyframeBar: () => void;
  setKeyframeBarHeight: (height: number) => void;
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
  lineSortMode: "chart_order",
  eventEditorCurrentBeat: 0,
  eventEditorShowAllLines: false,
  eventEditorShowNotes: false,
  eventEditorActiveProperty: "x",
  eventEditorActiveLayer: -1, // -1 = flat events (non-layered)
  eventEditorDragState: null,

  // ---- Beat-sync placement ----
  beatSyncPlacement: false,

  // ---- Improvisation mode ----
  improvisationMode: false,
  improvisationNoteKind: "tap",

  // ---- Multi-line selection ----
  multiSelectedLineIndices: [],

  // ---- Unified Canvas ----
  canvasInteractionMode: "idle",
  canvasViewport: { offsetX: 0, offsetY: 0, zoom: 1.0 },
  lineVisibility: {},
  lineLocked: {},
  lineDrawerOpen: false,
  unifiedInspectorOpen: true,
  canvasActivePanelId: null,
  canvasPanelHeight: 250,
  keyframeBarOpen: true,
  keyframeBarHeight: 90,

  // ---- Selection ----

  selectLine: (index) =>
    set({
      selectedLineIndex: index,
      selectedNoteIndices: [],
      selectedEventIndices: [],
      multiSelectedLineIndices: [],
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

  // ---- Line list sort ----
  setLineSortMode: (mode) => set({ lineSortMode: mode }),

  // ---- Line Event Editor ----
  setEventEditorBeat: (beat) => set({ eventEditorCurrentBeat: Math.max(0, beat) }),
  toggleEventEditorShowAllLines: () => set((s) => ({ eventEditorShowAllLines: !s.eventEditorShowAllLines })),
  toggleEventEditorShowNotes: () => set((s) => ({ eventEditorShowNotes: !s.eventEditorShowNotes })),
  setEventEditorActiveProperty: (prop) => set({ eventEditorActiveProperty: prop }),
  setEventEditorActiveLayer: (layer) => set({ eventEditorActiveLayer: Math.max(-1, Math.min(4, layer)) }),
  setEventEditorDragState: (state) => set({ eventEditorDragState: state }),

  // ---- Beat-sync placement ----
  toggleBeatSyncPlacement: () => set((s) => ({ beatSyncPlacement: !s.beatSyncPlacement })),

  // ---- Improvisation mode ----
  toggleImprovisationMode: () => set((s) => ({ improvisationMode: !s.improvisationMode })),
  setImprovisationNoteKind: (kind) => set({ improvisationNoteKind: kind }),

  // ---- Multi-line selection ----
  setMultiSelectedLines: (indices) => set({ multiSelectedLineIndices: indices }),
  toggleMultiSelectedLine: (index) =>
    set((state) => {
      const existing = state.multiSelectedLineIndices;
      const pos = existing.indexOf(index);
      if (pos >= 0) {
        return { multiSelectedLineIndices: existing.filter((_, i) => i !== pos) };
      }
      return { multiSelectedLineIndices: [...existing, index] };
    }),
  clearMultiSelectedLines: () => set({ multiSelectedLineIndices: [] }),

  // ---- Unified Canvas ----
  setCanvasInteractionMode: (mode) => set({ canvasInteractionMode: mode }),
  setCanvasViewport: (viewport) => set((s) => ({
    canvasViewport: { ...s.canvasViewport, ...viewport },
  })),
  resetCanvasViewport: () => set({ canvasViewport: { offsetX: 0, offsetY: 0, zoom: 1.0 } }),
  toggleLineVisibility: (index) => set((s) => ({
    lineVisibility: { ...s.lineVisibility, [index]: !(s.lineVisibility[index] ?? true) },
  })),
  toggleLineLocked: (index) => set((s) => ({
    lineLocked: { ...s.lineLocked, [index]: !s.lineLocked[index] },
  })),
  toggleLineDrawer: () => set((s) => ({ lineDrawerOpen: !s.lineDrawerOpen })),
  toggleUnifiedInspector: () => set((s) => ({ unifiedInspectorOpen: !s.unifiedInspectorOpen })),
  setCanvasActivePanel: (panelId) => set({ canvasActivePanelId: panelId }),
  toggleCanvasPanel: (panelId) => set((s) => ({
    canvasActivePanelId: s.canvasActivePanelId === panelId ? null : panelId,
  })),
  setCanvasPanelHeight: (height) => set({ canvasPanelHeight: Math.max(100, Math.min(600, height)) }),
  toggleKeyframeBar: () => set((s) => ({ keyframeBarOpen: !s.keyframeBarOpen })),
  setKeyframeBarHeight: (height) => set({ keyframeBarHeight: Math.max(50, Math.min(200, height)) }),
}));

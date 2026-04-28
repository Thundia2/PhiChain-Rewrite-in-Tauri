// ============================================================
// Editor Store — Zustand
//
// UI-only state: selection, active tool, timeline settings.
// None of this is persisted to disk (that's settingsStore).
//
// Usage:
//   const tool = useEditorStore(s => s.activeTool);
//   const selectLine = useEditorStore(s => s.selectLine);
//
// Recent change: Added onset detection volatile state — onsetMarkers
// array and onsetAnalyzing flag for spectral flux onset detection.
// ============================================================

import { create } from "zustand";
import type { EditorTool, NoteSideFilter, LineSortMode, PanelId } from "../types/editor";
import type { Beat, NoteKind, LineEventKind } from "../types/chart";
import { beatToFloat } from "../types/chart";
import { snapBeat } from "../utils/beat";

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

/**
 * Tri-state visibility toggle for unrolled-editor layers.
 *  - "all":   render normally and allow editing/hit-testing
 *  - "ghost": render dim (globalAlpha = 0.3 in the renderer) and skip
 *             all hit-tests so the user can use the layer as visual
 *             reference without misclicking onto it
 *  - "none":  do not render and do not hit-test
 *
 * The dimming is applied via canvas globalAlpha, intentionally separate
 * from `Note.alpha` (which is the gameplay tint, 0-255). Editor display
 * never reads `note.alpha` — see canvas/unrolledRenderer.ts drawNote.
 */
export type LayerVisibility = "all" | "ghost" | "none";

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
  verticalLines: number; // Number of vertical grid lines (RPE convention: N = line count, not division count)
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

  // ---- X Snap Grid ----
  xSnapEnabled: boolean; // When true, note placement snaps to lane boundaries

  // ---- Improvisation mode ----
  improvisationMode: boolean;

  // ---- Multi-line selection (batch editing) ----
  multiSelectedLineIndices: number[];

  // ---- Curve Editor state ----
  curveEditorExpanded: boolean;
  curveEditorHeight: number;
  curveEditorVisibleLanes: LineEventKind[];
  curveEditorPoppedOut: boolean;
  curveEditorValueRange: { min: number; max: number } | null;
  curveEditorNormalized: boolean;
  curveEditorHoveredKeyframe: {
    eventIndex: number;
    kind: LineEventKind;
    handle: "start" | "end";
  } | null;
  curveEditorDragState: {
    eventIndex: number;
    kind: LineEventKind;
    handle: "start" | "end";
    startMouseX: number;
    startMouseY: number;
    startBeat: number;
    startValue: number;
  } | null;

  // ---- Record Mode ----
  recordMode: boolean;
  recordModeChannels: { x: boolean; y: boolean; rotation: boolean };
  recordedKeyframes: Array<{
    beat: number;
    x?: number;
    y?: number;
    rotation?: number;
  }>;

  // ---- Step Recording Mode ----
  stepRecordActive: boolean;
  stepRecordCurrentBeat: number;  // Float beat that auto-advances
  stepRecordNoteKind: NoteKind;   // What type of note to place (default: tap)
  stepRecordStepSize: number;     // Beats per step — independent of density
  stepRecordNotesPlaced: number;  // Counter for status display
  stepRecordMouseDown: boolean;   // True while mouse button is held (for hold-to-stream)
  stepRecordLastSnapX: number | null; // Last snap X where a note was placed during drag

  // ---- Unrolled Canvas state ----
  unrolledScrollBeat: number;          // Beat at the bottom of the viewport (default 0)
  showMiniPreview: boolean;            // Show the mini game preview inset (default true)
  /** Note layer visibility in the unrolled canvas (default "all"). See LayerVisibility. */
  unrolledNoteVisibility: LayerVisibility;
  /** Event layer visibility in the unrolled canvas (default "all"). See LayerVisibility. */
  unrolledEventVisibility: LayerVisibility;

  // ---- Per-line unrolled editor tab state ----
  lineTabScrollBeats: Record<number, number>;     // lineIndex -> scrollBeat for per-line tabs
  unrolledFollowPlayback: Record<string, boolean>; // tabKey -> follow flag ("main" or lineIndex string)

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
  onDemandOverlayPanelId: PanelId | null; // On-demand panel overlaying the drawer
  keyframeBarOpen: boolean;
  keyframeBarHeight: number;            // 50-200px range, default 90

  // ---- LineStrip filter ----
  lineStripSearchQuery: string;
  lineStripSearchOpen: boolean;
  lineStripCategoryFilter: string[] | null; // null = show all

  // ---- Timeline overlay ----
  timelineOverlayLines: number[];
  timelineOverlayEnabled: boolean;
  timelineOverlayOpacity: number;

  // ---- Floating inspector ----
  floatingInspector: {
    screenX: number;
    screenY: number;
    targetType: "note" | "event" | "multi_note" | "multi_event";
  } | null;

  // ---- Onset Detection (volatile per-session state) ----
  /** Detected onset markers converted to beat positions (null = not yet analyzed) */
  onsetMarkers: { beat: number; strength: number }[] | null;
  /** Whether onset analysis is currently running */
  onsetAnalyzing: boolean;

  // ---- DevTools ----
  devToolsOpen: boolean;

  // ---- Validation ----
  validationIssues: Array<{ severity: string; message: string; lineIndex?: number; noteIndex?: number; eventIndex?: number }>;

  // ---- Pattern tool ghost notes + config ----
  patternGhostNotes: Array<{ x: number; beat: number; kind: string; above: boolean }>;
  setPatternGhostNotes: (notes: Array<{ x: number; beat: number; kind: string; above: boolean }>) => void;
  patternConfig: {
    shape: string; noteCount: number; startX: number; endX: number;
    noteKind: string; above: boolean; cycles: number; amplitude: number;
    stairWidth: number; arcHeight: number; expression: string;
  };
  setPatternConfig: (config: Partial<EditorState["patternConfig"]>) => void;

  // ---- Selection actions ----
  /** Select a line by index. Clears note/event selection. Pass null to deselect. */
  selectLine: (index: number | null) => void;
  /** Replace the note selection with the given indices. */
  setNoteSelection: (indices: number[]) => void;
  /** Toggle a note index in/out of the current selection. */
  toggleNoteSelection: (index: number) => void;
  /** Replace the event selection with the given indices. Switches panel to EventMode. */
  setEventSelection: (indices: number[]) => void;
  /** Toggle an event index in/out of the current selection. */
  toggleEventSelection: (index: number) => void;
  /** Clear all note and event selections. */
  clearSelection: () => void;

  // ---- Tool actions ----
  /** Set the active editor tool. Clears pending note and pattern ghosts. */
  setTool: (tool: EditorTool) => void;

  // ---- Timeline actions ----
  setTimelineZoom: (zoom: number) => void;
  setDensity: (density: number) => void;
  setVerticalLines: (n: number) => void;
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

  // ---- X Snap actions ----
  toggleXSnap: () => void;

  // ---- Improvisation mode actions ----
  toggleImprovisationMode: () => void;

  // ---- Multi-line selection actions ----
  setMultiSelectedLines: (indices: number[]) => void;
  toggleMultiSelectedLine: (index: number) => void;
  clearMultiSelectedLines: () => void;

  // ---- Curve Editor actions ----
  toggleCurveEditorExpanded: () => void;
  setCurveEditorHeight: (height: number) => void;
  setCurveEditorVisibleLanes: (lanes: LineEventKind[]) => void;
  toggleCurveEditorLane: (lane: LineEventKind) => void;
  setCurveEditorPoppedOut: (poppedOut: boolean) => void;
  setCurveEditorValueRange: (range: { min: number; max: number } | null) => void;
  toggleCurveEditorNormalized: () => void;
  setCurveEditorHoveredKeyframe: (kf: EditorState["curveEditorHoveredKeyframe"]) => void;
  setCurveEditorDragState: (state: EditorState["curveEditorDragState"]) => void;

  // ---- Record Mode actions ----
  /** Toggle record mode. When active, line drags during playback capture keyframes. */
  toggleRecordMode: () => void;
  /** Set which channels (x, y, rotation) are recorded during record mode. */
  setRecordModeChannels: (channels: Partial<EditorState["recordModeChannels"]>) => void;
  /** Append a keyframe captured during record-mode playback. */
  addRecordedKeyframe: (kf: { beat: number; x?: number; y?: number; rotation?: number }) => void;
  /** Discard all recorded keyframes without committing them. */
  clearRecordedKeyframes: () => void;

  // ---- Step Recording actions ----
  /** Toggle step recording mode. Initializes stepBeat from audio position on enter. */
  toggleStepRecord: () => void;
  /** Exit step recording mode and clear step state. */
  exitStepRecord: () => void;
  /** Set which note kind is placed during step recording. */
  setStepRecordNoteKind: (kind: NoteKind) => void;
  /** Set the beat step size (denominator). Affects advanceStepBeat/rewindStepBeat. */
  setStepRecordStepSize: (size: number) => void;
  /** Halve the step size (e.g. 1/4 -> 1/8). Clamped to min 1/64. */
  halveStepSize: () => void;
  /** Double the step size (e.g. 1/8 -> 1/4). Clamped to max 4. */
  doubleStepSize: () => void;
  /** Move the step cursor forward by one step size. */
  advanceStepBeat: () => void;
  /** Move the step cursor backward by one step size. */
  rewindStepBeat: () => void;
  setStepRecordMouseDown: (down: boolean) => void;
  setStepRecordLastSnapX: (x: number | null) => void;

  // ---- Unrolled Canvas actions ----
  setUnrolledScrollBeat: (beat: number) => void;
  toggleMiniPreview: () => void;
  setUnrolledNoteVisibility: (v: LayerVisibility) => void;
  setUnrolledEventVisibility: (v: LayerVisibility) => void;

  // ---- Per-line unrolled tab actions ----
  setLineTabScrollBeat: (lineIndex: number, beat: number) => void;
  clearLineTabScrollBeat: (lineIndex: number) => void;
  setUnrolledFollowPlayback: (tabKey: string, follow: boolean) => void;
  clearUnrolledFollowPlayback: (tabKey: string) => void;

  // ---- Unified Canvas actions ----
  setCanvasInteractionMode: (mode: EditorState["canvasInteractionMode"]) => void;
  setCanvasViewport: (viewport: Partial<EditorState["canvasViewport"]>) => void;
  resetCanvasViewport: () => void;
  toggleLineVisibility: (index: number) => void;
  toggleLineLocked: (index: number) => void;
  toggleLineDrawer: () => void;
  toggleUnifiedInspector: () => void;
  // ---- Timeline overlay actions ----
  setTimelineOverlayLines: (indices: number[]) => void;
  toggleTimelineOverlayLine: (index: number) => void;
  toggleTimelineOverlay: () => void;
  setTimelineOverlayOpacity: (opacity: number) => void;

  // ---- Floating inspector actions ----
  showFloatingInspector: (screenX: number, screenY: number,
    targetType: "note" | "event" | "multi_note" | "multi_event") => void;
  hideFloatingInspector: () => void;

  // ---- Onset Detection actions ----
  setOnsetMarkers: (markers: { beat: number; strength: number }[] | null) => void;
  setOnsetAnalyzing: (analyzing: boolean) => void;

  // ---- DevTools actions ----
  toggleDevTools: () => void;

  // ---- Validation actions ----
  setValidationIssues: (issues: EditorState["validationIssues"]) => void;

  // ---- LineStrip filter actions ----
  setLineStripSearch: (query: string) => void;
  toggleLineStripSearch: () => void;
  setLineStripCategoryFilter: (filter: string[] | null) => void;
  toggleLineStripCategory: (category: string) => void;

  setCanvasActivePanel: (panelId: PanelId | null) => void;
  toggleCanvasPanel: (panelId: PanelId) => void;
  setOnDemandOverlay: (panelId: PanelId | null) => void;
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
  verticalLines: 21,
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

  // ---- X Snap Grid ----
  xSnapEnabled: false,

  // ---- Improvisation mode ----
  improvisationMode: false,

  // ---- Multi-line selection ----
  multiSelectedLineIndices: [],

  // ---- Curve Editor ----
  curveEditorExpanded: false,
  curveEditorHeight: 250,
  curveEditorVisibleLanes: ["x", "y", "rotation", "opacity", "speed"] as LineEventKind[],
  curveEditorPoppedOut: false,
  curveEditorValueRange: null,
  curveEditorNormalized: false,
  curveEditorHoveredKeyframe: null,
  curveEditorDragState: null,

  // ---- Record Mode ----
  recordMode: false,
  recordModeChannels: { x: true, y: true, rotation: false },
  recordedKeyframes: [],

  // ---- Step Recording ----
  stepRecordActive: false,
  stepRecordCurrentBeat: 0,
  stepRecordNoteKind: "tap" as NoteKind,
  stepRecordStepSize: 0.25,
  stepRecordNotesPlaced: 0,
  stepRecordMouseDown: false,
  stepRecordLastSnapX: null,

  // ---- Timeline overlay ----
  timelineOverlayLines: [],
  timelineOverlayEnabled: false,
  timelineOverlayOpacity: 0.3,

  // ---- Floating inspector ----
  floatingInspector: null,

  // ---- Onset Detection ----
  onsetMarkers: null,
  onsetAnalyzing: false,

  // ---- DevTools ----
  devToolsOpen: false,

  // ---- Validation ----
  validationIssues: [],

  // ---- Pattern tool ghost notes + config ----
  patternGhostNotes: [],
  patternConfig: {
    shape: "linear", noteCount: 16, startX: -300, endX: 300,
    noteKind: "drag", above: true, cycles: 2, amplitude: 300,
    stairWidth: 4, arcHeight: 200, expression: "300*sin(2*pi*t)",
  },

  // ---- LineStrip filter ----
  lineStripSearchQuery: "",
  lineStripSearchOpen: false,
  lineStripCategoryFilter: null,

  // ---- Unrolled Canvas ----
  unrolledScrollBeat: 0,
  showMiniPreview: true,
  unrolledNoteVisibility: "all",
  unrolledEventVisibility: "all",

  // ---- Per-line unrolled tab ----
  lineTabScrollBeats: {},
  unrolledFollowPlayback: {},

  // ---- Unified Canvas ----
  canvasInteractionMode: "idle",
  canvasViewport: { offsetX: 0, offsetY: 0, zoom: 1.0 },
  lineVisibility: {},
  lineLocked: {},
  lineDrawerOpen: false,
  unifiedInspectorOpen: false,
  canvasActivePanelId: null,
  canvasPanelHeight: 250,
  onDemandOverlayPanelId: null,
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

  setVerticalLines: (n) =>
    set({ verticalLines: Math.max(2, Math.min(256, n)) }),

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

  // ---- X Snap Grid ----
  toggleXSnap: () => set((s) => ({ xSnapEnabled: !s.xSnapEnabled })),

  // ---- Improvisation mode ----
  toggleImprovisationMode: () => set((s) => ({
    improvisationMode: !s.improvisationMode,
  })),

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

  // ---- Curve Editor ----
  toggleCurveEditorExpanded: () => set((s) => ({ curveEditorExpanded: !s.curveEditorExpanded })),
  setCurveEditorHeight: (height) => set({ curveEditorHeight: Math.max(150, Math.min(500, height)) }),
  setCurveEditorVisibleLanes: (lanes) => set({ curveEditorVisibleLanes: lanes }),
  toggleCurveEditorLane: (lane) => set((s) => {
    const lanes = s.curveEditorVisibleLanes;
    if (lanes.includes(lane)) {
      return { curveEditorVisibleLanes: lanes.filter((l) => l !== lane) };
    }
    return { curveEditorVisibleLanes: [...lanes, lane] };
  }),
  setCurveEditorPoppedOut: (poppedOut) => set({ curveEditorPoppedOut: poppedOut }),
  setCurveEditorValueRange: (range) => set({ curveEditorValueRange: range }),
  toggleCurveEditorNormalized: () => set((s) => ({ curveEditorNormalized: !s.curveEditorNormalized })),
  setCurveEditorHoveredKeyframe: (kf) => set({ curveEditorHoveredKeyframe: kf }),
  setCurveEditorDragState: (state) => set({ curveEditorDragState: state }),

  // ---- Record Mode ----
  toggleRecordMode: () => set((s) => ({ recordMode: !s.recordMode, recordedKeyframes: s.recordMode ? s.recordedKeyframes : [] })),
  setRecordModeChannels: (channels) => set((s) => ({ recordModeChannels: { ...s.recordModeChannels, ...channels } })),
  addRecordedKeyframe: (kf) => set((s) => ({ recordedKeyframes: [...s.recordedKeyframes, kf] })),
  clearRecordedKeyframes: () => set({ recordedKeyframes: [], recordMode: false }),

  // ---- Step Recording ----
  toggleStepRecord: () => set((s) => {
    if (s.stepRecordActive) {
      // Deactivating — reset
      return { stepRecordActive: false, stepRecordNotesPlaced: 0 };
    }
    // Activating — set current beat from playhead position.
    // Import audio/chart stores lazily to avoid circular dependency issues
    // at module load time. These stores exist at runtime.
    const { useAudioStore } = require("./audioStore");
    const { useChartStore, getCachedBpmList } = require("./chartStore");
    const as_ = useAudioStore.getState();
    const cs = useChartStore.getState();
    const bpmList = getCachedBpmList();
    const currentBeat = bpmList.beatAtFloat(as_.currentTime - cs.chart.offset);
    const snapped = beatToFloat(snapBeat(currentBeat, s.density));
    return {
      stepRecordActive: true,
      stepRecordCurrentBeat: snapped,
      stepRecordStepSize: 1 / s.density,
      stepRecordNotesPlaced: 0,
      // Inherit current tool's note kind, default to tap
      stepRecordNoteKind: (s.activeTool.startsWith("place_")
        ? s.activeTool.replace("place_", "") as NoteKind
        : "tap"),
    };
  }),

  exitStepRecord: () => set({
    stepRecordActive: false,
    stepRecordNotesPlaced: 0,
    stepRecordMouseDown: false,
    stepRecordLastSnapX: null,
  }),

  setStepRecordNoteKind: (kind) => set({ stepRecordNoteKind: kind }),

  setStepRecordStepSize: (size) => set({
    stepRecordStepSize: Math.max(1 / 32, Math.min(4, size)),
  }),

  // Halve step size (e.g., 1/4 → 1/8). Floors at 1/32.
  halveStepSize: () => set((s) => ({
    stepRecordStepSize: Math.max(1 / 32, s.stepRecordStepSize / 2),
  })),

  // Double step size (e.g., 1/8 → 1/4). Caps at 4.
  doubleStepSize: () => set((s) => ({
    stepRecordStepSize: Math.min(4, s.stepRecordStepSize * 2),
  })),

  advanceStepBeat: () => set((s) => ({
    stepRecordCurrentBeat: s.stepRecordCurrentBeat + s.stepRecordStepSize,
    stepRecordNotesPlaced: s.stepRecordNotesPlaced + 1,
  })),

  rewindStepBeat: () => set((s) => ({
    stepRecordCurrentBeat: Math.max(0, s.stepRecordCurrentBeat - s.stepRecordStepSize),
    stepRecordNotesPlaced: Math.max(0, s.stepRecordNotesPlaced - 1),
  })),

  setStepRecordMouseDown: (down) => set({
    stepRecordMouseDown: down,
    // Reset last snap X when mouse is released
    ...(down ? {} : { stepRecordLastSnapX: null }),
  }),

  setStepRecordLastSnapX: (x) => set({ stepRecordLastSnapX: x }),

  // ---- Timeline overlay ----
  setTimelineOverlayLines: (indices) => set({ timelineOverlayLines: indices }),
  toggleTimelineOverlayLine: (index) => set((s) => {
    const lines = s.timelineOverlayLines;
    if (lines.includes(index)) {
      return { timelineOverlayLines: lines.filter((i) => i !== index) };
    }
    return { timelineOverlayLines: [...lines, index] };
  }),
  toggleTimelineOverlay: () => set((s) => ({ timelineOverlayEnabled: !s.timelineOverlayEnabled })),
  setTimelineOverlayOpacity: (opacity) => set({ timelineOverlayOpacity: Math.max(0, Math.min(1, opacity)) }),

  // ---- Floating inspector ----
  showFloatingInspector: (screenX, screenY, targetType) => set({
    floatingInspector: { screenX, screenY, targetType },
  }),
  hideFloatingInspector: () => set({ floatingInspector: null }),

  // ---- Onset Detection ----
  setOnsetMarkers: (markers) => set({ onsetMarkers: markers }),
  setOnsetAnalyzing: (analyzing) => set({ onsetAnalyzing: analyzing }),

  // ---- DevTools ----
  toggleDevTools: () => set((s) => ({ devToolsOpen: !s.devToolsOpen })),

  // ---- Validation ----
  setValidationIssues: (issues) => set({ validationIssues: issues }),

  setPatternGhostNotes: (notes) => set({ patternGhostNotes: notes }),
  setPatternConfig: (config) => set((s) => ({ patternConfig: { ...s.patternConfig, ...config } })),

  // ---- LineStrip filter ----
  setLineStripSearch: (query) => set({ lineStripSearchQuery: query }),
  toggleLineStripSearch: () => set((s) => ({
    lineStripSearchOpen: !s.lineStripSearchOpen,
    lineStripSearchQuery: s.lineStripSearchOpen ? "" : s.lineStripSearchQuery,
  })),
  setLineStripCategoryFilter: (filter) => set({ lineStripCategoryFilter: filter }),
  toggleLineStripCategory: (category) => set((s) => {
    const current = s.lineStripCategoryFilter;
    if (!current) {
      // No filter active — start filtering with only this category
      return { lineStripCategoryFilter: [category] };
    }
    if (current.includes(category)) {
      const next = current.filter((c) => c !== category);
      return { lineStripCategoryFilter: next.length === 0 ? null : next };
    }
    return { lineStripCategoryFilter: [...current, category] };
  }),

  // ---- Unrolled Canvas ----
  setUnrolledScrollBeat: (beat) => set({ unrolledScrollBeat: Math.max(0, beat) }),
  toggleMiniPreview: () => set((s) => ({ showMiniPreview: !s.showMiniPreview })),
  setUnrolledNoteVisibility: (v) => set({ unrolledNoteVisibility: v }),
  setUnrolledEventVisibility: (v) => set({ unrolledEventVisibility: v }),

  // ---- Per-line unrolled tab ----
  setLineTabScrollBeat: (lineIndex, beat) => set((s) => ({
    lineTabScrollBeats: { ...s.lineTabScrollBeats, [lineIndex]: Math.max(0, beat) },
  })),
  clearLineTabScrollBeat: (lineIndex) => set((s) => {
    const { [lineIndex]: _, ...rest } = s.lineTabScrollBeats;
    return { lineTabScrollBeats: rest };
  }),
  setUnrolledFollowPlayback: (tabKey, follow) => set((s) => ({
    unrolledFollowPlayback: { ...s.unrolledFollowPlayback, [tabKey]: follow },
  })),
  clearUnrolledFollowPlayback: (tabKey) => set((s) => {
    const { [tabKey]: _, ...rest } = s.unrolledFollowPlayback;
    return { unrolledFollowPlayback: rest };
  }),

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
  setOnDemandOverlay: (panelId) => set({ onDemandOverlayPanelId: panelId }),
  setCanvasPanelHeight: (height) => set({ canvasPanelHeight: Math.max(100, Math.min(600, height)) }),
  toggleKeyframeBar: () => set((s) => ({ keyframeBarOpen: !s.keyframeBarOpen })),
  setKeyframeBarHeight: (height) => set({ keyframeBarHeight: Math.max(50, Math.min(200, height)) }),
}));

// ============================================================
// Narrow selector hooks
//
// Return primitive values for Record-typed state, avoiding
// unnecessary re-renders when unrelated keys change.
// ============================================================

/** Get scroll beat for a specific line tab (returns primitive — won't re-render on other lines). */
export function useLineTabScrollBeat(lineIndex: number): number {
  return useEditorStore((s) => s.lineTabScrollBeats[lineIndex] ?? 0);
}

/** Get follow-playback flag for a specific unrolled tab (returns primitive). */
export function useUnrolledFollowPlayback(tabKey: string): boolean {
  return useEditorStore((s) => s.unrolledFollowPlayback[tabKey] ?? true);
}

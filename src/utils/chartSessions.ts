// ============================================================
// Chart Session Manager
//
// Manages per-tab chart state snapshots so that multiple charts
// can be open simultaneously. When the user switches between
// chart tabs, the current chart/editor/audio state is saved
// and the target tab's state is restored.
//
// Usage:
//   saveSession(tabId)   — snapshot current state to the session map
//   restoreSession(tabId) — restore a saved session to the stores
//   deleteSession(tabId)  — remove a session (when tab is closed)
//   hasSession(tabId)     — check if a session exists
//
// Recent change (bug audit #4 + #5):
//   #5: snapshotted ephemeral editor-mode flags (stepRecordActive,
//       recordMode, improvisationMode, curveEditor/eventEditor UI
//       state, canvas viewport/panels, per-tab unrolled state) so
//       that two open tabs no longer bleed one tab's mode into the
//       other on switch. restoreSession writes them back instead
//       of clearing them. A small explicit list of truly ephemeral
//       UI state (drag boxes, mouse-held flags, canvas interaction
//       mode, floating inspector, pattern ghosts) is still cleared.
//   #4: added `storedProjectId` on each session and a fallback path
//       in restoreSession: if the captured blob URL is dead (because
//       the previous project was closed and its blob URL revoked),
//       re-materialize audio from IndexedDB via loadStoredProject.
// ============================================================

import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { useGroupStore } from "../stores/groupStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { audioEngine } from "../audio/audioEngine";
import { loadStoredProject } from "./projectStorage";
import type { PhichainChart, ProjectMeta } from "../types/chart";
import type { EditorTool, NoteSideFilter, LineSortMode, PanelId } from "../types/editor";
import type { EditorGroup } from "../types/group";
import type { Bookmark } from "../types/bookmark";
import type { NoteKind, LineEventKind } from "../types/chart";

// ---- Session data shape ----

export interface ChartSession {
  // Chart store
  chart: PhichainChart;
  meta: ProjectMeta;
  projectPath: string | null;
  musicPath: string | null;
  illustrationPath: string | null;
  illustrationImage: HTMLImageElement | null;
  isDirty: boolean;
  _past: PhichainChart[];
  _future: PhichainChart[];
  _pastSeqs: number[];
  _futureSeqs: number[];

  // Editor store (subset — UI-relevant state)
  selectedLineIndex: number | null;
  selectedNoteIndices: number[];
  selectedEventIndices: number[];
  activeTool: EditorTool;
  timelineZoom: number;
  density: number;
  verticalLines: number;
  xSnapEnabled: boolean;
  noteSideFilter: NoteSideFilter;
  lineSortMode: LineSortMode;
  unrolledScrollBeat: number;

  // Onset detection (preserved so markers survive view switches without re-detection)
  onsetMarkers: { beat: number; strength: number }[] | null;
  onsetAnalyzing: boolean;

  // Audio info (to reload when switching back)
  musicUrl: string | null; // Blob URL or filesystem path used to reload audio
  audioFormat: string | null; // Audio codec hint (e.g. "mp3", "ogg") — needed for blob URLs which lack extensions
  audioCurrentTime: number;
  musicLoaded: boolean;

  // Editor-only data (groups + bookmarks)
  groups: EditorGroup[];
  bookmarks: Bookmark[];

  // ── Bug audit #4: projectStorage key for audio rematerialization ──
  // Set by importChart/HomeScreen via setStoredProjectId() so that if
  // the captured blob URL dies (the previous chart was closed and its
  // _trackedMusicUrl revoked), restoreSession can fetch the audio
  // ArrayBuffer back from IndexedDB and build a fresh blob URL.
  // null for disk projects (which reload from musicPath instead).
  storedProjectId: string | null;

  // ── Bug audit #5: per-tab editor mode snapshot ──
  // Any flag here that represents the user's *intent* (which mode
  // they're in, where things are scrolled to, which panels are open)
  // is snapshotted here and written back verbatim on restore so Tab
  // A's mode doesn't bleed into Tab B.
  //
  // Truly ephemeral UI mutation state (drag rectangles, mouse-held
  // flags, floating inspector position, pattern ghost notes) is NOT
  // included — restoreSession resets those to default regardless of
  // source tab so switching can't restart a half-finished drag.
  mode: {
    // Step record
    stepRecordActive: boolean;
    stepRecordCurrentBeat: number;
    stepRecordNoteKind: NoteKind;
    stepRecordStepSize: number;

    // Record mode
    recordMode: boolean;
    recordModeChannels: { x: boolean; y: boolean; rotation: boolean };
    recordedKeyframes: Array<{ beat: number; x?: number; y?: number; rotation?: number }>;

    // High-level modes
    improvisationMode: boolean;
    beatSyncPlacement: boolean;

    // Curve editor layout
    curveEditorExpanded: boolean;
    curveEditorHeight: number;
    curveEditorVisibleLanes: LineEventKind[];
    curveEditorNormalized: boolean;
    curveEditorValueRange: { min: number; max: number } | null;
    curveEditorPoppedOut: boolean;

    // Event editor
    eventEditorShowAllLines: boolean;
    eventEditorShowNotes: boolean;
    eventEditorActiveProperty: LineEventKind;
    eventEditorActiveLayer: number;
    eventEditorCurrentBeat: number;

    // Unified canvas layout
    canvasViewport: { offsetX: number; offsetY: number; zoom: number };
    canvasActivePanelId: PanelId | null;
    canvasPanelHeight: number;
    lineDrawerOpen: boolean;
    unifiedInspectorOpen: boolean;
    keyframeBarOpen: boolean;
    keyframeBarHeight: number;
    lineVisibility: Record<number, boolean>;
    lineLocked: Record<number, boolean>;

    // Unrolled editor
    showMiniPreview: boolean;
    lineTabScrollBeats: Record<number, number>;
    unrolledFollowPlayback: Record<string, boolean>;

    // Timeline overlay
    timelineOverlayLines: number[];
    timelineOverlayEnabled: boolean;
    timelineOverlayOpacity: number;

    // Line list / strip UI
    lineStripCategoryFilter: string[] | null;
  };
}

// ---- Audio blob URL tracking ----
// Browser-loaded projects use blob: URLs for audio that don't survive a page
// reload. We track the last-loaded blob URL here so saveSession() can store it
// (instead of the empty `musicPath` which is useless for in-memory projects).

let _lastAudioBlobUrl: string | null = null;
let _lastAudioFormat: string | null = null;

/** Bug audit #4: the IndexedDB `StoredProject.id` for the currently
 *  loaded chart, if any. `saveSession` captures this into the session
 *  so `restoreSession` can fall back to loadStoredProject() when the
 *  blob URL has been revoked (chart closed, import swap, etc.). */
let _lastStoredProjectId: string | null = null;

/** Call after every audioEngine.load() with a blob URL so sessions can replay it.
 *  Pass the audio format (e.g. "mp3", "ogg") so restoreSession() can tell Howler
 *  which codec to use — blob URLs have no file extension for Howler to detect from. */
export function setAudioBlobUrl(url: string | null, format?: string | null): void {
  _lastAudioBlobUrl = url;
  if (format !== undefined) _lastAudioFormat = format;
}

/** Get the current tracked audio blob URL (used internally by saveSession). */
export function getAudioBlobUrl(): string | null {
  return _lastAudioBlobUrl;
}

/** Get the audio format hint (e.g. "mp3", "ogg") for the current blob URL.
 *  Needed by ML onset detection to give the temp file a correct extension
 *  when writing imported chart audio to disk for symphonia to decode. */
export function getAudioFormat(): string | null {
  return _lastAudioFormat;
}

/** Bug audit #4: Call immediately after saving/loading a project via
 *  projectStorage so that chartSessions can fall back to IndexedDB if
 *  the in-memory blob URL is revoked. Pass `null` for disk projects.
 *  Safe to call multiple times — the latest value wins. */
export function setStoredProjectId(id: string | null): void {
  _lastStoredProjectId = id;
}

/** Snapshot all per-tab editor mode fields into a plain-JSON shape. */
function snapshotEditorMode(): ChartSession["mode"] {
  const es = useEditorStore.getState();
  return {
    stepRecordActive: es.stepRecordActive,
    stepRecordCurrentBeat: es.stepRecordCurrentBeat,
    stepRecordNoteKind: es.stepRecordNoteKind,
    stepRecordStepSize: es.stepRecordStepSize,
    recordMode: es.recordMode,
    recordModeChannels: { ...es.recordModeChannels },
    recordedKeyframes: [...es.recordedKeyframes],
    improvisationMode: es.improvisationMode,
    beatSyncPlacement: es.beatSyncPlacement,
    curveEditorExpanded: es.curveEditorExpanded,
    curveEditorHeight: es.curveEditorHeight,
    curveEditorVisibleLanes: [...es.curveEditorVisibleLanes],
    curveEditorNormalized: es.curveEditorNormalized,
    curveEditorValueRange: es.curveEditorValueRange
      ? { ...es.curveEditorValueRange }
      : null,
    curveEditorPoppedOut: es.curveEditorPoppedOut,
    eventEditorShowAllLines: es.eventEditorShowAllLines,
    eventEditorShowNotes: es.eventEditorShowNotes,
    eventEditorActiveProperty: es.eventEditorActiveProperty,
    eventEditorActiveLayer: es.eventEditorActiveLayer,
    eventEditorCurrentBeat: es.eventEditorCurrentBeat,
    canvasViewport: { ...es.canvasViewport },
    canvasActivePanelId: es.canvasActivePanelId,
    canvasPanelHeight: es.canvasPanelHeight,
    lineDrawerOpen: es.lineDrawerOpen,
    unifiedInspectorOpen: es.unifiedInspectorOpen,
    keyframeBarOpen: es.keyframeBarOpen,
    keyframeBarHeight: es.keyframeBarHeight,
    lineVisibility: { ...es.lineVisibility },
    lineLocked: { ...es.lineLocked },
    showMiniPreview: es.showMiniPreview,
    lineTabScrollBeats: { ...es.lineTabScrollBeats },
    unrolledFollowPlayback: { ...es.unrolledFollowPlayback },
    timelineOverlayLines: [...es.timelineOverlayLines],
    timelineOverlayEnabled: es.timelineOverlayEnabled,
    timelineOverlayOpacity: es.timelineOverlayOpacity,
    lineStripCategoryFilter: es.lineStripCategoryFilter
      ? [...es.lineStripCategoryFilter]
      : null,
  };
}

// ---- Session storage ----

const sessions = new Map<string, ChartSession>();

/**
 * Save the current chart/editor/audio state into the session map
 * for the given tab ID. Call this before switching away from a chart tab.
 */
export function saveSession(tabId: string): void {
  const cs = useChartStore.getState();
  const es = useEditorStore.getState();
  const as_ = useAudioStore.getState();

  // Stop playback before saving
  if (as_.isPlaying) {
    audioEngine.stop();
  }

  const session: ChartSession = {
    // Chart store
    chart: structuredClone(cs.chart),
    meta: { ...cs.meta },
    projectPath: cs.projectPath,
    musicPath: cs.musicPath,
    illustrationPath: cs.illustrationPath,
    illustrationImage: cs.illustrationImage, // HTMLImageElement ref (not cloneable, but that's fine)
    isDirty: cs.isDirty,
    _past: cs._past.map((c) => structuredClone(c)),
    _future: cs._future.map((c) => structuredClone(c)),
    _pastSeqs: [...cs._pastSeqs],
    _futureSeqs: [...cs._futureSeqs],

    // Editor store
    selectedLineIndex: es.selectedLineIndex,
    selectedNoteIndices: [...es.selectedNoteIndices],
    selectedEventIndices: [...es.selectedEventIndices],
    activeTool: es.activeTool,
    timelineZoom: es.timelineZoom,
    density: es.density,
    verticalLines: es.verticalLines,
    xSnapEnabled: es.xSnapEnabled,
    noteSideFilter: es.noteSideFilter,
    lineSortMode: es.lineSortMode,
    unrolledScrollBeat: es.unrolledScrollBeat,

    // Onset detection — preserve so markers survive view switches
    onsetMarkers: es.onsetMarkers,
    onsetAnalyzing: false, // never save as "analyzing"

    // Audio info — prefer the tracked blob URL (set by import/load flows)
    // over cs.musicPath which is "" for browser-loaded projects
    musicUrl: _lastAudioBlobUrl || cs.musicPath,
    audioFormat: _lastAudioFormat || (cs.musicPath ? cs.musicPath.split(".").pop()?.toLowerCase() ?? null : null),
    audioCurrentTime: as_.currentTime,
    musicLoaded: as_.musicLoaded,

    // Editor-only data
    groups: structuredClone(useGroupStore.getState().groups),
    bookmarks: structuredClone(useBookmarkStore.getState().bookmarks),

    // Bug audit #4: IndexedDB fallback id.
    storedProjectId: _lastStoredProjectId,

    // Bug audit #5: per-tab editor mode snapshot.
    mode: snapshotEditorMode(),
  };

  sessions.set(tabId, session);
}

/**
 * Restore a saved session from the session map into the stores.
 * Call this when switching to a chart tab.
 * Returns true if the session was found and restored, false otherwise.
 */
export async function restoreSession(tabId: string): Promise<boolean> {
  const session = sessions.get(tabId);
  if (!session) return false;

  // Restore chart store
  useChartStore.setState({
    chart: session.chart,
    meta: session.meta,
    projectPath: session.projectPath,
    musicPath: session.musicPath,
    illustrationPath: session.illustrationPath,
    illustrationImage: session.illustrationImage,
    isDirty: session.isDirty,
    isLoaded: true,
    _past: session._past,
    _future: session._future,
    _pastSeqs: session._pastSeqs ?? [],
    _futureSeqs: session._futureSeqs ?? [],
  });

  // Restore editor store.
  //
  // Bug audit #5: write the mode-snapshot fields back so step-record,
  // record mode, curve-editor layout, event-editor state, canvas
  // viewport/panels, etc. are per-tab. `session.mode` is undefined
  // for sessions captured before this refactor — fall back to the
  // editor store's current value in that case (`??=` pattern).
  const m = session.mode;
  const cur = useEditorStore.getState();
  useEditorStore.setState({
    selectedLineIndex: session.selectedLineIndex,
    selectedNoteIndices: session.selectedNoteIndices,
    selectedEventIndices: session.selectedEventIndices,
    activeTool: session.activeTool,
    timelineZoom: session.timelineZoom,
    density: session.density,
    verticalLines: (session as { verticalLines?: number }).verticalLines ?? 21,
    xSnapEnabled: session.xSnapEnabled,
    noteSideFilter: session.noteSideFilter,
    lineSortMode: session.lineSortMode,
    unrolledScrollBeat: session.unrolledScrollBeat ?? 0,
    // Restore onset detection markers (so they survive view switches)
    onsetMarkers: session.onsetMarkers ?? null,
    onsetAnalyzing: false,

    // ── Per-tab mode snapshot (bug audit #5) ──
    stepRecordActive: m?.stepRecordActive ?? false,
    stepRecordCurrentBeat: m?.stepRecordCurrentBeat ?? 0,
    stepRecordNoteKind: m?.stepRecordNoteKind ?? cur.stepRecordNoteKind,
    stepRecordStepSize: m?.stepRecordStepSize ?? cur.stepRecordStepSize,
    recordMode: m?.recordMode ?? false,
    recordModeChannels: m?.recordModeChannels ?? cur.recordModeChannels,
    recordedKeyframes: m?.recordedKeyframes ?? [],
    improvisationMode: m?.improvisationMode ?? false,
    beatSyncPlacement: m?.beatSyncPlacement ?? false,
    curveEditorExpanded: m?.curveEditorExpanded ?? cur.curveEditorExpanded,
    curveEditorHeight: m?.curveEditorHeight ?? cur.curveEditorHeight,
    curveEditorVisibleLanes: m?.curveEditorVisibleLanes ?? cur.curveEditorVisibleLanes,
    curveEditorNormalized: m?.curveEditorNormalized ?? cur.curveEditorNormalized,
    curveEditorValueRange: m?.curveEditorValueRange ?? null,
    curveEditorPoppedOut: m?.curveEditorPoppedOut ?? cur.curveEditorPoppedOut,
    eventEditorShowAllLines: m?.eventEditorShowAllLines ?? cur.eventEditorShowAllLines,
    eventEditorShowNotes: m?.eventEditorShowNotes ?? cur.eventEditorShowNotes,
    eventEditorActiveProperty: m?.eventEditorActiveProperty ?? cur.eventEditorActiveProperty,
    eventEditorActiveLayer: m?.eventEditorActiveLayer ?? cur.eventEditorActiveLayer,
    eventEditorCurrentBeat: m?.eventEditorCurrentBeat ?? 0,
    canvasViewport: m?.canvasViewport ?? cur.canvasViewport,
    canvasActivePanelId: m?.canvasActivePanelId ?? null,
    canvasPanelHeight: m?.canvasPanelHeight ?? cur.canvasPanelHeight,
    lineDrawerOpen: m?.lineDrawerOpen ?? cur.lineDrawerOpen,
    unifiedInspectorOpen: m?.unifiedInspectorOpen ?? cur.unifiedInspectorOpen,
    keyframeBarOpen: m?.keyframeBarOpen ?? cur.keyframeBarOpen,
    keyframeBarHeight: m?.keyframeBarHeight ?? cur.keyframeBarHeight,
    lineVisibility: m?.lineVisibility ?? {},
    lineLocked: m?.lineLocked ?? {},
    showMiniPreview: m?.showMiniPreview ?? cur.showMiniPreview,
    lineTabScrollBeats: m?.lineTabScrollBeats ?? {},
    unrolledFollowPlayback: m?.unrolledFollowPlayback ?? {},
    timelineOverlayLines: m?.timelineOverlayLines ?? [],
    timelineOverlayEnabled: m?.timelineOverlayEnabled ?? false,
    timelineOverlayOpacity: m?.timelineOverlayOpacity ?? cur.timelineOverlayOpacity,
    lineStripCategoryFilter: m?.lineStripCategoryFilter ?? null,

    // ── Clear truly ephemeral UI state (bug audit #5) ──
    // These are mid-interaction mutations, not modes the user "is in".
    // Restoring them across a tab switch would reactivate a half-finished
    // drag or stale floating popover.
    dragSelectionRect: null,
    holdResizeState: null,
    pendingNote: null,
    curveTrackCreation: null,
    eventEditorDragState: null,
    curveEditorDragState: null,
    curveEditorHoveredKeyframe: null,
    floatingInspector: null,
    canvasInteractionMode: "idle",
    stepRecordMouseDown: false,
    stepRecordLastSnapX: null,
    stepRecordNotesPlaced: 0,
    patternGhostNotes: [],
  });

  // Bug audit #5: track the newly active tab's stored project ID so
  // future saveSession calls record it correctly.
  _lastStoredProjectId = session.storedProjectId;

  // Restore groups and bookmarks
  useGroupStore.setState({ groups: session.groups });
  useBookmarkStore.setState({ bookmarks: session.bookmarks });

  // Restore audio — reload the audio if it was loaded previously
  useAudioStore.setState({
    currentTime: session.audioCurrentTime,
    isPlaying: false,
    musicLoaded: false,
  });

  if (session.musicLoaded && (session.musicUrl || session.storedProjectId)) {
    try {
      let url = session.musicUrl;
      // Use the saved audio format when available; fall back to extracting from
      // the URL (works for filesystem paths like "song.mp3" but NOT for blob URLs
      // which have no extension — those default to "mp3").
      let ext = session.audioFormat
        || (url && url.startsWith("blob:") ? "mp3" : url?.split(".").pop()?.toLowerCase() ?? "mp3");

      // If the URL is a filesystem path (not a blob: URL), read via Tauri's fs plugin.
      if (url && !url.startsWith("blob:") && !url.startsWith("http")) {
        const { readAudioFileAsUrl } = await import("./ipc");
        url = await readAudioFileAsUrl(url);
      }

      let loaded = false;
      if (url) {
        try {
          await audioEngine.load(url, ext);
          loaded = true;
        } catch (loadErr) {
          // Bug audit #4: the blob URL may have been revoked since the
          // session was captured (another tab closed, cleanup fired).
          // Fall through to the IndexedDB rematerialization path.
          console.warn("[chartSessions] blob/file audio load failed, will try IndexedDB fallback:", loadErr);
        }
      }

      if (!loaded && session.storedProjectId) {
        // Bug audit #4: rematerialize audio from IndexedDB.
        const stored = await loadStoredProject(session.storedProjectId);
        if (stored?.audioBlob && stored.audioExt) {
          const mimeTypes: Record<string, string> = {
            mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4",
          };
          const blob = new Blob([stored.audioBlob], {
            type: mimeTypes[stored.audioExt] ?? "audio/mpeg",
          });
          const freshUrl = URL.createObjectURL(blob);
          ext = stored.audioExt;
          await audioEngine.load(freshUrl, ext);
          url = freshUrl;
          loaded = true;
        }
      }

      if (loaded && url) {
        useAudioStore.getState().setMusicLoaded(true);
        audioEngine.seek(session.audioCurrentTime);
        // Re-track the blob URL + format so the next saveSession() has correct data
        _lastAudioBlobUrl = url.startsWith("blob:") ? url : null;
        _lastAudioFormat = ext;
      } else {
        console.warn("[chartSessions] Could not reload audio for this tab — no working URL and no stored project.");
      }
    } catch (err) {
      console.warn("[chartSessions] Failed to reload audio:", err);
    }
  }

  return true;
}

/**
 * Delete a session from the session map.
 * Call this when a chart tab is closed.
 */
export function deleteSession(tabId: string): void {
  sessions.delete(tabId);
}

/**
 * Check if a session exists for the given tab ID.
 */
export function hasSession(tabId: string): boolean {
  return sessions.has(tabId);
}

/**
 * Register a new session for a tab by saving the current state.
 * Call this right after creating a new chart / loading a project.
 */
export function registerSession(tabId: string): void {
  saveSession(tabId);
}

// ---- Skip-save flag ----
// Used by NewProjectDialog to prevent the App.tsx tab-switch effect
// from overwriting a just-saved session. When a new chart is created,
// the dialog saves the old session explicitly, then sets this flag so
// the effect skips its automatic save.

let _skipNextSave = false;

/** Tell the session manager to skip the next automatic save. */
export function setSkipNextSave(): void {
  _skipNextSave = true;
}

/** Check and consume the skip-save flag. Returns true once, then resets. */
export function shouldSkipSave(): boolean {
  if (_skipNextSave) {
    _skipNextSave = false;
    return true;
  }
  return false;
}

// ---- Skip-restore flag ----
// Used by entry points (import, open-recent, new-project) that load chart
// data and audio themselves. When set, the App.tsx tab-switch effect will
// skip calling restoreSession() for the next tab activation, preventing
// double audio loads.

let _skipNextRestore = false;

/** Tell the session manager to skip the next automatic restore. */
export function setSkipNextRestore(): void {
  _skipNextRestore = true;
}

/** Check and consume the skip-restore flag. Returns true once, then resets. */
export function shouldSkipRestore(): boolean {
  if (_skipNextRestore) {
    _skipNextRestore = false;
    return true;
  }
  return false;
}

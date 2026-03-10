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
// ============================================================

import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { audioEngine } from "../audio/audioEngine";
import type { PhichainChart, ProjectMeta } from "../types/chart";
import type { EditorTool, NoteSideFilter, LineSortMode } from "../types/editor";

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

  // Editor store (subset — UI-relevant state)
  selectedLineIndex: number | null;
  selectedNoteIndices: number[];
  selectedEventIndices: number[];
  activeTool: EditorTool;
  timelineZoom: number;
  density: number;
  lanes: number;
  noteSideFilter: NoteSideFilter;
  lineSortMode: LineSortMode;

  // Audio info (to reload when switching back)
  musicUrl: string | null; // The URL used to load audio (objectUrl or convertFileSrc result)
  audioCurrentTime: number;
  musicLoaded: boolean;
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

    // Editor store
    selectedLineIndex: es.selectedLineIndex,
    selectedNoteIndices: [...es.selectedNoteIndices],
    selectedEventIndices: [...es.selectedEventIndices],
    activeTool: es.activeTool,
    timelineZoom: es.timelineZoom,
    density: es.density,
    lanes: es.lanes,
    noteSideFilter: es.noteSideFilter,
    lineSortMode: es.lineSortMode,

    // Audio info
    musicUrl: cs.musicPath, // We use musicPath as the reload key
    audioCurrentTime: as_.currentTime,
    musicLoaded: as_.musicLoaded,
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
  });

  // Restore editor store
  useEditorStore.setState({
    selectedLineIndex: session.selectedLineIndex,
    selectedNoteIndices: session.selectedNoteIndices,
    selectedEventIndices: session.selectedEventIndices,
    activeTool: session.activeTool,
    timelineZoom: session.timelineZoom,
    density: session.density,
    lanes: session.lanes,
    noteSideFilter: session.noteSideFilter,
    lineSortMode: session.lineSortMode,
    // Clear transient state
    dragSelectionRect: null,
    holdResizeState: null,
    pendingNote: null,
    curveTrackCreation: null,
    eventEditorDragState: null,
  });

  // Restore audio — reload the audio if it was loaded previously
  useAudioStore.setState({
    currentTime: session.audioCurrentTime,
    isPlaying: false,
    musicLoaded: false,
  });

  if (session.musicLoaded && session.musicUrl) {
    try {
      const ext = session.musicUrl.split(".").pop()?.toLowerCase() ?? "mp3";
      await audioEngine.load(session.musicUrl, ext);
      useAudioStore.getState().setMusicLoaded(true);
      audioEngine.seek(session.audioCurrentTime);
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

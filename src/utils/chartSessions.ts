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
// Recent change: Added _pastSeqs/_futureSeqs to session
// save/restore so undo sequence interleaving survives tab switches.
// ============================================================

import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { useGroupStore } from "../stores/groupStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { audioEngine } from "../audio/audioEngine";
import type { PhichainChart, ProjectMeta } from "../types/chart";
import type { EditorTool, NoteSideFilter, LineSortMode } from "../types/editor";
import type { EditorGroup } from "../types/group";
import type { Bookmark } from "../types/bookmark";

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
  lanes: number;
  xSnapEnabled: boolean;
  noteSideFilter: NoteSideFilter;
  lineSortMode: LineSortMode;
  unrolledScrollBeat: number;

  // Audio info (to reload when switching back)
  musicUrl: string | null; // Blob URL or filesystem path used to reload audio
  audioFormat: string | null; // Audio codec hint (e.g. "mp3", "ogg") — needed for blob URLs which lack extensions
  audioCurrentTime: number;
  musicLoaded: boolean;

  // Editor-only data (groups + bookmarks)
  groups: EditorGroup[];
  bookmarks: Bookmark[];
}

// ---- Audio blob URL tracking ----
// Browser-loaded projects use blob: URLs for audio that don't survive a page
// reload. We track the last-loaded blob URL here so saveSession() can store it
// (instead of the empty `musicPath` which is useless for in-memory projects).

let _lastAudioBlobUrl: string | null = null;
let _lastAudioFormat: string | null = null;

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
    lanes: es.lanes,
    xSnapEnabled: es.xSnapEnabled,
    noteSideFilter: es.noteSideFilter,
    lineSortMode: es.lineSortMode,
    unrolledScrollBeat: es.unrolledScrollBeat,

    // Audio info — prefer the tracked blob URL (set by import/load flows)
    // over cs.musicPath which is "" for browser-loaded projects
    musicUrl: _lastAudioBlobUrl || cs.musicPath,
    audioFormat: _lastAudioFormat || (cs.musicPath ? cs.musicPath.split(".").pop()?.toLowerCase() ?? null : null),
    audioCurrentTime: as_.currentTime,
    musicLoaded: as_.musicLoaded,

    // Editor-only data
    groups: structuredClone(useGroupStore.getState().groups),
    bookmarks: structuredClone(useBookmarkStore.getState().bookmarks),
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

  // Restore editor store
  useEditorStore.setState({
    selectedLineIndex: session.selectedLineIndex,
    selectedNoteIndices: session.selectedNoteIndices,
    selectedEventIndices: session.selectedEventIndices,
    activeTool: session.activeTool,
    timelineZoom: session.timelineZoom,
    density: session.density,
    lanes: session.lanes,
    xSnapEnabled: session.xSnapEnabled,
    noteSideFilter: session.noteSideFilter,
    lineSortMode: session.lineSortMode,
    unrolledScrollBeat: session.unrolledScrollBeat ?? 0,
    // Clear transient state
    dragSelectionRect: null,
    holdResizeState: null,
    pendingNote: null,
    curveTrackCreation: null,
    eventEditorDragState: null,
  });

  // Restore groups and bookmarks
  useGroupStore.setState({ groups: session.groups });
  useBookmarkStore.setState({ bookmarks: session.bookmarks });

  // Restore audio — reload the audio if it was loaded previously
  useAudioStore.setState({
    currentTime: session.audioCurrentTime,
    isPlaying: false,
    musicLoaded: false,
  });

  if (session.musicLoaded && session.musicUrl) {
    try {
      let url = session.musicUrl;
      // Use the saved audio format when available; fall back to extracting from
      // the URL (works for filesystem paths like "song.mp3" but NOT for blob URLs
      // which have no extension — those default to "mp3").
      const ext = session.audioFormat
        || (session.musicUrl.startsWith("blob:") ? "mp3" : session.musicUrl.split(".").pop()?.toLowerCase() ?? "mp3");
      // If the URL is a filesystem path (not a blob: URL), read via Tauri's fs plugin
      if (!url.startsWith("blob:") && !url.startsWith("http")) {
        const { readAudioFileAsUrl } = await import("./ipc");
        url = await readAudioFileAsUrl(session.musicUrl);
      }
      await audioEngine.load(url, ext);
      useAudioStore.getState().setMusicLoaded(true);
      audioEngine.seek(session.audioCurrentTime);
      // Re-track the blob URL + format so the next saveSession() has correct data
      _lastAudioBlobUrl = url.startsWith("blob:") ? url : null;
      _lastAudioFormat = ext;
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

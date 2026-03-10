// ============================================================
// App State — Persistence for tabs, editor prefs, last project
//
// Saves/restores the UI layout and preferences to app-state.json
// via appStorage. This lets the editor reopen where you left off.
//
// Usage:
//   await restoreAppState();   // on startup
//   saveAppStateDebounced();   // on state changes
// ============================================================

import { readJson, writeJson } from "./appStorage";
import { useTabStore } from "../stores/tabStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { useChartStore } from "../stores/chartStore";
import { audioEngine } from "../audio/audioEngine";
import type { EditorTool, NoteSideFilter } from "../types/editor";
import type { TabType } from "../stores/tabStore";

// ---- Serialized shapes ----

interface SerializedTab {
  id: string;
  type: TabType;
  label: string;
  closable: boolean;
  data?: Record<string, unknown>;
}

interface AppStateData {
  version: 1;
  tabs: SerializedTab[];
  activeTabId: string;
  lastProjectPath: string | null;
  editorPrefs: {
    timelineZoom: number;
    density: number;
    lanes: number;
    activeTool: EditorTool;
    playbackRate: number;
    noteSideFilter: NoteSideFilter;
  };
}

const FILENAME = "app-state.json";

// ---- Debounced save ----

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/** Save current app state to disk (debounced, 500ms) */
export function saveAppStateDebounced(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveAppState();
  }, 500);
}

/** Save current app state to disk (immediate) */
export async function saveAppState(): Promise<void> {
  try {
    const tabState = useTabStore.getState();
    const editorState = useEditorStore.getState();
    const audioState = useAudioStore.getState();
    const chartState = useChartStore.getState();

    const data: AppStateData = {
      version: 1,
      tabs: tabState.tabs.map((t) => ({
        id: t.id,
        type: t.type,
        label: t.label,
        closable: t.closable,
        data: t.data,
      })),
      activeTabId: tabState.activeTabId,
      lastProjectPath: chartState.projectPath === "in-memory" ? null : chartState.projectPath,
      editorPrefs: {
        timelineZoom: editorState.timelineZoom,
        density: editorState.density,
        lanes: editorState.lanes,
        activeTool: editorState.activeTool,
        playbackRate: audioState.playbackRate,
        noteSideFilter: editorState.noteSideFilter,
      },
    };

    await writeJson(FILENAME, data);
  } catch (err) {
    console.warn("[appState] Failed to save:", err);
  }
}

/**
 * Restore app state from disk.
 * Restores editor preferences and non-chart tabs.
 * Returns the last project path if a chart tab was open, so the
 * caller can reload the project.
 */
export async function restoreAppState(): Promise<string | null> {
  try {
    const data = await readJson<AppStateData>(FILENAME);
    if (!data || data.version !== 1) return null;

    // Restore editor preferences
    const es = useEditorStore.getState();
    if (data.editorPrefs) {
      es.setTimelineZoom(data.editorPrefs.timelineZoom);
      es.setDensity(data.editorPrefs.density);
      es.setLanes(data.editorPrefs.lanes);
      es.setTool(data.editorPrefs.activeTool);
      es.setNoteSideFilter(data.editorPrefs.noteSideFilter);
      if (data.editorPrefs.playbackRate) {
        // Use engine directly — it updates both Howler and the store
        audioEngine.setRate(data.editorPrefs.playbackRate);
      }
    }

    // Restore non-chart tabs (chart tabs need the project loaded first)
    const tabState = useTabStore.getState();
    for (const tab of data.tabs) {
      // Skip home (already exists), chart, and line_event_editor tabs
      if (tab.id === "home" || tab.type === "chart" || tab.type === "line_event_editor") {
        continue;
      }
      tabState.openTab({
        id: tab.id,
        type: tab.type,
        label: tab.label,
        closable: tab.closable,
        data: tab.data,
      });
    }

    // If the active tab was a non-chart tab, switch to it
    const wasChartActive = data.tabs.some(
      (t) => t.id === data.activeTabId && (t.type === "chart" || t.type === "line_event_editor"),
    );
    if (!wasChartActive && data.activeTabId !== "home") {
      tabState.setActiveTab(data.activeTabId);
    }

    // Return last project path so the caller can reload the chart
    const hadChartTab = data.tabs.some((t) => t.type === "chart");
    if (hadChartTab && data.lastProjectPath) {
      return data.lastProjectPath;
    }

    return null;
  } catch (err) {
    console.warn("[appState] Failed to restore:", err);
    return null;
  }
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { useChartStore } from "./stores/chartStore";
import { useAudioStore } from "./stores/audioStore";
import { useEditorStore } from "./stores/editorStore";
import { useTabStore } from "./stores/tabStore";
import { useRespackStore } from "./stores/respackStore";
import { useSettingsStore } from "./stores/settingsStore";
import { audioEngine } from "./audio/audioEngine";
import { initAutosave } from "./utils/autosave";
import { restoreAppState, saveAppState, saveAppStateDebounced } from "./utils/appState";
import { loadProject, isTauri } from "./utils/ipc";

// ---- 1. Load settings from disk (async, non-blocking) ----
useSettingsStore.getState().loadSettings();

// ---- 2. Sync music volume setting → audio engine in real time ----
{
  let prevVolume = useSettingsStore.getState().musicVolume;
  audioEngine.setVolume(prevVolume);
  useSettingsStore.subscribe((state) => {
    if (state.musicVolume !== prevVolume) {
      prevVolume = state.musicVolume;
      audioEngine.setVolume(state.musicVolume);
    }
  });
}

// ---- 3. Restore app state and reload last project ----
restoreAppState()
  .then(async (lastProjectPath) => {
    if (lastProjectPath && isTauri()) {
      try {
        const data = await loadProject(lastProjectPath);
        const cs = useChartStore.getState();
        cs.loadFromProjectData(data);

        // Load music if available (convert filesystem path to webview URL)
        if (data.music_path) {
          try {
            const { convertFileSrc } = await import("@tauri-apps/api/core");
            const musicUrl = convertFileSrc(data.music_path);
            const ext = data.music_path.split(".").pop()?.toLowerCase() ?? "mp3";
            await audioEngine.load(musicUrl, ext);
            useAudioStore.getState().setMusicLoaded(true);
          } catch (err) {
            console.warn("Failed to load music on restore:", err);
          }
        }

        // Load illustration if available
        if (data.illustration_path) {
          try {
            const { convertFileSrc } = await import("@tauri-apps/api/core");
            const illustrationUrl = convertFileSrc(data.illustration_path);
            await cs.loadIllustration(illustrationUrl);
          } catch (err) {
            console.warn("Failed to load illustration on restore:", err);
          }
        }

        // Re-open the chart tab
        useTabStore
          .getState()
          .openChart(lastProjectPath, data.meta.name || "Untitled Chart");
      } catch (err) {
        console.warn("Failed to restore last project:", err);
      }
    }
  })
  .catch((err) => {
    console.warn("Failed to restore app state:", err);
  });

// ---- 4. Initialize autosave ----
initAutosave();

// ---- 5. Subscribe to state changes for app-state persistence ----

// Save when tabs change
useTabStore.subscribe(saveAppStateDebounced);

// Save when editor prefs change
useEditorStore.subscribe((state, prevState) => {
  if (
    state.timelineZoom !== prevState.timelineZoom ||
    state.density !== prevState.density ||
    state.lanes !== prevState.lanes ||
    state.activeTool !== prevState.activeTool ||
    state.noteSideFilter !== prevState.noteSideFilter
  ) {
    saveAppStateDebounced();
  }
});

// Save when playback rate changes
useAudioStore.subscribe((state, prevState) => {
  if (state.playbackRate !== prevState.playbackRate) {
    saveAppStateDebounced();
  }
});

// Save when project is loaded or closed
useChartStore.subscribe((state, prevState) => {
  if (state.projectPath !== prevState.projectPath) {
    saveAppStateDebounced();
  }
});

// ---- 6. Save state before window closes ----
if (isTauri()) {
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => {
      getCurrentWindow().onCloseRequested(async () => {
        await saveAppState();
      });
    })
    .catch(() => {
      // Fallback: beforeunload (best-effort, async may not finish)
      window.addEventListener("beforeunload", () => {
        saveAppState();
      });
    });
} else {
  // Browser dev mode: beforeunload with sync localStorage fallback
  window.addEventListener("beforeunload", () => {
    saveAppState();
  });
}

// ---- Expose stores on window for debugging (dev only) ----
if (import.meta.env.DEV) {
  (window as Record<string, unknown>).__chartStore = useChartStore;
  (window as Record<string, unknown>).__audioStore = useAudioStore;
  (window as Record<string, unknown>).__editorStore = useEditorStore;
  (window as Record<string, unknown>).__tabStore = useTabStore;
  (window as Record<string, unknown>).__respackStore = useRespackStore;
}

// Initialize respacks from IndexedDB (non-blocking)
useRespackStore
  .getState()
  .initFromDb()
  .catch((err) => {
    console.warn("Failed to initialize respacks from IndexedDB:", err);
  });

// Suppress known warnings from react-mosaic-component's react-dnd dependency
// which hasn't been updated for React 19. These are cosmetic and don't affect
// functionality. Remove this once react-mosaic-component updates react-dnd.
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === "string" ? args[0] : "";
  if (
    msg.includes("Accessing element.ref was removed in React 19") ||
    msg.includes("Each child in a list should have a unique")
  ) {
    return;
  }
  origConsoleError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

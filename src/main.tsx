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
import { useFavoritesStore } from "./stores/favoritesStore";
import { audioEngine } from "./audio/audioEngine";
import { initAutosave } from "./utils/autosave";
import { restoreAppState, saveAppState, saveAppStateDebounced } from "./utils/appState";
import { loadProject, isTauri } from "./utils/ipc";
import { registerSession, setSkipNextRestore, setAudioBlobUrl, setStoredProjectId } from "./utils/chartSessions";

// ---- 1. Load settings from disk (async, non-blocking) ----
useSettingsStore.getState().loadSettings();
useFavoritesStore.getState().loadFavorites();

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

        // Bug audit #4: disk projects are reloaded via musicPath, not
        // IndexedDB — clear the stored-project-id tracker so
        // chartSessions doesn't try to rematerialize from IndexedDB
        // if this session's blob URL ever dies.
        setStoredProjectId(null);

        // Load music if available (read from disk → blob URL)
        if (data.music_path) {
          try {
            const { readAudioFileAsUrl } = await import("./utils/ipc");
            const musicUrl = await readAudioFileAsUrl(data.music_path);
            const ext = data.music_path.split(".").pop()?.toLowerCase() ?? "mp3";
            await audioEngine.load(musicUrl, ext);
            useAudioStore.getState().setMusicLoaded(true);
            // Track the blob URL + format so session save captures correct data
            setAudioBlobUrl(musicUrl, ext);
          } catch (err) {
            console.warn("Failed to load music on restore:", err);
          }
        }

        // Load illustration if available
        if (data.illustration_path) {
          try {
            const { readImageFileAsUrl } = await import("./utils/ipc");
            const illustrationUrl = await readImageFileAsUrl(data.illustration_path);
            await cs.loadIllustration(illustrationUrl);
          } catch (err) {
            console.warn("Failed to load illustration on restore:", err);
          }
        }

        // Re-open the chart tab and register its session (consistent with
        // importChart, NewProjectDialog, and HomeScreen entry points)
        useTabStore
          .getState()
          .openChart(lastProjectPath, data.meta.name || "Untitled Chart");
        setSkipNextRestore();
        registerSession(useTabStore.getState().getChartTabId(lastProjectPath));
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
    state.verticalLines !== prevState.verticalLines ||
    state.xSnapEnabled !== prevState.xSnapEnabled ||
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
      getCurrentWindow().onCloseRequested(async (event) => {
        // Check for unsaved changes before allowing close
        const cs = useChartStore.getState();
        if (cs.isDirty) {
          event.preventDefault();
          // Bug audit #13: wrap the showConfirm prompt in a try/catch.
          // If the dynamic import fails, ConfirmDialog isn't mounted, or
          // the promise rejects for any reason, the original code left
          // the window preventDefault-ed forever — the user couldn't
          // close the app. Now: on any error, save best-effort and
          // destroy the window so the user can always exit. Prefer
          // losing unsaved changes to locking the app.
          try {
            // Dynamic import: showConfirm requires ConfirmDialog to be mounted (React ready)
            const { showConfirm } = await import("./components/common/ConfirmDialog");
            const confirmed = await showConfirm("You have unsaved changes. Quit anyway?");
            if (confirmed) {
              await saveAppState();
              // Use destroy() instead of close() to avoid re-triggering this handler
              getCurrentWindow().destroy();
            }
            // If cancelled, do nothing — window stays open
          } catch (err) {
            console.error("Close-confirm dialog failed; forcing quit to avoid deadlock:", err);
            // Best-effort save, then force-close so the window doesn't get stuck.
            try { await saveAppState(); } catch { /* ignore */ }
            getCurrentWindow().destroy();
          }
        } else {
          await saveAppState();
        }
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
  (window as unknown as Record<string, unknown>).__chartStore = useChartStore;
  (window as unknown as Record<string, unknown>).__audioStore = useAudioStore;
  (window as unknown as Record<string, unknown>).__editorStore = useEditorStore;
  (window as unknown as Record<string, unknown>).__tabStore = useTabStore;
  (window as unknown as Record<string, unknown>).__respackStore = useRespackStore;
}

// Initialize respacks from IndexedDB (non-blocking)
useRespackStore
  .getState()
  .initFromDb()
  .catch((err) => {
    console.warn("Failed to initialize respacks from IndexedDB:", err);
  });

// Suppress known warning from react-mosaic-component's react-dnd dependency
// which hasn't been updated for React 19. This is cosmetic and doesn't affect
// functionality. Remove this once react-mosaic-component updates react-dnd.
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === "string" ? args[0] : "";
  if (msg.includes("Accessing element.ref was removed in React 19")) {
    return;
  }
  origConsoleError.apply(console, args);
};

// ---- Global unhandled rejection handler ----
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

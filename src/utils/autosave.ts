// ============================================================
// Autosave — Periodic chart saving
//
// Calls the existing saveProject() IPC at the interval configured
// in settings (autosaveEnabled + autosaveIntervalSeconds).
// Only saves when the chart is dirty and a project path exists.
//
// Usage:
//   initAutosave();  // call once at app startup
// ============================================================

import { useSettingsStore } from "../stores/settingsStore";
import { useChartStore } from "../stores/chartStore";
import { saveProject, isTauri } from "./ipc";

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Perform a single autosave if conditions are met */
async function performAutosave(): Promise<void> {
  const cs = useChartStore.getState();
  if (!cs.isLoaded || !cs.projectPath || cs.projectPath === "in-memory" || !cs.isDirty) return;

  try {
    await saveProject(cs.projectPath, cs.getChartJson());
    cs.markClean();
    console.debug("[autosave] Saved successfully");
  } catch (err) {
    console.warn("[autosave] Save failed:", err);
  }
}

/** Start or restart the autosave interval based on current settings */
function startInterval(): void {
  stopInterval();

  const settings = useSettingsStore.getState();
  if (!settings.autosaveEnabled) return;
  if (!isTauri()) return; // Autosave only works with Tauri backend

  const ms = settings.autosaveIntervalSeconds * 1000;
  intervalId = setInterval(performAutosave, ms);
}

/** Stop the autosave interval */
function stopInterval(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Initialize the autosave system.
 * Call once at app startup from main.tsx.
 * Subscribes to settings changes to restart the interval when
 * autosaveEnabled or autosaveIntervalSeconds change.
 */
export function initAutosave(): void {
  // Start initial interval
  startInterval();

  // Watch for settings changes
  let prevEnabled = useSettingsStore.getState().autosaveEnabled;
  let prevInterval = useSettingsStore.getState().autosaveIntervalSeconds;

  useSettingsStore.subscribe((state) => {
    if (
      state.autosaveEnabled !== prevEnabled ||
      state.autosaveIntervalSeconds !== prevInterval
    ) {
      prevEnabled = state.autosaveEnabled;
      prevInterval = state.autosaveIntervalSeconds;
      startInterval();
    }
  });
}

// ============================================================
// Settings Store — Zustand
//
// Persistent editor preferences saved to disk via Tauri's
// filesystem API. When running in the browser (no Tauri),
// falls back to localStorage.
//
// Usage:
//   const noteSize = useSettingsStore(s => s.noteSize);
//   const update = useSettingsStore(s => s.updateSettings);
// ============================================================

import { create } from "zustand";

export interface SettingsState {
  // ---- General ----
  language: string;

  // ---- Audio ----
  musicVolume: number; // 0.0 - 1.0
  hitSoundVolume: number; // 0.0 - 1.0

  // ---- Game preview ----
  noteSize: number;
  backgroundDim: number; // 0.0 - 1.0
  showFcApIndicator: boolean;
  multiHighlight: boolean;
  anchorMarkerVisibility: "never" | "always" | "when_visible";
  showHud: boolean;

  // ---- Timeline ----
  invertScrollDirection: boolean;

  // ---- Event Editor ----
  rotationSnapDegrees: number; // Snap angle interval in degrees (0 = off)

  // ---- Autosave ----
  autosaveEnabled: boolean;
  autosaveIntervalSeconds: number;

  // ---- Actions ----
  updateSettings: (changes: Partial<SettingsData>) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

// The subset of state that gets persisted
type SettingsData = Omit<SettingsState, "updateSettings" | "loadSettings" | "saveSettings">;

const STORAGE_KEY = "phichain-settings";

const DEFAULTS: SettingsData = {
  language: "en",
  musicVolume: 0.8,
  hitSoundVolume: 0.6,
  noteSize: 1.0,
  backgroundDim: 0.6,
  showFcApIndicator: true,
  multiHighlight: true,
  anchorMarkerVisibility: "when_visible" as const,
  showHud: true,
  invertScrollDirection: false,
  rotationSnapDegrees: 15,
  autosaveEnabled: true,
  autosaveIntervalSeconds: 120,
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULTS,

  updateSettings: (changes) => {
    set(changes);
    // Auto-save after update
    get().saveSettings();
  },

  loadSettings: async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        set({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // Ignore parse errors, keep defaults
    }
  },

  saveSettings: async () => {
    try {
      const state = get();
      const data: SettingsData = {
        language: state.language,
        musicVolume: state.musicVolume,
        hitSoundVolume: state.hitSoundVolume,
        noteSize: state.noteSize,
        backgroundDim: state.backgroundDim,
        showFcApIndicator: state.showFcApIndicator,
        multiHighlight: state.multiHighlight,
        anchorMarkerVisibility: state.anchorMarkerVisibility,
        showHud: state.showHud,
        invertScrollDirection: state.invertScrollDirection,
        rotationSnapDegrees: state.rotationSnapDegrees,
        autosaveEnabled: state.autosaveEnabled,
        autosaveIntervalSeconds: state.autosaveIntervalSeconds,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  },
}));

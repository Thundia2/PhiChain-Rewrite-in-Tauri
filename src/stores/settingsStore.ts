// ============================================================
// Settings Store — Zustand
//
// Persistent editor preferences saved to %appdata%/PhiChain_Tauri/
// via appStorage. Falls back to localStorage in browser dev mode.
//
// Usage:
//   const noteSize = useSettingsStore(s => s.noteSize);
//   const update = useSettingsStore(s => s.updateSettings);
// ============================================================

import { create } from "zustand";
import { readJson, writeJson } from "../utils/appStorage";

export interface SettingsState {
  // ---- General ----
  language: string;

  // ---- Audio ----
  musicVolume: number; // 0.0 - 1.0
  hitSoundVolume: number; // 0.0 - 1.0
  hitSoundEnabled: boolean;

  // ---- Game preview ----
  noteSize: number;
  backgroundDim: number; // 0.0 - 1.0
  showHitEffects: boolean;
  showFcApIndicator: boolean;
  multiHighlight: boolean;
  anchorMarkerVisibility: "never" | "always" | "when_visible";
  showHud: boolean;

  // ---- Timeline ----
  invertScrollDirection: boolean;
  timelineFollowPlayback: boolean;

  // ---- Event Editor ----
  rotationSnapDegrees: number; // Snap angle interval in degrees (0 = off)

  // ---- Editor ----
  defaultEditorView: "unified" | "classic";

  // ---- Autosave ----
  autosaveEnabled: boolean;
  autosaveIntervalSeconds: number;

  // ---- Quick Event Creation ----
  quickTransitionDuration: number;
  quickTransitionEasing: string;

  // ---- Record Mode ----
  recordSnapToDensity: boolean;
  recordSimplificationDefault: number;

  // ---- Text Events ----
  defaultTextDurationBeats: number;

  // ---- Line path preview ----
  showLinePath: boolean;
  linePathBeatsAhead: number;
  linePathBeatsBehind: number;
  linePathSampleInterval: number;

  // ---- Colors ----
  recentColors: [number, number, number][];

  // ---- Easing ----
  recentEasings: string[];
  favoriteEasings: string[];

  // ---- Actions ----
  updateSettings: (changes: Partial<SettingsData>) => void;
  recordEasingUse: (easing: string) => void;
  toggleFavoriteEasing: (easing: string) => void;
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
  hitSoundEnabled: true,
  noteSize: 1.0,
  backgroundDim: 0.6,
  showHitEffects: true,
  showFcApIndicator: true,
  multiHighlight: true,
  anchorMarkerVisibility: "when_visible" as const,
  showHud: true,
  invertScrollDirection: false,
  timelineFollowPlayback: true,
  rotationSnapDegrees: 15,
  defaultEditorView: "unified" as const,
  autosaveEnabled: true,
  autosaveIntervalSeconds: 120,
  quickTransitionDuration: 4,
  quickTransitionEasing: "ease_out_sine",
  recordSnapToDensity: true,
  recordSimplificationDefault: 5,
  defaultTextDurationBeats: 2,
  showLinePath: false,
  linePathBeatsAhead: 8,
  linePathBeatsBehind: 4,
  linePathSampleInterval: 0.5,
  recentColors: [],
  recentEasings: [],
  favoriteEasings: ["linear", "ease_out_sine", "ease_out_cubic"],
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULTS,

  updateSettings: (changes) => {
    set(changes);
    // Auto-save after update
    get().saveSettings();
  },

  recordEasingUse: (easing) => {
    set((s) => {
      const recent = [easing, ...s.recentEasings.filter((e) => e !== easing)].slice(0, 8);
      return { recentEasings: recent };
    });
    get().saveSettings();
  },

  toggleFavoriteEasing: (easing) => {
    set((s) => {
      const favs = s.favoriteEasings.includes(easing)
        ? s.favoriteEasings.filter((e) => e !== easing)
        : [...s.favoriteEasings, easing];
      return { favoriteEasings: favs };
    });
    get().saveSettings();
  },

  loadSettings: async () => {
    try {
      // Try new appStorage first
      const saved = await readJson<Partial<SettingsData>>("settings.json");
      if (saved) {
        set({ ...DEFAULTS, ...saved });
        return;
      }
      // Migration: fall back to old localStorage key
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        set({ ...DEFAULTS, ...parsed });
        // Migrate to new location
        await writeJson("settings.json", { ...DEFAULTS, ...parsed });
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
        hitSoundEnabled: state.hitSoundEnabled,
        noteSize: state.noteSize,
        backgroundDim: state.backgroundDim,
        showHitEffects: state.showHitEffects,
        showFcApIndicator: state.showFcApIndicator,
        multiHighlight: state.multiHighlight,
        anchorMarkerVisibility: state.anchorMarkerVisibility,
        showHud: state.showHud,
        invertScrollDirection: state.invertScrollDirection,
        timelineFollowPlayback: state.timelineFollowPlayback,
        rotationSnapDegrees: state.rotationSnapDegrees,
        defaultEditorView: state.defaultEditorView,
        autosaveEnabled: state.autosaveEnabled,
        autosaveIntervalSeconds: state.autosaveIntervalSeconds,
        quickTransitionDuration: state.quickTransitionDuration,
        quickTransitionEasing: state.quickTransitionEasing,
        recordSnapToDensity: state.recordSnapToDensity,
        recordSimplificationDefault: state.recordSimplificationDefault,
        defaultTextDurationBeats: state.defaultTextDurationBeats,
        showLinePath: state.showLinePath,
        linePathBeatsAhead: state.linePathBeatsAhead,
        linePathBeatsBehind: state.linePathBeatsBehind,
        linePathSampleInterval: state.linePathSampleInterval,
        recentColors: state.recentColors,
        recentEasings: state.recentEasings,
        favoriteEasings: state.favoriteEasings,
      };
      await writeJson("settings.json", data);
    } catch {
      // Ignore storage errors
    }
  },
}));

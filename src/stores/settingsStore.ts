// ============================================================
// Settings Store — Zustand
//
// Persistent editor preferences saved to %appdata%/PhiChain_Tauri/
// via appStorage. Falls back to localStorage in browser dev mode.
//
// Usage:
//   const noteSize = useSettingsStore(s => s.noteSize);
//   const update = useSettingsStore(s => s.updateSettings);
//
// Recent change: Added onset detection persistent settings —
// onsetDetectionEnabled, onsetSensitivity, onsetOpacity, onsetSnapToGrid.
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
  audioLatencyMs: number; // Device audio latency compensation in ms (-300 to +300)

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
  defaultEditorView: "unified" | "classic" | "unrolled";

  // ---- Line Strip ----
  lineInactivityTimeoutSeconds: number; // Seconds with no upcoming note before a line is demoted to inactive (0 = disabled)

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

  // ---- Beat grid (perpendicular beat subdivision overlay) ----
  showBeatGrid: boolean;
  beatGridBeatsAhead: number;

  // ---- Colors ----
  recentColors: [number, number, number][];

  // ---- Easing ----
  recentEasings: string[];
  favoriteEasings: string[];

  // ---- Unrolled Editor ----
  unrolledDefaultAbove: boolean;  // Default above/below for placed notes (default true)

  // ---- Onset Detection (all persisted across restarts) ----
  /** Whether onset markers are visible on the timeline */
  onsetDetectionEnabled: boolean;
  /** Sensitivity 0.0 (few markers) to 1.0 (many markers) */
  onsetSensitivity: number;
  /** Opacity of onset markers on the timeline 0.0-1.0 */
  onsetOpacity: number;
  /** Whether to snap onset markers to the beat grid */
  onsetSnapToGrid: boolean;

  // ---- Onboarding ----
  hasSeenOnboarding: boolean;

  // ---- Hotkeys ----
  hotkeyOverrides: Record<string, string>;

  // ---- Custom presets ----
  customPresets: import("../types/preset").EventPreset[];

  // ---- Actions ----
  /** Merge partial settings changes. Auto-saves after update. */
  updateSettings: (changes: Partial<SettingsData>) => void;
  /** Track an easing usage for "recently used" ordering. */
  recordEasingUse: (easing: string) => void;
  toggleFavoriteEasing: (easing: string) => void;
  /** Override a hotkey binding. Action is the hotkey ID, key is the new keybinding string. */
  setHotkeyOverride: (action: string, key: string) => void;
  /** Reset a single hotkey to its default binding. */
  resetHotkey: (action: string) => void;
  /** Reset all hotkey overrides to defaults. */
  resetAllHotkeys: () => void;
  addCustomPreset: (preset: import("../types/preset").EventPreset) => void;
  /** Load settings from localStorage. Runs migration for old format. */
  loadSettings: () => Promise<void>;
  /** Persist current settings to localStorage. */
  saveSettings: () => Promise<void>;
}

// The subset of state that gets persisted (exclude all action methods)
type SettingsData = Omit<SettingsState, "updateSettings" | "loadSettings" | "saveSettings" | "recordEasingUse" | "toggleFavoriteEasing" | "setHotkeyOverride" | "resetHotkey" | "resetAllHotkeys" | "addCustomPreset">;

const STORAGE_KEY = "phichain-settings";

const DEFAULTS: SettingsData = {
  language: "en",
  musicVolume: 0.8,
  hitSoundVolume: 0.6,
  hitSoundEnabled: true,
  audioLatencyMs: 0,
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
  lineInactivityTimeoutSeconds: 5,
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
  showBeatGrid: false,
  beatGridBeatsAhead: 4,
  recentColors: [],
  recentEasings: [],
  favoriteEasings: ["linear", "ease_out_sine", "ease_out_cubic"],
  unrolledDefaultAbove: true,
  onsetDetectionEnabled: false,
  onsetSensitivity: 0.5,
  onsetOpacity: 0.6,
  onsetSnapToGrid: false,
  hasSeenOnboarding: false,
  hotkeyOverrides: {},
  customPresets: [],
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

  setHotkeyOverride: (action, key) => {
    set((s) => ({
      hotkeyOverrides: { ...s.hotkeyOverrides, [action]: key },
    }));
    get().saveSettings();
  },

  resetHotkey: (action) => {
    set((s) => {
      const next = { ...s.hotkeyOverrides };
      delete next[action];
      return { hotkeyOverrides: next };
    });
    get().saveSettings();
  },

  resetAllHotkeys: () => {
    set({ hotkeyOverrides: {} });
    get().saveSettings();
  },

  addCustomPreset: (preset) => {
    set((s) => ({
      customPresets: [...s.customPresets, preset],
    }));
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
        audioLatencyMs: state.audioLatencyMs,
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
        lineInactivityTimeoutSeconds: state.lineInactivityTimeoutSeconds,
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
        showBeatGrid: state.showBeatGrid,
        beatGridBeatsAhead: state.beatGridBeatsAhead,
        unrolledDefaultAbove: state.unrolledDefaultAbove,
        onsetDetectionEnabled: state.onsetDetectionEnabled,
        onsetSensitivity: state.onsetSensitivity,
        onsetOpacity: state.onsetOpacity,
        onsetSnapToGrid: state.onsetSnapToGrid,
        recentColors: state.recentColors,
        recentEasings: state.recentEasings,
        favoriteEasings: state.favoriteEasings,
        hasSeenOnboarding: state.hasSeenOnboarding,
        hotkeyOverrides: state.hotkeyOverrides,
        customPresets: state.customPresets,
      };
      await writeJson("settings.json", data);
    } catch {
      // Ignore storage errors
    }
  },
}));

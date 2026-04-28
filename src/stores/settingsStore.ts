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
// Recent change (bug audit #12): Added `sanitizeSettings` that
// clamps numeric fields and validates enum strings before a persisted
// blob reaches the store. Previously `loadSettings` did a raw
// `{ ...DEFAULTS, ...saved }` merge with no validation — a corrupted
// or hand-edited settings.json could push invalid values (negative
// tab height, out-of-range volume, unknown enum) straight into code
// that never re-clamps (audioEngine volume cube, layout math). Now
// every load goes through a sanitizer with per-field clamps.
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

  // ---- Tab Bar ----
  tabHeight: number;   // Tab button height in px (24-48, default 34)
  tabMaxWidth: number; // Tab button max-width in px (120-400, default 260)

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
  /**
   * Draw a faint full-width tint between event start_beat and end_beat
   * in the unrolled canvas (default true). When false, only the boundary
   * lines + gutter diamonds are drawn — useful on busy charts where
   * overlapping span tints make the canvas read murky.
   */
  unrolledShowEventSpanTints: boolean;

  // ---- Onset Detection (all persisted across restarts) ----
  /** Whether onset markers are visible on the timeline */
  onsetDetectionEnabled: boolean;
  /** DEPRECATED — kept for one release so existing settings.json files load without
   *  errors. Not read anywhere in code (Phase A peak-picker uses the 4 fields below
   *  instead). Removed from `saveSettings` so fresh writes no longer carry it forward.
   *  Delete entirely in a follow-up release. */
  onsetSensitivity: number;
  /** Opacity of onset markers on the timeline 0.0-1.0 */
  onsetOpacity: number;
  /** Whether to snap onset markers to the beat grid */
  onsetSnapToGrid: boolean;
  /** Target onset density in onsets/sec, global default (per-chart override in
   *  chart.json is added in Phase B). Range 0.5-8.0, default 2.0 — roughly one
   *  marker per beat at 120 BPM. */
  onsetTargetDensity: number;
  /** Minimum salience value a pick must have to be displayed as a marker (visual
   *  filter applied AFTER selection, cheap to update live). Range 0-1, default 0. */
  onsetMinDisplayStrength: number;
  /** Absolute floor for the peak-picker's adaptive threshold — threshold(i) =
   *  max(onsetAbsFloor, localMedian + onsetAdaptiveDelta). Range 0-1, default 0.10. */
  onsetAbsFloor: number;
  /** Delta added to the rolling-median when computing the adaptive threshold.
   *  Range 0-0.20, default 0.03. */
  onsetAdaptiveDelta: number;

  // ---- AI Generation ----
  /** Whether AI generation is enabled (user must opt-in) */
  aiEnabled: boolean;
  /** "local" = local server (Ollama/vLLM), "remote" = cloud API (Gemini, OpenRouter) */
  aiMode: "local" | "remote";
  /** AI server endpoint URL */
  aiEndpoint: string;
  /** Model name for the inference server */
  aiModel: string;
  /** Temperature for AI generation (0.0-1.0, lower = more deterministic) */
  aiTemperature: number;
  /** Maximum tokens for AI response */
  aiMaxTokens: number;
  /** API key for remote endpoints (e.g. Google Gemini API) — empty string for local servers */
  aiApiKey: string;
  /** Custom instructions appended after the built-in system prompt — empty string to use defaults only */
  aiCustomPrompt: string;

  // ---- Renderer (PAUSED / ON HOLD) ----
  /** Use GPU-accelerated PixiJS renderer instead of Canvas 2D (experimental, on hold) */
  usePixiRenderer: boolean;

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

// ---- Sanitization helpers (bug audit #12) ---------------------
//
// Clamp a numeric field to a range, falling back to the default when
// the input is not a finite number (covers NaN, Infinity, strings,
// null, undefined from corrupted JSON).
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

// Validate an enum-string field against a set of allowed values.
function enumStr<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

// Validate a boolean field — accepts only true/false, not truthy strings.
function boolVal(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// Validate an array field (keeps only arrays; content checks are caller's job).
function arrVal<T>(v: unknown, fallback: T[]): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

/**
 * Clamp/validate every field on a persisted partial-SettingsData.
 * Any field outside its range or with the wrong type is replaced
 * with the corresponding DEFAULTS value. Fields not present in the
 * input are simply absent in the output (the caller spreads DEFAULTS
 * under this to fill them).
 *
 * Ranges come from the UI control clamps and comments in SettingsState.
 */
function sanitizeSettings(raw: Partial<SettingsData>): Partial<SettingsData> {
  const out: Partial<SettingsData> = {};

  // Scalar ranges picked from UI slider bounds + existing comments.
  if ("language" in raw) out.language = typeof raw.language === "string" ? raw.language : DEFAULTS.language;
  if ("musicVolume" in raw) out.musicVolume = clampNum(raw.musicVolume, 0, 1, DEFAULTS.musicVolume);
  if ("hitSoundVolume" in raw) out.hitSoundVolume = clampNum(raw.hitSoundVolume, 0, 1, DEFAULTS.hitSoundVolume);
  if ("hitSoundEnabled" in raw) out.hitSoundEnabled = boolVal(raw.hitSoundEnabled, DEFAULTS.hitSoundEnabled);
  if ("audioLatencyMs" in raw) out.audioLatencyMs = clampNum(raw.audioLatencyMs, -300, 300, DEFAULTS.audioLatencyMs);
  if ("noteSize" in raw) out.noteSize = clampNum(raw.noteSize, 0.1, 5, DEFAULTS.noteSize);
  if ("backgroundDim" in raw) out.backgroundDim = clampNum(raw.backgroundDim, 0, 1, DEFAULTS.backgroundDim);
  if ("showHitEffects" in raw) out.showHitEffects = boolVal(raw.showHitEffects, DEFAULTS.showHitEffects);
  if ("showFcApIndicator" in raw) out.showFcApIndicator = boolVal(raw.showFcApIndicator, DEFAULTS.showFcApIndicator);
  if ("multiHighlight" in raw) out.multiHighlight = boolVal(raw.multiHighlight, DEFAULTS.multiHighlight);
  if ("anchorMarkerVisibility" in raw) {
    out.anchorMarkerVisibility = enumStr(raw.anchorMarkerVisibility, ["never", "always", "when_visible"] as const, DEFAULTS.anchorMarkerVisibility);
  }
  if ("showHud" in raw) out.showHud = boolVal(raw.showHud, DEFAULTS.showHud);
  if ("invertScrollDirection" in raw) out.invertScrollDirection = boolVal(raw.invertScrollDirection, DEFAULTS.invertScrollDirection);
  if ("timelineFollowPlayback" in raw) out.timelineFollowPlayback = boolVal(raw.timelineFollowPlayback, DEFAULTS.timelineFollowPlayback);
  if ("rotationSnapDegrees" in raw) out.rotationSnapDegrees = clampNum(raw.rotationSnapDegrees, 0, 180, DEFAULTS.rotationSnapDegrees);
  if ("defaultEditorView" in raw) out.defaultEditorView = enumStr(raw.defaultEditorView, ["unified", "classic", "unrolled"] as const, DEFAULTS.defaultEditorView);
  // Tab bar: clamps from comments on the fields (24-48, 120-400).
  if ("tabHeight" in raw) out.tabHeight = clampNum(raw.tabHeight, 24, 48, DEFAULTS.tabHeight);
  if ("tabMaxWidth" in raw) out.tabMaxWidth = clampNum(raw.tabMaxWidth, 120, 400, DEFAULTS.tabMaxWidth);
  if ("lineInactivityTimeoutSeconds" in raw) out.lineInactivityTimeoutSeconds = clampNum(raw.lineInactivityTimeoutSeconds, 0, 3600, DEFAULTS.lineInactivityTimeoutSeconds);
  if ("autosaveEnabled" in raw) out.autosaveEnabled = boolVal(raw.autosaveEnabled, DEFAULTS.autosaveEnabled);
  if ("autosaveIntervalSeconds" in raw) out.autosaveIntervalSeconds = clampNum(raw.autosaveIntervalSeconds, 5, 3600, DEFAULTS.autosaveIntervalSeconds);
  if ("quickTransitionDuration" in raw) out.quickTransitionDuration = clampNum(raw.quickTransitionDuration, 0.01, 1000, DEFAULTS.quickTransitionDuration);
  if ("quickTransitionEasing" in raw) out.quickTransitionEasing = typeof raw.quickTransitionEasing === "string" ? raw.quickTransitionEasing : DEFAULTS.quickTransitionEasing;
  if ("recordSnapToDensity" in raw) out.recordSnapToDensity = boolVal(raw.recordSnapToDensity, DEFAULTS.recordSnapToDensity);
  if ("recordSimplificationDefault" in raw) out.recordSimplificationDefault = clampNum(raw.recordSimplificationDefault, 0, 100, DEFAULTS.recordSimplificationDefault);
  if ("defaultTextDurationBeats" in raw) out.defaultTextDurationBeats = clampNum(raw.defaultTextDurationBeats, 0.01, 1000, DEFAULTS.defaultTextDurationBeats);
  if ("showLinePath" in raw) out.showLinePath = boolVal(raw.showLinePath, DEFAULTS.showLinePath);
  if ("linePathBeatsAhead" in raw) out.linePathBeatsAhead = clampNum(raw.linePathBeatsAhead, 0, 1000, DEFAULTS.linePathBeatsAhead);
  if ("linePathBeatsBehind" in raw) out.linePathBeatsBehind = clampNum(raw.linePathBeatsBehind, 0, 1000, DEFAULTS.linePathBeatsBehind);
  if ("linePathSampleInterval" in raw) out.linePathSampleInterval = clampNum(raw.linePathSampleInterval, 0.01, 10, DEFAULTS.linePathSampleInterval);
  if ("showBeatGrid" in raw) out.showBeatGrid = boolVal(raw.showBeatGrid, DEFAULTS.showBeatGrid);
  if ("beatGridBeatsAhead" in raw) out.beatGridBeatsAhead = clampNum(raw.beatGridBeatsAhead, 0, 1000, DEFAULTS.beatGridBeatsAhead);
  if ("recentColors" in raw) out.recentColors = arrVal(raw.recentColors, DEFAULTS.recentColors);
  if ("recentEasings" in raw) out.recentEasings = arrVal(raw.recentEasings, DEFAULTS.recentEasings);
  if ("favoriteEasings" in raw) out.favoriteEasings = arrVal(raw.favoriteEasings, DEFAULTS.favoriteEasings);
  if ("unrolledDefaultAbove" in raw) out.unrolledDefaultAbove = boolVal(raw.unrolledDefaultAbove, DEFAULTS.unrolledDefaultAbove);
  if ("unrolledShowEventSpanTints" in raw) out.unrolledShowEventSpanTints = boolVal(raw.unrolledShowEventSpanTints, DEFAULTS.unrolledShowEventSpanTints);
  if ("onsetDetectionEnabled" in raw) out.onsetDetectionEnabled = boolVal(raw.onsetDetectionEnabled, DEFAULTS.onsetDetectionEnabled);
  // onsetSensitivity is deprecated but sanitized so old files load without validation errors.
  // The new peak-picker does not read it. saveSettings() no longer writes it back.
  if ("onsetSensitivity" in raw) out.onsetSensitivity = clampNum(raw.onsetSensitivity, 0, 1, DEFAULTS.onsetSensitivity);
  if ("onsetOpacity" in raw) out.onsetOpacity = clampNum(raw.onsetOpacity, 0, 1, DEFAULTS.onsetOpacity);
  if ("onsetSnapToGrid" in raw) out.onsetSnapToGrid = boolVal(raw.onsetSnapToGrid, DEFAULTS.onsetSnapToGrid);
  if ("onsetTargetDensity" in raw) out.onsetTargetDensity = clampNum(raw.onsetTargetDensity, 0.5, 8.0, DEFAULTS.onsetTargetDensity);
  if ("onsetMinDisplayStrength" in raw) out.onsetMinDisplayStrength = clampNum(raw.onsetMinDisplayStrength, 0, 1, DEFAULTS.onsetMinDisplayStrength);
  if ("onsetAbsFloor" in raw) out.onsetAbsFloor = clampNum(raw.onsetAbsFloor, 0, 1, DEFAULTS.onsetAbsFloor);
  if ("onsetAdaptiveDelta" in raw) out.onsetAdaptiveDelta = clampNum(raw.onsetAdaptiveDelta, 0, 0.20, DEFAULTS.onsetAdaptiveDelta);
  if ("aiEnabled" in raw) out.aiEnabled = boolVal(raw.aiEnabled, DEFAULTS.aiEnabled);
  if ("aiMode" in raw) out.aiMode = enumStr(raw.aiMode, ["local", "remote"] as const, DEFAULTS.aiMode);
  if ("aiEndpoint" in raw) out.aiEndpoint = typeof raw.aiEndpoint === "string" ? raw.aiEndpoint : DEFAULTS.aiEndpoint;
  if ("aiModel" in raw) out.aiModel = typeof raw.aiModel === "string" ? raw.aiModel : DEFAULTS.aiModel;
  if ("aiTemperature" in raw) out.aiTemperature = clampNum(raw.aiTemperature, 0, 2, DEFAULTS.aiTemperature);
  if ("aiMaxTokens" in raw) out.aiMaxTokens = Math.round(clampNum(raw.aiMaxTokens, 1, 1_000_000, DEFAULTS.aiMaxTokens));
  if ("aiApiKey" in raw) out.aiApiKey = typeof raw.aiApiKey === "string" ? raw.aiApiKey : DEFAULTS.aiApiKey;
  if ("aiCustomPrompt" in raw) out.aiCustomPrompt = typeof raw.aiCustomPrompt === "string" ? raw.aiCustomPrompt : DEFAULTS.aiCustomPrompt;
  if ("usePixiRenderer" in raw) out.usePixiRenderer = boolVal(raw.usePixiRenderer, DEFAULTS.usePixiRenderer);
  if ("hasSeenOnboarding" in raw) out.hasSeenOnboarding = boolVal(raw.hasSeenOnboarding, DEFAULTS.hasSeenOnboarding);
  if ("hotkeyOverrides" in raw) {
    // Keep only string→string entries.
    const src = raw.hotkeyOverrides;
    if (src && typeof src === "object" && !Array.isArray(src)) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(src)) {
        if (typeof k === "string" && typeof v === "string") clean[k] = v;
      }
      out.hotkeyOverrides = clean;
    } else {
      out.hotkeyOverrides = DEFAULTS.hotkeyOverrides;
    }
  }
  if ("customPresets" in raw) out.customPresets = arrVal(raw.customPresets, DEFAULTS.customPresets);

  return out;
}

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
  tabHeight: 34,
  tabMaxWidth: 260,
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
  unrolledShowEventSpanTints: true,
  onsetDetectionEnabled: false,
  onsetSensitivity: 0.3,
  onsetOpacity: 0.6,
  onsetSnapToGrid: false,
  onsetTargetDensity: 2.0,
  onsetMinDisplayStrength: 0.0,
  onsetAbsFloor: 0.10,
  onsetAdaptiveDelta: 0.03,
  aiEnabled: false,
  aiMode: "remote" as const,
  aiEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
  aiModel: "gemma-3-27b-it",
  aiTemperature: 0.2,
  aiMaxTokens: 8192,
  aiApiKey: "",
  aiCustomPrompt: "",
  usePixiRenderer: false,
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
        // Bug audit #12: sanitize before merging so corrupted or
        // hand-edited values (NaN, out-of-range, wrong enum) are
        // replaced with defaults instead of poisoning the store.
        set({ ...DEFAULTS, ...sanitizeSettings(saved) });
        return;
      }
      // Migration: fall back to old localStorage key
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        const clean = sanitizeSettings(parsed);
        set({ ...DEFAULTS, ...clean });
        // Migrate to new location — write the cleaned blob so we don't
        // carry the corruption forward.
        await writeJson("settings.json", { ...DEFAULTS, ...clean });
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
        tabHeight: state.tabHeight,
        tabMaxWidth: state.tabMaxWidth,
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
        unrolledShowEventSpanTints: state.unrolledShowEventSpanTints,
        onsetDetectionEnabled: state.onsetDetectionEnabled,
        // onsetSensitivity is deprecated — still serialized for schema compatibility,
        // but no code reads it any more (Phase A replaced it with the 4 fields below).
        // Remove this line + the SettingsState entry + DEFAULTS entry in the next release.
        onsetSensitivity: state.onsetSensitivity,
        onsetOpacity: state.onsetOpacity,
        onsetSnapToGrid: state.onsetSnapToGrid,
        onsetTargetDensity: state.onsetTargetDensity,
        onsetMinDisplayStrength: state.onsetMinDisplayStrength,
        onsetAbsFloor: state.onsetAbsFloor,
        onsetAdaptiveDelta: state.onsetAdaptiveDelta,
        recentColors: state.recentColors,
        recentEasings: state.recentEasings,
        favoriteEasings: state.favoriteEasings,
        aiEnabled: state.aiEnabled,
        aiMode: state.aiMode,
        aiEndpoint: state.aiEndpoint,
        aiModel: state.aiModel,
        aiTemperature: state.aiTemperature,
        aiMaxTokens: state.aiMaxTokens,
        aiApiKey: state.aiApiKey,
        aiCustomPrompt: state.aiCustomPrompt,
        usePixiRenderer: state.usePixiRenderer,
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

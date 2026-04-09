// ============================================================
// Favorites Store — Zustand
//
// Persistent user favorites for easings, presets, and shaders.
// Saved to localStorage under 'phichain-favorites'.
// On first load, migrates easing favorites from settingsStore.
// ============================================================

import { create } from "zustand";

const STORAGE_KEY = "phichain-favorites";
const MAX_RECENT_EASINGS = 8;

const DEFAULT_FAVORITE_EASINGS = [
  "linear",
  "ease_out_quad",
  "ease_in_out_sine",
  "ease_out_back",
  "ease_out_bounce",
];

const DEFAULT_FAVORITE_PRESETS = [
  "slide-in-left",
  "fade-in",
  "spin-360",
];

interface FavoritesData {
  hasCompletedFavoritesSetup: boolean;
  favoriteEasings: string[];
  recentEasings: string[];
  favoritePresetIds: string[];
  favoriteShaderIds: string[];
}

export interface FavoritesState extends FavoritesData {
  // ---- Wizard ----
  showFavoritesWizard: boolean;

  // ---- Actions ----
  completeSetup: () => void;
  openWizard: () => void;
  closeWizard: () => void;

  // ---- Easing favorites ----
  toggleFavoriteEasing: (easing: string) => void;
  setFavoriteEasings: (easings: string[]) => void;
  recordEasingUse: (easing: string) => void;
  isFavoriteEasing: (easing: string) => boolean;

  // ---- Preset favorites ----
  toggleFavoritePreset: (presetId: string) => void;
  setFavoritePresets: (presetIds: string[]) => void;
  isFavoritePreset: (presetId: string) => boolean;

  // ---- Shader favorites ----
  toggleFavoriteShader: (shaderId: string) => void;

  // ---- Persistence ----
  /** Load favorites from localStorage. Merges with defaults. */
  loadFavorites: () => void;
  /** Persist current favorites to localStorage. */
  saveFavorites: () => void;
}

function loadFromStorage(): Partial<FavoritesData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function migrateFromSettings(): { easings: string[]; recents: string[] } {
  try {
    const raw = localStorage.getItem("phichain-settings");
    if (!raw) return { easings: [], recents: [] };
    const data = JSON.parse(raw);
    return {
      easings: Array.isArray(data.favoriteEasings) ? data.favoriteEasings : [],
      recents: Array.isArray(data.recentEasings) ? data.recentEasings : [],
    };
  } catch {
    return { easings: [], recents: [] };
  }
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  // ---- Data ----
  hasCompletedFavoritesSetup: false,
  favoriteEasings: DEFAULT_FAVORITE_EASINGS,
  recentEasings: [],
  favoritePresetIds: DEFAULT_FAVORITE_PRESETS,
  favoriteShaderIds: [],
  showFavoritesWizard: false,

  // ---- Wizard ----
  completeSetup: () => {
    set({ hasCompletedFavoritesSetup: true, showFavoritesWizard: false });
    get().saveFavorites();
  },
  openWizard: () => set({ showFavoritesWizard: true }),
  closeWizard: () => set({ showFavoritesWizard: false }),

  // ---- Easing favorites ----
  toggleFavoriteEasing: (easing) => {
    set((s) => {
      const next = s.favoriteEasings.includes(easing)
        ? s.favoriteEasings.filter((e) => e !== easing)
        : [...s.favoriteEasings, easing];
      return { favoriteEasings: next };
    });
    get().saveFavorites();
  },

  setFavoriteEasings: (easings) => {
    set({ favoriteEasings: easings });
    get().saveFavorites();
  },

  recordEasingUse: (easing) => {
    set((s) => {
      const recents = [easing, ...s.recentEasings.filter((e) => e !== easing)]
        .slice(0, MAX_RECENT_EASINGS);
      return { recentEasings: recents };
    });
    get().saveFavorites();
  },

  isFavoriteEasing: (easing) => get().favoriteEasings.includes(easing),

  // ---- Preset favorites ----
  toggleFavoritePreset: (presetId) => {
    set((s) => {
      const next = s.favoritePresetIds.includes(presetId)
        ? s.favoritePresetIds.filter((id) => id !== presetId)
        : [...s.favoritePresetIds, presetId];
      return { favoritePresetIds: next };
    });
    get().saveFavorites();
  },

  setFavoritePresets: (presetIds) => {
    set({ favoritePresetIds: presetIds });
    get().saveFavorites();
  },

  isFavoritePreset: (presetId) => get().favoritePresetIds.includes(presetId),

  // ---- Shader favorites ----
  toggleFavoriteShader: (shaderId) => {
    set((s) => {
      const next = s.favoriteShaderIds.includes(shaderId)
        ? s.favoriteShaderIds.filter((id) => id !== shaderId)
        : [...s.favoriteShaderIds, shaderId];
      return { favoriteShaderIds: next };
    });
    get().saveFavorites();
  },

  // ---- Persistence ----
  loadFavorites: () => {
    const stored = loadFromStorage();
    if (Object.keys(stored).length > 0) {
      set(stored);
      return;
    }

    // Migrate from settingsStore if first run
    const migrated = migrateFromSettings();
    if (migrated.easings.length > 0 || migrated.recents.length > 0) {
      set({
        favoriteEasings: migrated.easings.length > 0
          ? migrated.easings
          : DEFAULT_FAVORITE_EASINGS,
        recentEasings: migrated.recents,
      });
    }
  },

  saveFavorites: () => {
    const s = get();
    const data: FavoritesData = {
      hasCompletedFavoritesSetup: s.hasCompletedFavoritesSetup,
      favoriteEasings: s.favoriteEasings,
      recentEasings: s.recentEasings,
      favoritePresetIds: s.favoritePresetIds,
      favoriteShaderIds: s.favoriteShaderIds,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  },
}));

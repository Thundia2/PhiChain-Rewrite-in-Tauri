// ============================================================
// Bookmark Store — Zustand
//
// Manages bookmarks: colored markers placed during tap-to-mark
// mode. Bookmarks are purely editorial markers — they don't
// affect chart rendering or gameplay. They persist via
// Canvas/bookmarks.json in .pez exports.
// ============================================================

import { create } from "zustand";
import type { Bookmark } from "../types/bookmark";
import { BOOKMARK_PRESETS } from "../types/bookmark";
import type { BookmarkPreset } from "../types/bookmark";
import type { Beat, NoteKind } from "../types/chart";
import { useChartStore } from "./chartStore";

export interface BookmarkState {
  bookmarks: Bookmark[];
  selectedBookmarkIds: string[];
  visibilityRange: number;
  latencyOffset: number;

  // ---- CRUD ----
  addBookmark: (beat: Beat, x: number, above: boolean, lineIndex: number, preset?: BookmarkPreset) => string;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, changes: Partial<Pick<Bookmark, "label" | "color" | "beat" | "x" | "above" | "preset">>) => void;
  clearBookmarks: () => void;

  // ---- Selection ----
  selectBookmark: (id: string) => void;
  selectBookmarks: (ids: string[]) => void;
  clearBookmarkSelection: () => void;
  toggleBookmarkSelection: (id: string) => void;

  // ---- Color ----
  setBookmarkColor: (id: string, preset: BookmarkPreset) => void;

  // ---- Visibility ----
  setVisibilityRange: (beats: number) => void;

  // ---- Latency ----
  setLatencyOffset: (ms: number) => void;

  // ---- Conversion ----
  convertToNotes: (bookmarkIds: string[]) => void;

  // ---- Bulk delete ----
  deleteSelected: () => void;

  // ---- Queries ----
  getBookmarksForLine: (lineIndex: number) => Bookmark[];

  // ---- Persistence ----
  getBookmarksJson: () => string;
  loadBookmarksJson: (json: string) => void;
}

const presetToNoteKind = (preset?: BookmarkPreset): NoteKind => {
  if (preset === "tap" || preset === "drag" || preset === "flick" || preset === "hold") {
    return preset;
  }
  return "tap"; // misc presets default to tap
};

export const useBookmarkStore = create<BookmarkState>()((set, get) => ({
  bookmarks: [],
  selectedBookmarkIds: [],
  visibilityRange: 2.0,
  latencyOffset: -40,

  addBookmark: (beat, x, above, lineIndex, preset) => {
    const id = crypto.randomUUID();
    const color = preset ? BOOKMARK_PRESETS[preset] : BOOKMARK_PRESETS.tap;
    const bookmark: Bookmark = { id, beat, x, above, lineIndex, color, preset: preset ?? "tap" };
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
    return id;
  },

  removeBookmark: (id) => {
    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => b.id !== id),
      selectedBookmarkIds: s.selectedBookmarkIds.filter((sid) => sid !== id),
    }));
  },

  updateBookmark: (id, changes) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) =>
        b.id === id ? { ...b, ...changes } : b,
      ),
    }));
  },

  clearBookmarks: () => {
    set({ bookmarks: [], selectedBookmarkIds: [] });
  },

  // ---- Selection ----
  selectBookmark: (id) => set({ selectedBookmarkIds: [id] }),
  selectBookmarks: (ids) => set({ selectedBookmarkIds: ids }),
  clearBookmarkSelection: () => set({ selectedBookmarkIds: [] }),
  toggleBookmarkSelection: (id) => {
    set((s) => {
      const idx = s.selectedBookmarkIds.indexOf(id);
      if (idx >= 0) {
        return { selectedBookmarkIds: s.selectedBookmarkIds.filter((sid) => sid !== id) };
      }
      return { selectedBookmarkIds: [...s.selectedBookmarkIds, id] };
    });
  },

  // ---- Color ----
  setBookmarkColor: (id, preset) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) =>
        b.id === id ? { ...b, color: BOOKMARK_PRESETS[preset], preset } : b,
      ),
    }));
  },

  // ---- Visibility ----
  setVisibilityRange: (beats) => set({ visibilityRange: Math.max(0.5, Math.min(8.0, beats)) }),

  // ---- Latency ----
  setLatencyOffset: (ms) => set({ latencyOffset: Math.max(-100, Math.min(0, ms)) }),

  // ---- Conversion ----
  convertToNotes: (bookmarkIds) => {
    const state = get();
    const cs = useChartStore.getState();
    const toConvert = state.bookmarks.filter((b) => bookmarkIds.includes(b.id));

    for (const bm of toConvert) {
      const kind = presetToNoteKind(bm.preset);
      cs.addNote(bm.lineIndex, {
        kind,
        beat: bm.beat,
        x: bm.x,
        above: bm.above,
        speed: 1,
      });
    }

    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => !bookmarkIds.includes(b.id)),
      selectedBookmarkIds: s.selectedBookmarkIds.filter((id) => !bookmarkIds.includes(id)),
    }));
  },

  // ---- Bulk delete ----
  deleteSelected: () => {
    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => !s.selectedBookmarkIds.includes(b.id)),
      selectedBookmarkIds: [],
    }));
  },

  getBookmarksForLine: (lineIndex) => {
    return get().bookmarks.filter((b) => b.lineIndex === lineIndex);
  },

  getBookmarksJson: () => JSON.stringify(get().bookmarks, null, 2),

  loadBookmarksJson: (json) => {
    try {
      const raw = JSON.parse(json) as Bookmark[];
      set({ bookmarks: raw, selectedBookmarkIds: [] });
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
    }
  },
}));

// Clear bookmarks when project is closed
let lastIsLoaded = false;
useChartStore.subscribe((state) => {
  if (lastIsLoaded && !state.isLoaded) {
    queueMicrotask(() => {
      const bs = useBookmarkStore.getState();
      bs.clearBookmarks();
    });
  }
  lastIsLoaded = state.isLoaded;
});

// ============================================================
// Bookmark Store — Zustand
//
// Manages bookmarks: colored markers placed during tap-to-mark
// mode. Bookmarks are purely editorial markers — they don't
// affect chart rendering or gameplay. They persist via
// Canvas/bookmarks.json in .pez exports.
//
// Recent change: Added undo/redo history stacks with shared
// sequence tracking (via undoSequence.ts) so Ctrl+Z/Ctrl+Y
// correctly interleaves bookmark and chart undo operations.
// ============================================================

import { create } from "zustand";
import type { Bookmark } from "../types/bookmark";
import { BOOKMARK_PRESETS } from "../types/bookmark";
import type { BookmarkPreset } from "../types/bookmark";
import type { Beat, NoteKind } from "../types/chart";
import { useChartStore } from "./chartStore";
import { nextUndoSeq } from "../utils/undoSequence";

// Maximum bookmark undo history depth (matches chartStore)
const MAX_BOOKMARK_HISTORY = 200;

export interface BookmarkState {
  bookmarks: Bookmark[];
  selectedBookmarkIds: string[];
  visibilityRange: number;
  latencyOffset: number;

  // ---- Undo/redo stacks ----
  _past: Bookmark[][];
  _future: Bookmark[][];
  /** Parallel sequence arrays — each entry's index matches the corresponding _past/_future entry */
  _pastSeqs: number[];
  _futureSeqs: number[];

  // ---- CRUD ----
  /** Create a bookmark at the given beat/position. Returns the new bookmark ID. */
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
  /** Convert bookmarks to real notes on their assigned lines. Adds notes via chartStore. */
  convertToNotes: (bookmarkIds: string[]) => void;

  // ---- Bulk delete ----
  deleteSelected: () => void;

  // ---- Undo/redo ----
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

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

// ---- Helper: build undo state snapshot (push current bookmarks onto _past, clear _future) ----
function undoPush(s: BookmarkState): Pick<BookmarkState, "_past" | "_future" | "_pastSeqs" | "_futureSeqs"> {
  const newPast = [...s._past, s.bookmarks];
  const newPastSeqs = [...s._pastSeqs, nextUndoSeq()];
  // Trim to max history
  if (newPast.length > MAX_BOOKMARK_HISTORY) {
    newPast.shift();
    newPastSeqs.shift();
  }
  return { _past: newPast, _future: [], _pastSeqs: newPastSeqs, _futureSeqs: [] };
}

export const useBookmarkStore = create<BookmarkState>()((set, get) => ({
  bookmarks: [],
  selectedBookmarkIds: [],
  visibilityRange: 2.0,
  latencyOffset: -40,
  _past: [],
  _future: [],
  _pastSeqs: [],
  _futureSeqs: [],

  addBookmark: (beat, x, above, lineIndex, preset) => {
    const id = crypto.randomUUID();
    const color = preset ? BOOKMARK_PRESETS[preset] : BOOKMARK_PRESETS.tap;
    const bookmark: Bookmark = { id, beat, x, above, lineIndex, color, preset: preset ?? "tap" };
    set((s) => ({
      bookmarks: [...s.bookmarks, bookmark],
      ...undoPush(s),
    }));
    return id;
  },

  removeBookmark: (id) => {
    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => b.id !== id),
      selectedBookmarkIds: s.selectedBookmarkIds.filter((sid) => sid !== id),
      ...undoPush(s),
    }));
  },

  updateBookmark: (id, changes) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) =>
        b.id === id ? { ...b, ...changes } : b,
      ),
      ...undoPush(s),
    }));
  },

  // clearBookmarks is a project-lifecycle action — resets undo stacks, not undoable itself
  clearBookmarks: () => {
    set({ bookmarks: [], selectedBookmarkIds: [], _past: [], _future: [], _pastSeqs: [], _futureSeqs: [] });
  },

  // ---- Selection (no undo — selection is ephemeral) ----
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
      ...undoPush(s),
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

    // Push undo before removing bookmarks (note addition is separately undoable via chartStore)
    set((s) => ({
      bookmarks: s.bookmarks.filter((b) => !bookmarkIds.includes(b.id)),
      selectedBookmarkIds: s.selectedBookmarkIds.filter((id) => !bookmarkIds.includes(id)),
      ...undoPush(s),
    }));
  },

  // ---- Bulk delete ----
  deleteSelected: () => {
    set((s) => {
      // No-op if nothing selected (avoids polluting undo stack)
      if (s.selectedBookmarkIds.length === 0) return s;
      return {
        bookmarks: s.bookmarks.filter((b) => !s.selectedBookmarkIds.includes(b.id)),
        selectedBookmarkIds: [],
        ...undoPush(s),
      };
    });
  },

  // ---- Undo/redo ----
  undo: () => {
    set((s) => {
      if (s._past.length === 0) return s;
      const prev = s._past[s._past.length - 1];
      const prevSeq = s._pastSeqs[s._pastSeqs.length - 1];
      return {
        bookmarks: prev,
        selectedBookmarkIds: [],
        _past: s._past.slice(0, -1),
        _future: [...s._future, s.bookmarks],
        _pastSeqs: s._pastSeqs.slice(0, -1),
        _futureSeqs: [...s._futureSeqs, prevSeq],
      };
    });
  },

  redo: () => {
    set((s) => {
      if (s._future.length === 0) return s;
      const next = s._future[s._future.length - 1];
      const nextSeq = s._futureSeqs[s._futureSeqs.length - 1];
      return {
        bookmarks: next,
        selectedBookmarkIds: [],
        _past: [...s._past, s.bookmarks],
        _future: s._future.slice(0, -1),
        _pastSeqs: [...s._pastSeqs, nextSeq],
        _futureSeqs: s._futureSeqs.slice(0, -1),
      };
    });
  },

  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,

  getBookmarksForLine: (lineIndex) => {
    return get().bookmarks.filter((b) => b.lineIndex === lineIndex);
  },

  getBookmarksJson: () => JSON.stringify(get().bookmarks, null, 2),

  // loadBookmarksJson is a project-lifecycle action — resets undo stacks.
  // Validates parsed data to reject corrupted project files.
  loadBookmarksJson: (json) => {
    try {
      const raw = JSON.parse(json);
      // Validate: must be an array of objects with required bookmark fields
      if (!Array.isArray(raw)) {
        console.error("Failed to load bookmarks: expected an array");
        return;
      }
      const valid = raw.filter(
        (b) => b && typeof b === "object" && Array.isArray(b.beat) && b.beat.length === 3
      );
      set({ bookmarks: valid as Bookmark[], selectedBookmarkIds: [], _past: [], _future: [], _pastSeqs: [], _futureSeqs: [] });
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

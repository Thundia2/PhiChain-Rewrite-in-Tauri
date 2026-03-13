// ============================================================
// Recent Projects Store — Zustand + localStorage
//
// Tracks recently opened/imported charts for the home screen.
// Persists to localStorage, max 10 entries.
// ============================================================

import { create } from "zustand";
import { deleteStoredProject } from "../utils/projectStorage";

export interface RecentProject {
  id: string;
  name: string;
  composer: string;
  level: string;
  lineCount: number;
  noteCount: number;
  timestamp: number;
  importType: "new" | "rpe" | "pec" | "official";
}

interface RecentProjectsState {
  projects: RecentProject[];
  addRecent: (entry: Omit<RecentProject, "timestamp">) => void;
  clearAll: () => void;
  removeOne: (timestamp: number) => void;
}

const STORAGE_KEY = "phichain-recent-projects";
const MAX_ENTRIES = 10;

function loadFromStorage(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrate old entries without id
    return parsed.slice(0, MAX_ENTRIES).map((p: RecentProject) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
    }));
  } catch {
    return [];
  }
}

function saveToStorage(projects: RecentProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore quota errors
  }
}

export const useRecentProjectsStore = create<RecentProjectsState>()((set, get) => ({
  projects: loadFromStorage(),

  addRecent: (entry) => {
    set((state) => {
      // Remove existing entry with same id or same name+composer to avoid duplicates
      const filtered = state.projects.filter(
        (p) => p.id !== entry.id && !(p.name === entry.name && p.composer === entry.composer),
      );
      const updated = [{ ...entry, timestamp: Date.now() }, ...filtered].slice(
        0,
        MAX_ENTRIES,
      );
      saveToStorage(updated);
      return { projects: updated };
    });
  },

  clearAll: () => {
    for (const p of get().projects) {
      deleteStoredProject(p.id).catch(() => {});
    }
    saveToStorage([]);
    set({ projects: [] });
  },

  removeOne: (timestamp) => {
    set((state) => {
      const toRemove = state.projects.find((p) => p.timestamp === timestamp);
      if (toRemove) {
        deleteStoredProject(toRemove.id).catch(() => {});
      }
      const updated = state.projects.filter((p) => p.timestamp !== timestamp);
      saveToStorage(updated);
      return { projects: updated };
    });
  },
}));

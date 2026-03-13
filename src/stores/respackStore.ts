// ============================================================
// Respack Store — Zustand + IndexedDB
//
// Manages imported resource packs (note textures, hit effects).
// Raw zip data persisted in IndexedDB; images decoded in memory.
// Selection persisted in localStorage.
//
// Usage:
//   const respack = useRespackStore(s => s.getActiveRespack());
//   const importRespack = useRespackStore(s => s.importRespack);
// ============================================================

import { create } from "zustand";
import { extractRespack } from "../utils/respackLoader";
import type { LoadedRespack } from "../utils/respackLoader";

export type { LoadedRespack };

// ============================================================
// IndexedDB Layer
// ============================================================

const DB_NAME = "phichain-respacks";
const DB_VERSION = 1;
const STORE_NAME = "respacks";
const SELECTION_KEY = "phichain-selected-respack";

interface RespackDbEntry {
  id: string;
  zipData: ArrayBuffer;
  configJson: string;
  addedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(entry: RespackDbEntry): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbGetAll(): Promise<RespackDbEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ============================================================
// Store
// ============================================================

export interface RespackState {
  respacks: Map<string, LoadedRespack>;
  selectedId: string | null;
  isLoading: boolean;

  getActiveRespack: () => LoadedRespack | null;
  importRespack: (zipData: ArrayBuffer) => Promise<string>;
  deleteRespack: (id: string) => Promise<void>;
  selectRespack: (id: string | null) => void;
  initFromDb: () => Promise<void>;
}

export const useRespackStore = create<RespackState>()((set, get) => ({
  respacks: new Map(),
  selectedId: null,
  isLoading: false,

  getActiveRespack: () => {
    const { respacks, selectedId } = get();
    if (!selectedId) return null;
    return respacks.get(selectedId) ?? null;
  },

  importRespack: async (zipData: ArrayBuffer) => {
    const id = crypto.randomUUID();
    const { config, textures, sounds } = await extractRespack(zipData);
    const loaded: LoadedRespack = { id, config, textures, sounds };

    // Save to IndexedDB
    try {
      await dbPut({
        id,
        zipData,
        configJson: JSON.stringify(config),
        addedAt: Date.now(),
      });
    } catch (err) {
      console.warn("Failed to persist respack to IndexedDB:", err);
    }

    set((state) => {
      const newMap = new Map(state.respacks);
      newMap.set(id, loaded);
      return { respacks: newMap, selectedId: id };
    });

    // Persist selection
    try { localStorage.setItem(SELECTION_KEY, id); } catch { /* ignore */ }

    return id;
  },

  deleteRespack: async (id: string) => {
    try { await dbDelete(id); } catch (err) {
      console.warn("Failed to delete respack from IndexedDB:", err);
    }

    set((state) => {
      const newMap = new Map(state.respacks);
      newMap.delete(id);
      const newSelectedId = state.selectedId === id ? null : state.selectedId;
      if (newSelectedId === null) {
        try { localStorage.removeItem(SELECTION_KEY); } catch { /* ignore */ }
      }
      return { respacks: newMap, selectedId: newSelectedId };
    });
  },

  selectRespack: (id: string | null) => {
    set({ selectedId: id });
    try {
      if (id) {
        localStorage.setItem(SELECTION_KEY, id);
      } else {
        localStorage.removeItem(SELECTION_KEY);
      }
    } catch { /* ignore */ }
  },

  initFromDb: async () => {
    set({ isLoading: true });
    try {
      const entries = await dbGetAll();
      const newMap = new Map<string, LoadedRespack>();

      for (const entry of entries) {
        try {
          const { config, textures, sounds } = await extractRespack(entry.zipData);
          newMap.set(entry.id, { id: entry.id, config, textures, sounds });
        } catch (err) {
          console.warn(`Failed to load respack ${entry.id}:`, err);
        }
      }

      // Restore selection
      let selectedId: string | null = null;
      try {
        selectedId = localStorage.getItem(SELECTION_KEY);
        if (selectedId && !newMap.has(selectedId)) selectedId = null;
      } catch { /* ignore */ }

      set({ respacks: newMap, selectedId, isLoading: false });
    } catch (err) {
      console.warn("Failed to initialize respacks from IndexedDB:", err);
      set({ isLoading: false });
    }
  },
}));

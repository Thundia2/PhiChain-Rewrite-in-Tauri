// ============================================================
// Toast Store — Lightweight notification system
//
// Usage from anywhere (including outside React):
//   useToastStore.getState().addToast({ message: "...", type: "error" })
// ============================================================

import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  type: "error" | "info" | "success";
  duration: number;
}

export interface HistoryEntry {
  id: string;
  message: string;
  type: Toast["type"];
  timestamp: number;
}

interface ToastState {
  toasts: Toast[];
  history: HistoryEntry[];
  addToast: (opts: { message: string; type: Toast["type"]; duration?: number }) => void;
  removeToast: (id: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 100;

const DEFAULT_DURATION: Record<Toast["type"], number> = {
  error: 4000,
  info: 3000,
  success: 3000,
};

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  history: [],

  addToast: ({ message, type, duration }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, type, duration: duration ?? DEFAULT_DURATION[type] };

    set((s) => ({
      toasts: [...s.toasts.slice(-4), toast], // max 5
      history: [...s.history.slice(-(MAX_HISTORY - 1)), { id, message, type, timestamp: Date.now() }],
    }));
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearHistory: () => {
    set({ history: [] });
  },
}));

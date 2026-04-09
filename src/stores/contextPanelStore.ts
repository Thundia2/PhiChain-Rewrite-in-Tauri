// ============================================================
// Context Panel Store — Zustand
//
// Ephemeral UI state for the context panel sidebar.
// Not persisted — resets on app restart.
// ============================================================

import { create } from "zustand";
import { useToastStore } from "./toastStore";

const MAX_PINNED_ITEMS = 4;

export interface ContextPanelState {
  // ---- Visibility ----
  collapsed: boolean;
  poppedOut: boolean;

  // ---- Tab state per mode ----
  // Key = mode name (global/line/note/event/multi), value = active tab id
  activeTabByMode: Record<string, string>;

  // ---- Pinned misc items (max 4) ----
  pinnedMiscItems: string[];

  // ---- Actions ----
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setPoppedOut: (poppedOut: boolean) => void;
  setActiveTab: (mode: string, tabId: string) => void;
  getActiveTab: (mode: string, defaultTab: string) => string;
  pinMiscItem: (itemId: string) => void;
  unpinMiscItem: (itemId: string) => void;
  togglePinMiscItem: (itemId: string) => void;
}

export const useContextPanelStore = create<ContextPanelState>()((set, get) => ({
  collapsed: false,
  poppedOut: false,
  activeTabByMode: {},
  pinnedMiscItems: [],

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPoppedOut: (poppedOut) => set({ poppedOut }),

  setActiveTab: (mode, tabId) =>
    set((s) => ({
      activeTabByMode: { ...s.activeTabByMode, [mode]: tabId },
    })),

  getActiveTab: (mode, defaultTab) => {
    return get().activeTabByMode[mode] ?? defaultTab;
  },

  pinMiscItem: (itemId) =>
    set((s) => {
      if (s.pinnedMiscItems.includes(itemId)) return s;
      if (s.pinnedMiscItems.length >= MAX_PINNED_ITEMS) {
        useToastStore.getState().addToast({
          message: `Unpin an item first (max ${MAX_PINNED_ITEMS})`,
          type: "warning",
        });
        return s;
      }
      return { pinnedMiscItems: [...s.pinnedMiscItems, itemId] };
    }),

  unpinMiscItem: (itemId) =>
    set((s) => ({
      pinnedMiscItems: s.pinnedMiscItems.filter((id) => id !== itemId),
    })),

  // Fixed: was calling two separate store actions (non-atomic).
  // Now uses a single set() call to avoid race conditions under rapid clicks.
  togglePinMiscItem: (itemId) =>
    set((s) => {
      if (s.pinnedMiscItems.includes(itemId)) {
        return { pinnedMiscItems: s.pinnedMiscItems.filter((id) => id !== itemId) };
      }
      if (s.pinnedMiscItems.length >= MAX_PINNED_ITEMS) {
        useToastStore.getState().addToast({
          message: `Unpin an item first (max ${MAX_PINNED_ITEMS})`,
          type: "warning",
        });
        return s;
      }
      return { pinnedMiscItems: [...s.pinnedMiscItems, itemId] };
    }),
}));

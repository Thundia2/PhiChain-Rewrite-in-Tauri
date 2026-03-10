// ============================================================
// Tab Store — Zustand
//
// Manages browser-like tabs: Home, Chart(s), Settings, Line Event Editor.
// Home tab is always present and not closable.
//
// Usage:
//   const tabs = useTabStore(s => s.tabs);
//   const activeTabId = useTabStore(s => s.activeTabId);
//   const openSettings = useTabStore(s => s.openSettings);
// ============================================================

import { create } from "zustand";
import { useSettingsStore } from "./settingsStore";

export type TabType = "home" | "chart" | "settings" | "line_event_editor" | "panel" | "unified_editor";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  closable: boolean;
  data?: Record<string, unknown>;
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string;

  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabLabel: (tabId: string, label: string) => void;

  // Convenience
  openSettings: () => void;
  openChart: (chartId: string, label: string) => void;
  openLineEventEditor: (lineIndex: number, lineName: string) => void;
  openPanel: (panelId: string, label: string) => void;
  openUnifiedEditor: () => void;
}

const HOME_TAB: Tab = { id: "home", type: "home", label: "Home", closable: false };

export const useTabStore = create<TabState>()((set, get) => ({
  tabs: [HOME_TAB],
  activeTabId: "home",

  openTab: (tab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      set({ activeTabId: tab.id });
      return;
    }
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || !tab.closable) return;

    const newTabs = tabs.filter((t) => t.id !== tabId);
    if (activeTabId === tabId) {
      // Switch to the previous tab or home
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newActive = newTabs[Math.max(0, idx - 1)]?.id ?? "home";
      set({ tabs: newTabs, activeTabId: newActive });
    } else {
      set({ tabs: newTabs });
    }
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabLabel: (tabId, label) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    }));
  },

  openSettings: () => {
    get().openTab({ id: "settings", type: "settings", label: "Settings", closable: true });
  },

  openChart: (chartId, label) => {
    const defaultView = useSettingsStore.getState().defaultEditorView;
    if (defaultView === "unified") {
      // Open the unified editor tab for this chart
      get().openTab({
        id: "unified-editor",
        type: "unified_editor",
        label: label || "Unified Editor",
        closable: true,
      });
    } else {
      get().openTab({
        id: `chart:${chartId}`,
        type: "chart",
        label: label || "Untitled Chart",
        closable: true,
      });
    }
  },

  openLineEventEditor: (lineIndex, lineName) => {
    get().openTab({
      id: `line-events:${lineIndex}`,
      type: "line_event_editor",
      label: `Events: ${lineName}`,
      closable: true,
      data: { lineIndex },
    });
  },

  openPanel: (panelId, label) => {
    get().openTab({
      id: `panel:${panelId}`,
      type: "panel",
      label,
      closable: true,
      data: { panelId },
    });
  },

  openUnifiedEditor: () => {
    get().openTab({
      id: "unified-editor",
      type: "unified_editor",
      label: "Unified Editor",
      closable: true,
    });
  },
}));

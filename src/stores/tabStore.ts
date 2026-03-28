// ============================================================
// Tab Store — Zustand
//
// Manages browser-like tabs: Home, Chart(s), Line Event Editor, Panels.
// Home tab is always present and not closable.
//
// Usage:
//   const tabs = useTabStore(s => s.tabs);
//   const activeTabId = useTabStore(s => s.activeTabId);
// ============================================================

import { create } from "zustand";
import { useSettingsStore } from "./settingsStore";

export type TabType = "home" | "chart" | "line_event_editor" | "panel" | "unified_editor";

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
  openChart: (chartId: string, label: string) => void;
  openLineEventEditor: (lineIndex: number, lineName: string) => void;
  openPanel: (panelId: string, label: string) => void;
  openUnifiedEditor: () => void;

  /** Get the tab ID that would be used for a given chartId under current settings */
  getChartTabId: (chartId: string) => string;
}

const HOME_TAB: Tab = { id: "home", type: "home", label: "Home", closable: false };

export const useTabStore = create<TabState>()((set, get) => ({
  tabs: [HOME_TAB],
  activeTabId: "home",

  openTab: (tab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      // Update label + data if they changed
      set({
        activeTabId: tab.id,
        tabs: tabs.map((t) =>
          t.id === tab.id ? { ...t, label: tab.label, data: tab.data ?? t.data } : t
        ),
      });
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

  openChart: (chartId, label) => {
    const defaultView = useSettingsStore.getState().defaultEditorView;
    if (defaultView === "unified") {
      get().openTab({
        id: `unified:${chartId}`,
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
    const { tabs, activeTabId } = get();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    let chartId = "current";
    let label = "Unified Editor";
    if (activeTab?.type === "chart" && activeTab.id.startsWith("chart:")) {
      chartId = activeTab.id.slice("chart:".length);
      label = activeTab.label;
    }
    get().openTab({
      id: `unified:${chartId}`,
      type: "unified_editor",
      label,
      closable: true,
    });
  },

  getChartTabId: (chartId) => {
    const defaultView = useSettingsStore.getState().defaultEditorView;
    return defaultView === "unified" ? `unified:${chartId}` : `chart:${chartId}`;
  },
}));

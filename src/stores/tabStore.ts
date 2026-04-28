// ============================================================
// Tab Store — Zustand
//
// Manages browser-like tabs: Home, Chart(s), Line Event Editor, Panels.
// Home tab is always present and not closable.
//
// Recent change: Added renamingTabId state + startRenameTab() /
// clearRenaming() for inline tab rename triggered from command
// palette (F2) or double-click. Also cleaned up per-line label
// to remove redundant "Unrolled:" prefix (badge now shows type).
//
// Usage:
//   const tabs = useTabStore(s => s.tabs);
//   const activeTabId = useTabStore(s => s.activeTabId);
// ============================================================

import { create } from "zustand";
import { useSettingsStore } from "./settingsStore";
import { useEditorStore } from "./editorStore";

export type TabType = "home" | "chart" | "line_event_editor" | "panel" | "unified_editor" | "unrolled_editor";

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

  /** Open or focus a tab. Creates if new, updates label/data if existing. */
  openTab: (tab: Tab) => void;
  /** Close a tab. Falls back to adjacent tab or Home if the closed tab was active. */
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabLabel: (tabId: string, label: string) => void;

  // Convenience — typed wrappers around openTab
  openChart: (chartId: string, label: string) => void;
  openLineEventEditor: (lineIndex: number, lineName: string) => void;
  openPanel: (panelId: string, label: string) => void;
  openUnifiedEditor: () => void;
  openUnrolledEditor: () => void;
  /** Open a per-line unrolled editor tab. Creates a tab locked to lineIndex. */
  openUnrolledLineEditor: (lineIndex: number, lineName: string, initialScrollBeat: number) => void;

  /** Get the tab ID that would be used for a given chartId under current settings */
  getChartTabId: (chartId: string) => string;

  // ---- Inline rename ----
  /** ID of the tab currently being renamed (null if none) */
  renamingTabId: string | null;
  /** Enter rename mode for a tab. Defaults to active tab. Only closable tabs allowed. */
  startRenameTab: (tabId?: string) => void;
  /** Exit rename mode without committing */
  clearRenaming: () => void;
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

    // Clean up per-line unrolled tab state when closed
    if (tab.id.startsWith("unrolled-line:") && tab.data?.lineIndex !== undefined) {
      const li = tab.data.lineIndex as number;
      useEditorStore.getState().clearLineTabScrollBeat(li);
      useEditorStore.getState().clearUnrolledFollowPlayback(String(li));
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
    } else if (defaultView === "unrolled") {
      get().openTab({
        id: `unrolled:${chartId}`,
        type: "unrolled_editor",
        label: label || "Unrolled Editor",
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
    // Extract chartId from any chart-like tab (including unrolled_editor)
    if (
      activeTab?.type === "chart" ||
      activeTab?.type === "unified_editor" ||
      activeTab?.type === "unrolled_editor"
    ) {
      chartId = activeTab.id.split(":").slice(1).join(":") || "current";
      label = activeTab.label;
    }
    get().openTab({
      id: `unified:${chartId}`,
      type: "unified_editor",
      label,
      closable: true,
    });
  },

  openUnrolledEditor: () => {
    const { tabs, activeTabId } = get();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    let chartId = "current";
    let label = "Unrolled Editor";
    // Extract chartId from any chart-like tab (including itself)
    if (
      activeTab?.type === "chart" ||
      activeTab?.type === "unified_editor" ||
      activeTab?.type === "unrolled_editor"
    ) {
      chartId = activeTab.id.split(":").slice(1).join(":") || "current";
      label = activeTab.label;
    }
    get().openTab({
      id: `unrolled:${chartId}`,
      type: "unrolled_editor",
      label,
      closable: true,
    });
  },

  openUnrolledLineEditor: (lineIndex, lineName, initialScrollBeat) => {
    // Initialize per-tab scroll beat if this is the first open
    const es = useEditorStore.getState();
    if (es.lineTabScrollBeats[lineIndex] === undefined) {
      es.setLineTabScrollBeat(lineIndex, initialScrollBeat);
    }
    get().openTab({
      id: `unrolled-line:${lineIndex}`,
      type: "unrolled_editor",
      label: lineName,
      closable: true,
      data: { lineIndex },
    });
  },

  getChartTabId: (chartId) => {
    const defaultView = useSettingsStore.getState().defaultEditorView;
    if (defaultView === "unified") return `unified:${chartId}`;
    if (defaultView === "unrolled") return `unrolled:${chartId}`;
    return `chart:${chartId}`;
  },

  // ---- Inline rename ----
  renamingTabId: null,

  startRenameTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const targetId = tabId ?? activeTabId;
    const tab = tabs.find((t) => t.id === targetId);
    // Only allow renaming closable (non-system) tabs
    if (!tab || !tab.closable) return;
    set({ renamingTabId: targetId });
  },

  clearRenaming: () => set({ renamingTabId: null }),
}));

// ============================================================
// Chart group key — used by App.tsx to detect when two tab IDs
// reference the same underlying chart, so it can skip saving and
// restoring sessions on view switches that don't change the chart.
//
// Tab IDs follow patterns set by openChart / openUnifiedEditor /
// openUnrolledEditor / openUnrolledLineEditor / openLineEventEditor /
// openPanel. Stripping the type prefix yields the chart identifier
// (or "current" for tabs that always reference the loaded chart —
// per-line unrolled tabs, line-events tabs, and panel tabs).
//
// Returns null for tabs that aren't tied to any chart (only "home"
// today, but new system tabs would also fall here).
// ============================================================
export function chartGroupKey(tabId: string): string | null {
  if (tabId.startsWith("chart:")) return tabId.slice("chart:".length);
  if (tabId.startsWith("unified:")) return tabId.slice("unified:".length);
  if (tabId.startsWith("unrolled:")) return tabId.slice("unrolled:".length);
  // Per-line unrolled, line-events, and panel tabs reference whatever
  // chart is currently loaded. Treat them as part of the "current"
  // group, matching the default chartId used by openUnified/openUnrolled
  // when the active tab isn't chart-like (see openUnifiedEditor above).
  if (tabId.startsWith("unrolled-line:")) return "current";
  if (tabId.startsWith("line-events:")) return "current";
  if (tabId.startsWith("panel:")) return "current";
  return null;
}

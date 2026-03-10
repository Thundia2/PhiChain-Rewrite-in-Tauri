import { useState, useCallback, useEffect, useRef } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  getLeaves,
  createBalancedTreeFromLeaves,
  RemoveButton,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";

import type { PanelId } from "./types/editor";
import { useChartStore } from "./stores/chartStore";
import { useTabStore } from "./stores/tabStore";
import {
  saveSession,
  restoreSession,
  deleteSession,
  shouldSkipSave,
} from "./utils/chartSessions";

import { MenuBar } from "./components/MenuBar/MenuBar";
import { TabBar } from "./components/TabBar/TabBar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { QuickActionBar } from "./components/QuickActionBar/QuickActionBar";
import { PanelPlaceholder } from "./components/common/PanelPlaceholder";
import { CustomExpandButton } from "./components/common/CustomExpandButton";
import { GamePreview } from "./components/GamePreview/GamePreview";
import { GamePreviewTab } from "./components/GamePreview/GamePreviewTab";
import { Timeline } from "./components/Timeline/Timeline";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { LineList } from "./components/LineList/LineList";
import { Inspector } from "./components/Inspector/Inspector";
import { TimelineSettings } from "./components/TimelineSettings/TimelineSettings";
import { BpmListPanel } from "./components/BpmList/BpmList";
import { ChartSettings } from "./components/ChartSettings/ChartSettings";
import { NewProjectDialog } from "./components/NewProjectDialog/NewProjectDialog";
import { HomeScreen } from "./components/Home/HomeScreen";
import { SettingsPage } from "./components/Settings/SettingsPage";
import { LineEventEditor } from "./components/LineEventEditor/LineEventEditor";
import { UnifiedEditorTab } from "./components/UnifiedCanvas/UnifiedEditorTab";
import { ValidationPanel } from "./components/Validation/ValidationPanel";
import { useGlobalHotkeys } from "./hooks/useHotkeys";
import { useClipboard } from "./hooks/useClipboard";

// ============================================================
// CONFIGURABLE: Default panel layout
// ============================================================
const DEFAULT_LAYOUT: MosaicNode<PanelId> = {
  direction: "row",
  first: {
    direction: "column",
    first: "line-list",
    second: "toolbar",
    splitPercentage: 75,
  },
  second: {
    direction: "row",
    first: "timeline",
    second: {
      direction: "column",
      first: "game-preview",
      second: {
        direction: "row",
        first: "inspector",
        second: "timeline-settings",
        splitPercentage: 50,
      },
      splitPercentage: 60,
    },
    splitPercentage: 55,
  },
  splitPercentage: 15,
};

// ============================================================
// CONFIGURABLE: Panel display names
// ============================================================
const PANEL_TITLES: Record<PanelId, string> = {
  "game-preview": "Preview",
  "timeline": "Timeline",
  "inspector": "Inspector",
  "line-list": "Line List",
  "toolbar": "Toolbar",
  "timeline-settings": "Timeline Settings",
  "bpm-list": "BPM List",
  "chart-settings": "Chart Settings",
  "hotkey-reference": "Hotkey Reference",
  "validation": "Validation",
};

function renderPanel(id: PanelId) {
  switch (id) {
    case "game-preview":
      return <GamePreview />;
    case "timeline":
      return <Timeline />;
    case "inspector":
      return <Inspector />;
    case "line-list":
      return <LineList />;
    case "toolbar":
      return <Toolbar />;
    case "timeline-settings":
      return <TimelineSettings />;
    case "bpm-list":
      return <BpmListPanel />;
    case "chart-settings":
      return <ChartSettings />;
    case "validation":
      return <ValidationPanel />;
    default:
      return <PanelPlaceholder name={PANEL_TITLES[id]} description="Coming soon" color="var(--text-muted)" />;
  }
}

/** Render a standalone panel tab based on its panelId */
function renderPanelTab(panelId: string) {
  switch (panelId as PanelId) {
    case "game-preview":
      return <GamePreviewTab />;
    case "timeline":
      return <Timeline />;
    case "inspector":
      return <Inspector />;
    case "line-list":
      return <LineList />;
    case "toolbar":
      return <Toolbar />;
    case "timeline-settings":
      return <TimelineSettings />;
    case "bpm-list":
      return <BpmListPanel />;
    case "chart-settings":
      return <ChartSettings />;
    case "validation":
      return <ValidationPanel />;
    default:
      return (
        <PanelPlaceholder
          name={PANEL_TITLES[panelId as PanelId] ?? panelId}
          description="Standalone view"
          color="var(--text-muted)"
        />
      );
  }
}

/**
 * Find the chart tab ID associated with a given tab.
 * Panel tabs and line-event-editor tabs belong to the currently active chart.
 */
function getChartTabId(tab: { id: string; type: string }): string | null {
  if (tab.type === "chart") return tab.id;
  // Panel and line_event_editor tabs are tied to the current chart context
  // They share the same chart session as the chart tab
  return null;
}

export default function App() {
  const [layout, setLayout] = useState<MosaicNode<PanelId> | null>(DEFAULT_LAYOUT);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedPanelId, setExpandedPanelId] = useState<PanelId | null>(null);
  const savedLayoutRef = useRef<MosaicNode<PanelId> | null>(null);
  const prevTabIdRef = useRef<string | null>(null);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const openSettings = useTabStore((s) => s.openSettings);
  const openPanel = useTabStore((s) => s.openPanel);
  const isLoaded = useChartStore((s) => s.isLoaded);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useGlobalHotkeys({ onNewChart: () => setShowNewProject(true) });
  useClipboard();

  // ---- Multi-chart session management ----
  // When the active tab changes, save the old chart's state and restore
  // the new chart's state.
  useEffect(() => {
    const prevTabId = prevTabIdRef.current;
    prevTabIdRef.current = activeTabId;

    // Skip if same tab
    if (prevTabId === activeTabId) return;
    if (prevTabId === null) return;

    const prevTab = tabs.find((t) => t.id === prevTabId);
    const newTab = tabs.find((t) => t.id === activeTabId);

    // If NewProjectDialog already saved the session, skip the automatic save
    if (shouldSkipSave()) {
      // Flag consumed — fall through to restore only
    } else if (prevTab && (prevTab.type === "chart" || prevTab.type === "panel" || prevTab.type === "line_event_editor" || prevTab.type === "unified_editor")) {
      // Save session when leaving a chart tab (or chart-related tab)
      const chartTabs = tabs.filter((t) => t.type === "chart");
      // For panel/line_event_editor tabs, save under the most recent chart tab
      const saveId = prevTab.type === "chart"
        ? prevTab.id
        : chartTabs.length > 0 ? chartTabs[chartTabs.length - 1].id : null;
      if (saveId && isLoaded) {
        saveSession(saveId);
      }
    }

    // Restore session when entering a chart tab
    if (newTab && newTab.type === "chart") {
      restoreSession(newTab.id).catch((err) => {
        console.warn("[App] Failed to restore chart session:", err);
      });
    }
  }, [activeTabId, tabs, isLoaded]);

  // When chart is closed, close chart tabs, panel tabs, and clean up sessions
  useEffect(() => {
    if (!isLoaded) {
      const tabState = useTabStore.getState();
      const chartTabs = tabState.tabs.filter(
        (t) => t.type === "chart" || t.type === "line_event_editor" || t.type === "panel" || t.type === "unified_editor",
      );
      for (const t of chartTabs) {
        deleteSession(t.id);
        tabState.closeTab(t.id);
      }
    }
  }, [isLoaded]);

  // Clean up sessions when individual tabs are closed
  useEffect(() => {
    const tabIds = new Set(tabs.map((t) => t.id));
    // We can't easily iterate the session map here, but we can
    // clean up when tabs disappear. The deleteSession calls are
    // handled via the closeProject flow above and closeTab handler below.
  }, [tabs]);

  /** Handle first-click expand: save layout, maximize the panel */
  const handleExpand = useCallback(
    (panelId: PanelId) => {
      savedLayoutRef.current = layout;
      setExpandedPanelId(panelId);
    },
    [layout],
  );

  /** Handle collapse: restore layout from before expand */
  const handleCollapse = useCallback(() => {
    if (savedLayoutRef.current) {
      setLayout(savedLayoutRef.current);
      savedLayoutRef.current = null;
    }
    setExpandedPanelId(null);
  }, []);

  /** Handle second-click expand: open as tab, restore layout */
  const handleOpenAsTab = useCallback(
    (panelId: PanelId) => {
      const title = PANEL_TITLES[panelId] ?? panelId;
      openPanel(panelId, title);

      if (savedLayoutRef.current) {
        setLayout(savedLayoutRef.current);
        savedLayoutRef.current = null;
      }
      setExpandedPanelId(null);
    },
    [openPanel],
  );

  /** Add a panel to the layout if it isn't already visible */
  const togglePanel = useCallback(
    (panelId: PanelId) => {
      if (!layout) {
        setLayout(panelId);
        return;
      }
      const leaves = getLeaves(layout);
      if (leaves.includes(panelId)) return;
      setLayout(createBalancedTreeFromLeaves([...leaves, panelId]));
    },
    [layout],
  );

  /** Reset layout to defaults */
  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    setExpandedPanelId(null);
    savedLayoutRef.current = null;
  }, []);

  const handleLayoutChange = useCallback(
    (newLayout: MosaicNode<PanelId> | null) => {
      setLayout(newLayout);
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <MenuBar
        onTogglePanel={togglePanel}
        onResetLayout={resetLayout}
        onNewChart={() => setShowNewProject(true)}
        onOpenSettings={openSettings}
      />
      <TabBar />

      {activeTab.type === "chart" && <QuickActionBar />}

      <div className="flex-1 overflow-hidden relative">
        {activeTab.type === "home" && (
          <HomeScreen onNewChart={() => setShowNewProject(true)} />
        )}
        {activeTab.type === "chart" && (
          <Mosaic<PanelId>
            renderTile={(id, path) => (
              <MosaicWindow<PanelId>
                path={path}
                title={PANEL_TITLES[id]}
                toolbarControls={[
                  /* Collapse button — only visible when this panel is expanded */
                  expandedPanelId === id && (
                    <button
                      key="collapse"
                      className="mosaic-default-control bp3-button bp3-minimal collapse-button"
                      title="Collapse"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCollapse();
                      }}
                    />
                  ),
                  <CustomExpandButton
                    key="expand"
                    panelId={id}
                    isExpanded={expandedPanelId === id}
                    onExpand={handleExpand}
                    onOpenAsTab={handleOpenAsTab}
                  />,
                  <RemoveButton key="remove" />,
                ]}
              >
                <div className="panel-container">
                  <div className="panel-body">
                    {renderPanel(id)}
                  </div>
                </div>
              </MosaicWindow>
            )}
            value={layout}
            onChange={handleLayoutChange}
            className="mosaic-dark-theme"
          />
        )}
        {activeTab.type === "settings" && <SettingsPage />}
        {activeTab.type === "line_event_editor" && activeTab.data && (
          <LineEventEditor lineIndex={activeTab.data.lineIndex as number} />
        )}
        {activeTab.type === "unified_editor" && (
          <UnifiedEditorTab />
        )}
        {activeTab.type === "panel" && activeTab.data && (
          <div className="w-full h-full" style={{ backgroundColor: "var(--bg-secondary)" }}>
            {renderPanelTab(activeTab.data.panelId as string)}
          </div>
        )}
      </div>

      {(activeTab.type === "chart" || activeTab.type === "panel" || activeTab.type === "unified_editor") && <StatusBar />}
      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} />
    </div>
  );
}

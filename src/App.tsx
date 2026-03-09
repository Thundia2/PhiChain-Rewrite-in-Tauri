import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  getLeaves,
  createBalancedTreeFromLeaves,
  ExpandButton,
  RemoveButton,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";

import type { PanelId } from "./types/editor";
import { useChartStore } from "./stores/chartStore";
import { useTabStore } from "./stores/tabStore";

import { MenuBar } from "./components/MenuBar/MenuBar";
import { TabBar } from "./components/TabBar/TabBar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { QuickActionBar } from "./components/QuickActionBar/QuickActionBar";
import { PanelPlaceholder } from "./components/common/PanelPlaceholder";
import { GamePreview } from "./components/GamePreview/GamePreview";
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
    default:
      return <PanelPlaceholder name={PANEL_TITLES[id]} description="Coming soon" color="var(--text-muted)" />;
  }
}

/** Only show expand + close buttons (no replace/split which crash) */
const TOOLBAR_CONTROLS: ReactNode[] = [
  <ExpandButton key="expand" />,
  <RemoveButton key="remove" />,
];

export default function App() {
  const [layout, setLayout] = useState<MosaicNode<PanelId> | null>(DEFAULT_LAYOUT);
  const [showNewProject, setShowNewProject] = useState(false);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const openSettings = useTabStore((s) => s.openSettings);
  const isLoaded = useChartStore((s) => s.isLoaded);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useGlobalHotkeys({ onNewChart: () => setShowNewProject(true) });
  useClipboard();

  // When chart is closed, close chart tabs
  useEffect(() => {
    if (!isLoaded) {
      const tabState = useTabStore.getState();
      tabState.tabs
        .filter((t) => t.type === "chart" || t.type === "line_event_editor")
        .forEach((t) => tabState.closeTab(t.id));
    }
  }, [isLoaded]);

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
  const resetLayout = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

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
                toolbarControls={TOOLBAR_CONTROLS}
              >
                <div className="panel-container">
                  <div className="panel-body">
                    {renderPanel(id)}
                  </div>
                </div>
              </MosaicWindow>
            )}
            value={layout}
            onChange={setLayout}
            className="mosaic-dark-theme"
          />
        )}
        {activeTab.type === "settings" && <SettingsPage />}
        {activeTab.type === "line_event_editor" && activeTab.data && (
          <LineEventEditor lineIndex={activeTab.data.lineIndex as number} />
        )}
      </div>

      {activeTab.type === "chart" && <StatusBar />}
      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} />
    </div>
  );
}

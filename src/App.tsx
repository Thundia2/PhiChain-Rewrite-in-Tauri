import { useState } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";

import type { PanelId } from "./types/editor";

// Panel components — these are placeholders for now,
// each will be built out in later phases
import { MenuBar } from "./components/MenuBar/MenuBar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { QuickActionBar } from "./components/QuickActionBar/QuickActionBar";
import { PanelPlaceholder } from "./components/common/PanelPlaceholder";

// ============================================================
// CONFIGURABLE: Default panel layout
// This defines which panels are visible and how they're arranged.
// "row" splits horizontally, "column" splits vertically.
// splitPercentage controls the divider position (0-100).
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
// These are the titles shown in each panel's tab/header.
// Later these will come from the i18n system.
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
  "settings": "Settings",
  "hotkey-reference": "Hotkey Reference",
};

/**
 * Renders the content for each panel based on its ID.
 * Right now these are all placeholders — they'll be replaced
 * with real components in Phases 4-6.
 */
function renderPanel(id: PanelId) {
  switch (id) {
    case "game-preview":
      return <PanelPlaceholder name="Game Preview" description="Live preview of the chart (Phase 4)" color="var(--accent-primary)" />;
    case "timeline":
      return <PanelPlaceholder name="Timeline" description="Note and event editor canvas (Phase 5)" color="var(--note-tap)" />;
    case "inspector":
      return <PanelPlaceholder name="Inspector" description="Properties of selected items (Phase 6)" color="var(--event-opacity)" />;
    case "line-list":
      return <PanelPlaceholder name="Line List" description="All judgment lines in the chart (Phase 6)" color="var(--note-hold)" />;
    case "toolbar":
      return <PanelPlaceholder name="Toolbar" description="Note/event placement tools (Phase 6)" color="var(--note-flick)" />;
    case "timeline-settings":
      return <PanelPlaceholder name="Timeline Settings" description="Zoom, density, lanes (Phase 6)" color="var(--event-speed)" />;
    default:
      return <PanelPlaceholder name={PANEL_TITLES[id]} description="Coming soon" color="var(--text-muted)" />;
  }
}

export default function App() {
  const [layout, setLayout] = useState<MosaicNode<PanelId> | null>(DEFAULT_LAYOUT);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Top menu bar */}
      <MenuBar />

      {/* Quick action bar (transport controls, playback speed, progress) */}
      <QuickActionBar />

      {/* Main docking area — takes up all remaining space */}
      <div className="flex-1 overflow-hidden">
        <Mosaic<PanelId>
          renderTile={(id, path) => (
            <MosaicWindow<PanelId>
              path={path}
              title={PANEL_TITLES[id]}
              createNode={() => "inspector" as PanelId}
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
      </div>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  );
}

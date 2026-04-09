// ============================================================
// Canvas Panel Drawer — Bottom panel area in unified canvas mode
//
// 3-tier panel system:
//   Tier 1 (always visible): Inspector sidebar, Keyframe bar
//   Tier 2 (quick-toggle):   Timeline, Lines, Effects — shown in tab bar
//   Tier 3 (on-demand):      All other panels — overlay with "← Back" button
//
// Supports popping out into a separate browser window.
// ============================================================

import { createPortal } from "react-dom";
import { useEditorStore } from "../../stores/editorStore";
import type { PanelId } from "../../types/editor";
import { usePopoutWindow } from "../../hooks/usePopoutWindow";

// Panel components
import { EffectsEditor } from "../EffectsEditor/EffectsEditor";
import { ValidationPanel } from "../Validation/ValidationPanel";
import { BpmListPanel } from "../BpmList/BpmList";
import { ChartSettings } from "../ChartSettings/ChartSettings";
import { TimelineSettings } from "../TimelineSettings/TimelineSettings";
import { GamePreview } from "../GamePreview/GamePreview";
import { Timeline } from "../Timeline/Timeline";
import { TexturePanel } from "../TexturePanel/TexturePanel";
import { GroupManager } from "../GroupManager/GroupManager";
import { LineList } from "../LineList/LineList";
import { PresetPanel } from "../PresetPanel/PresetPanel";
import { HotkeyReferencePanel } from "../HotkeyReference/HotkeyReferencePanel";

/** Quick-toggle panels shown as tabs in the drawer bar */
const QUICK_PANELS: { id: PanelId; label: string; hotkey: string }[] = [
  { id: "timeline", label: "Timeline", hotkey: "Alt+1" },
  { id: "line-list", label: "Lines", hotkey: "Alt+2" },
  { id: "effects", label: "Effects", hotkey: "Alt+3" },
];

/** Labels for on-demand (Tier 3) panels */
const ON_DEMAND_LABELS: Record<string, string> = {
  "textures": "Textures",
  "group-manager": "Groups",
  "bpm-list": "BPM List",
  "chart-settings": "Chart Settings",
  "timeline-settings": "Timeline Settings",
  "validation": "Validation",
  "game-preview": "Preview",
  "presets": "Presets",
  "hotkey-reference": "Hotkey Reference",
};

function renderCanvasPanel(id: PanelId) {
  switch (id) {
    case "effects":
      return <EffectsEditor />;
    case "validation":
      return <ValidationPanel />;
    case "bpm-list":
      return <BpmListPanel />;
    case "chart-settings":
      return <ChartSettings />;
    case "timeline-settings":
      return <TimelineSettings />;
    case "textures":
      return <TexturePanel />;
    case "line-list":
      return <LineList />;
    case "group-manager":
      return <GroupManager />;
    case "game-preview":
      return <GamePreview />;
    case "timeline":
      return <Timeline />;
    case "presets":
      return <PresetPanel />;
    case "hotkey-reference":
      return <HotkeyReferencePanel />;
    default:
      return <div style={{ padding: 12, color: "var(--text-muted)" }}>Panel not available</div>;
  }
}

export function CanvasPanelDrawer() {
  const activePanelId = useEditorStore((s) => s.canvasActivePanelId);
  const overlayPanelId = useEditorStore((s) => s.onDemandOverlayPanelId);
  const toggleCanvasPanel = useEditorStore((s) => s.toggleCanvasPanel);
  const setCanvasActivePanel = useEditorStore((s) => s.setCanvasActivePanel);
  const setOnDemandOverlay = useEditorStore((s) => s.setOnDemandOverlay);

  const effectivePanelId = overlayPanelId ?? activePanelId;

  const panelLabel = overlayPanelId
    ? (ON_DEMAND_LABELS[overlayPanelId] ?? overlayPanelId)
    : QUICK_PANELS.find((p) => p.id === activePanelId)?.label ?? "Panel";
  const { containerEl, openPopout, closePopout, isPopped } = usePopoutWindow(
    `Phichain — ${panelLabel}`,
  );

  if (!effectivePanelId) return null;

  // The panel content (tab bar + active panel)
  const panelContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-secondary)",
        borderTop: isPopped ? "none" : "1px solid var(--border-color)",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          flexShrink: 0,
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
      >
        {overlayPanelId ? (
          /* On-demand overlay: show "← Back" + panel title */
          <>
            <button
              onClick={() => setOnDemandOverlay(null)}
              style={{
                padding: "0 8px", height: 28, fontSize: 11,
                border: "none", background: "transparent",
                color: "var(--accent-primary)", cursor: "pointer",
              }}
            >
              ← Back
            </button>
            <span style={{
              fontSize: 11, fontWeight: "bold",
              color: "var(--text-primary)", padding: "0 8px",
            }}>
              {ON_DEMAND_LABELS[overlayPanelId] ?? overlayPanelId}
            </span>
          </>
        ) : (
          /* Quick-toggle tabs (Tier 2) */
          <div style={{ display: "flex", flex: 1, gap: 0 }}>
            {QUICK_PANELS.map((panel) => (
              <button
                key={panel.id}
                onClick={() => toggleCanvasPanel(panel.id)}
                title={panel.hotkey}
                style={{
                  padding: "0 12px",
                  height: 28,
                  fontSize: 11,
                  border: "none",
                  borderRight: "1px solid var(--border-color)",
                  background: activePanelId === panel.id ? "var(--bg-secondary)" : "transparent",
                  color: activePanelId === panel.id ? "var(--accent-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: activePanelId === panel.id ? "bold" : "normal",
                }}
              >
                {panel.label}
              </button>
            ))}
          </div>
        )}

        {/* Pop out / Pop in button */}
        <button
          onClick={isPopped ? closePopout : openPopout}
          style={{
            width: 28, height: 28, fontSize: 12,
            border: "none", background: "transparent",
            color: isPopped ? "var(--accent-primary)" : "var(--text-muted)",
            cursor: "pointer", flexShrink: 0,
          }}
          title={isPopped ? "Pop back in" : "Pop out to window"}
        >
          {isPopped ? "⧉" : "↗"}
        </button>

        {/* Close button */}
        <button
          onClick={() => {
            closePopout();
            setOnDemandOverlay(null);
            setCanvasActivePanel(null);
          }}
          style={{
            width: 28, height: 28, fontSize: 14,
            border: "none", background: "transparent",
            color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
          }}
          title="Close panel"
        >
          x
        </button>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {renderCanvasPanel(effectivePanelId)}
      </div>
    </div>
  );

  // If popped out, render via portal into the external window
  if (isPopped && containerEl) {
    return createPortal(panelContent, containerEl);
  }

  return panelContent;
}

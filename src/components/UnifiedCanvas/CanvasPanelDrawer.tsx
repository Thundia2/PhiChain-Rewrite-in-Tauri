// ============================================================
// Canvas Panel Drawer — Bottom panel area in unified canvas mode
//
// Shows a tab bar at the top with the active panel rendered below.
// Panels can be toggled from the Windows menu or the tab bar.
// Supports popping out into a separate browser window.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEditorStore } from "../../stores/editorStore";
import type { PanelId } from "../../types/editor";

// Panel components
import { EffectsEditor } from "../EffectsEditor/EffectsEditor";
import { ValidationPanel } from "../Validation/ValidationPanel";
import { BpmListPanel } from "../BpmList/BpmList";
import { ChartSettings } from "../ChartSettings/ChartSettings";
import { TimelineSettings } from "../TimelineSettings/TimelineSettings";
import { GamePreview } from "../GamePreview/GamePreview";
import { Inspector } from "../Inspector/Inspector";
import { Timeline } from "../Timeline/Timeline";
import { TexturePanel } from "../TexturePanel/TexturePanel";
import { GroupManager } from "../GroupManager/GroupManager";

/** Panels available in the canvas bottom drawer */
const CANVAS_PANELS: { id: PanelId; label: string }[] = [
  { id: "effects", label: "Effects" },
  { id: "validation", label: "Validation" },
  { id: "textures", label: "Textures" },
  { id: "group-manager", label: "Groups" },
  { id: "bpm-list", label: "BPM List" },
  { id: "chart-settings", label: "Chart Settings" },
  { id: "timeline-settings", label: "Timeline Settings" },
  { id: "game-preview", label: "Preview" },
  { id: "inspector", label: "Inspector" },
  { id: "timeline", label: "Timeline" },
];

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
    case "group-manager":
      return <GroupManager />;
    case "game-preview":
      return <GamePreview />;
    case "inspector":
      return <Inspector />;
    case "timeline":
      return <Timeline />;
    default:
      return <div style={{ padding: 12, color: "var(--text-muted)" }}>Panel not available</div>;
  }
}

/** Copy all stylesheets from the parent window into a child window */
function copyStylesToWindow(targetDoc: Document) {
  // Copy <style> tags
  document.querySelectorAll("style").forEach((style) => {
    const clone = targetDoc.createElement("style");
    clone.textContent = style.textContent;
    targetDoc.head.appendChild(clone);
  });

  // Copy <link rel="stylesheet"> tags
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const clone = targetDoc.createElement("link");
    clone.rel = "stylesheet";
    clone.href = (link as HTMLLinkElement).href;
    targetDoc.head.appendChild(clone);
  });
}

/** Hook to manage a popout browser window with React portal rendering */
function usePopoutWindow(title: string) {
  const [popoutWindow, setPopoutWindow] = useState<Window | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const windowRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const openPopout = useCallback(() => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return;
    }

    const w = window.open("", "", "width=800,height=500,menubar=no,toolbar=no,location=no,status=no");
    if (!w) return;

    w.document.title = title;

    // Set up the document
    copyStylesToWindow(w.document);

    // Set background color to match app theme
    w.document.body.style.margin = "0";
    w.document.body.style.padding = "0";
    w.document.body.style.backgroundColor = "var(--bg-primary, #1a1b2e)";
    w.document.body.style.color = "var(--text-primary, #e0e0e0)";
    w.document.body.style.fontFamily = "inherit";
    w.document.body.style.overflow = "hidden";
    w.document.body.style.height = "100vh";

    // Create container div for React portal
    const container = w.document.createElement("div");
    container.id = "popout-root";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    w.document.body.appendChild(container);

    windowRef.current = w;
    setPopoutWindow(w);
    setContainerEl(container);

    // Clear any previous interval before creating a new one
    if (intervalRef.current !== null) clearInterval(intervalRef.current);

    // Listen for window close
    intervalRef.current = setInterval(() => {
      if (w.closed) {
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = null;
        windowRef.current = null;
        setPopoutWindow(null);
        setContainerEl(null);
      }
    }, 500);
  }, [title]);

  const closePopout = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close();
    }
    windowRef.current = null;
    setPopoutWindow(null);
    setContainerEl(null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close();
      }
    };
  }, []);

  return { popoutWindow, containerEl, openPopout, closePopout, isPopped: !!popoutWindow };
}

export function CanvasPanelDrawer() {
  const activePanelId = useEditorStore((s) => s.canvasActivePanelId);
  const toggleCanvasPanel = useEditorStore((s) => s.toggleCanvasPanel);
  const setCanvasActivePanel = useEditorStore((s) => s.setCanvasActivePanel);

  const panelLabel = CANVAS_PANELS.find((p) => p.id === activePanelId)?.label ?? "Panel";
  const { containerEl, openPopout, closePopout, isPopped } = usePopoutWindow(
    `Phichain — ${panelLabel}`,
  );

  if (!activePanelId) return null;

  // The panel content (tab bar + active panel)
  const panelContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-secondary)",
        borderTop: isPopped ? "none" : "1px solid var(--border)",
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
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flex: 1, overflow: "auto", gap: 0 }}>
          {CANVAS_PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => toggleCanvasPanel(panel.id)}
              style={{
                padding: "0 10px",
                height: 28,
                fontSize: 11,
                border: "none",
                borderRight: "1px solid var(--border)",
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

        {/* Pop out / Pop in button */}
        <button
          onClick={isPopped ? closePopout : openPopout}
          style={{
            width: 28,
            height: 28,
            fontSize: 12,
            border: "none",
            background: "transparent",
            color: isPopped ? "var(--accent-primary)" : "var(--text-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title={isPopped ? "Pop back in" : "Pop out to window"}
        >
          {isPopped ? "⧉" : "↗"}
        </button>

        {/* Close button */}
        <button
          onClick={() => {
            closePopout();
            setCanvasActivePanel(null);
          }}
          style={{
            width: 28,
            height: 28,
            fontSize: 14,
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title="Close panel"
        >
          x
        </button>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {renderCanvasPanel(activePanelId)}
      </div>
    </div>
  );

  // If popped out, render via portal into the external window
  if (isPopped && containerEl) {
    return createPortal(panelContent, containerEl);
  }

  return panelContent;
}

// ============================================================
// ContextPanelSidebar — Wrapper with collapsed / popped-out states
//
// Three visual states:
// 1. Collapsed  — 36px vertical strip with icon + rotated label
// 2. Popped out — 36px indicator strip; panel renders via portal
// 3. Normal     — 290px inline panel
//
// Pop-out uses usePopoutWindow to open a separate browser window
// and createPortal to render ContextPanel inside it.
// ============================================================

import { createPortal } from "react-dom";
import { useCallback, useEffect } from "react";
import { useContextPanelStore } from "../../stores/contextPanelStore";
import { usePopoutWindow } from "../../hooks/usePopoutWindow";
import { ContextPanel } from "./ContextPanel";
import type { ContextPanelProps } from "./ContextPanel";

const PANEL_WIDTH = 290;
const COLLAPSED_WIDTH = 36;

export function ContextPanelSidebar(props: ContextPanelProps) {
  const collapsed = useContextPanelStore((s) => s.collapsed);
  const poppedOut = useContextPanelStore((s) => s.poppedOut);
  const setCollapsed = useContextPanelStore((s) => s.setCollapsed);
  const setPoppedOut = useContextPanelStore((s) => s.setPoppedOut);

  const {
    containerEl,
    isPopped,
    openPopout,
    closePopout,
  } = usePopoutWindow("Context Panel", {
    width: 320,
    height: 600,
    windowName: "phichain-context-panel",
  });

  // Sync popout hook state -> store
  useEffect(() => {
    setPoppedOut(isPopped);
  }, [isPopped, setPoppedOut]);

  // When popout window is closed externally, reset store
  useEffect(() => {
    if (!isPopped && poppedOut) {
      setPoppedOut(false);
    }
  }, [isPopped, poppedOut, setPoppedOut]);

  // ---- Handlers ----

  const handlePopout = useCallback(() => {
    if (isPopped) {
      // Already popped -- bring back inline
      closePopout();
      setPoppedOut(false);
      setCollapsed(false);
    } else {
      openPopout();
      setPoppedOut(true);
    }
  }, [isPopped, openPopout, closePopout, setPoppedOut, setCollapsed]);

  const handleCollapse = useCallback(() => {
    if (isPopped) {
      closePopout();
      setPoppedOut(false);
    }
    setCollapsed(true);
  }, [isPopped, closePopout, setPoppedOut, setCollapsed]);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
  }, [setCollapsed]);

  const handleBringBack = useCallback(() => {
    closePopout();
    setPoppedOut(false);
    setCollapsed(false);
  }, [closePopout, setPoppedOut, setCollapsed]);

  // ---- Build the panel element (shared between inline and portal) ----

  const panelElement = (
    <ContextPanel
      {...props}
      onPopout={handlePopout}
      onCollapse={handleCollapse}
    />
  );

  // ---- State: Popped out ----

  if (poppedOut) {
    return (
      <>
        {/* Inline indicator strip */}
        <div
          onClick={handleBringBack}
          title="Popped out -- click to bring back"
          style={{
            width: COLLAPSED_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "var(--bg-secondary)",
            borderLeft: "1px solid var(--border-color)",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--bg-tertiary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--bg-secondary)";
          }}
        >
          <span
            style={{
              fontSize: 16,
              color: "var(--accent-primary)",
              lineHeight: 1,
            }}
          >
            {"\u2197"}
          </span>
          <span
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            POPPED
          </span>
        </div>

        {/* Render into popout window via portal */}
        {containerEl && createPortal(panelElement, containerEl)}
      </>
    );
  }

  // ---- State: Collapsed ----

  if (collapsed) {
    return (
      <div
        onClick={handleExpand}
        title="Expand context panel"
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: "var(--bg-secondary)",
          borderLeft: "1px solid var(--border-color)",
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-tertiary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-secondary)";
        }}
      >
        {/* Icon */}
        <span
          style={{
            fontSize: 16,
            color: "var(--accent-primary)",
            lineHeight: 1,
          }}
        >
          {"\u25CE"}
        </span>

        {/* Rotated label */}
        <span
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          CONTEXT
        </span>
      </div>
    );
  }

  // ---- State: Normal (expanded inline) ----

  return (
    <div
      style={{
        width: PANEL_WIDTH,
        flexShrink: 0,
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}
    >
      {panelElement}
    </div>
  );
}

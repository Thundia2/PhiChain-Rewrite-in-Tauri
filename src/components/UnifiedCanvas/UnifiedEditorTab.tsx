// ============================================================
// Unified Editor Tab — Layout Shell
//
// The top-level layout for the unified canvas editor.
// Composes: Toolbar (left) + LineStrip + Canvas + LineDrawer
//           + Inspector (right) + TransportBar + KeyframeBar
//           + Panel Drawer (bottom, toggleable) + StatusBar
//
// This is rendered when the active tab type is "unified_editor".
// ============================================================

import { useCallback, useRef } from "react";
import { Toolbar } from "../Toolbar/Toolbar";
import { UnifiedCanvas } from "./UnifiedCanvas";
import { UnifiedInspector } from "./UnifiedInspector";
import { TransportBar } from "../TransportBar/TransportBar";
import { KeyframeBar } from "../KeyframeBar/KeyframeBar";
import { LineStrip } from "../LineStrip/LineStrip";
import { LineDrawer } from "../LineDrawer/LineDrawer";
import { StatusBar } from "../StatusBar/StatusBar";
import { useEditorStore } from "../../stores/editorStore";
import { useGroupStore } from "../../stores/groupStore";
import { CanvasPanelDrawer } from "./CanvasPanelDrawer";
import { GroupEditOverlay } from "../GroupManager/GroupEditOverlay";
import { FloatingInspector } from "./FloatingInspector";

export function UnifiedEditorTab() {
  const canvasActivePanelId = useEditorStore((s) => s.canvasActivePanelId);
  const canvasPanelHeight = useEditorStore((s) => s.canvasPanelHeight);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setCanvasPanelHeight = useEditorStore((s) => s.setCanvasPanelHeight);
  const keyframeBarOpen = useEditorStore((s) => s.keyframeBarOpen);
  const keyframeBarHeight = useEditorStore((s) => s.keyframeBarHeight);
  const setKeyframeBarHeight = useEditorStore((s) => s.setKeyframeBarHeight);

  // ---- Resize handle for the bottom panel drawer ----
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startHeight: canvasPanelHeight };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = resizeRef.current.startY - ev.clientY;
        setCanvasPanelHeight(resizeRef.current.startHeight + delta);
      };

      const onMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [canvasPanelHeight, setCanvasPanelHeight],
  );

  // ---- Resize handle for the keyframe bar ----
  const kbResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleKbResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      kbResizeRef.current = { startY: e.clientY, startHeight: keyframeBarHeight };

      const onMouseMove = (ev: MouseEvent) => {
        if (!kbResizeRef.current) return;
        const delta = kbResizeRef.current.startY - ev.clientY;
        setKeyframeBarHeight(kbResizeRef.current.startHeight + delta);
      };

      const onMouseUp = () => {
        kbResizeRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [keyframeBarHeight, setKeyframeBarHeight],
  );

  return (
    <div
      className="unified-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {/* Main content area: Toolbar + Center + Inspector */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left toolbar */}
        <Toolbar />

        {/* Center column: LineStrip + Canvas + TransportBar + KeyframeBar */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Line Strip (30px) */}
          <LineStrip />

          {/* Canvas area with LineDrawer overlay + Group edit overlay */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <UnifiedCanvas />
            <LineDrawer />
            {activeGroupId && <GroupEditOverlay />}
            <FloatingInspector />
          </div>

          {/* Bottom panel drawer (toggleable) */}
          {canvasActivePanelId && (
            <>
              {/* Resize handle */}
              <div
                onMouseDown={handleResizeStart}
                style={{
                  height: 4,
                  cursor: "ns-resize",
                  background: "var(--border-color)",
                  flexShrink: 0,
                }}
              />
              <div style={{ height: canvasPanelHeight, flexShrink: 0, overflow: "hidden" }}>
                <CanvasPanelDrawer />
              </div>
            </>
          )}

          {/* Transport Bar — always visible */}
          <TransportBar />

          {/* Keyframe bar with resize handle */}
          {keyframeBarOpen && (
            <div
              onMouseDown={handleKbResizeStart}
              style={{
                height: 4,
                cursor: "ns-resize",
                background: "var(--border-color)",
                flexShrink: 0,
              }}
            />
          )}
          <div
            style={{
              height: keyframeBarOpen ? keyframeBarHeight : 0,
              overflow: "hidden",
              transition: "height 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              flexShrink: 0,
            }}
          >
            <KeyframeBar />
          </div>
        </div>

        {/* Right: Inspector sidebar */}
        <UnifiedInspector />
      </div>

      {/* Bottom: Status bar */}
      <StatusBar />
    </div>
  );
}

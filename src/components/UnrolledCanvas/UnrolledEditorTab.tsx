// ============================================================
// Unrolled Editor Tab — Layout Shell
//
// The top-level layout for the unrolled canvas editor.
// Structurally identical to UnifiedEditorTab.tsx with the
// canvas component swapped out:
//   UnifiedCanvas → UnrolledCanvas + MiniGamePreview overlay
//
// Composes: Toolbar (left) + LineStrip + UnrolledCanvas
//           + Inspector (right) + TransportBar + KeyframeBar
//           + Panel Drawer (bottom, toggleable) + StatusBar
//
// This is rendered when the active tab type is "unrolled_editor".
//
// Recent change: Added per-line mode — when lineIndex prop is set,
// the tab is locked to that line with a compact header and per-tab
// follow-playback toggle instead of the full LineStrip.
// ============================================================

import { useCallback, useRef, useEffect } from "react";
import { Toolbar } from "../Toolbar/Toolbar";
import { UnrolledCanvas } from "./UnrolledCanvas";
import { MiniGamePreview } from "./MiniGamePreview";
import { UnifiedInspector } from "../UnifiedCanvas/UnifiedInspector";
import { TransportBar } from "../TransportBar/TransportBar";
import { KeyframeBar } from "../KeyframeBar/KeyframeBar";
import { LineStrip } from "../LineStrip/LineStrip";
import { StatusBar } from "../StatusBar/StatusBar";
import { useEditorStore } from "../../stores/editorStore";
import { useChartStore } from "../../stores/chartStore";
import { useGroupStore } from "../../stores/groupStore";
import { CanvasPanelDrawer } from "../UnifiedCanvas/CanvasPanelDrawer";
import { GroupEditOverlay } from "../GroupManager/GroupEditOverlay";
import { FloatingInspector } from "../UnifiedCanvas/FloatingInspector";

// ============================================================
// Props — lineIndex locks to a specific line (per-line tab mode)
// ============================================================
interface UnrolledEditorTabProps {
  /** When set, locks this tab to a specific line */
  lineIndex?: number;
}

export function UnrolledEditorTab({ lineIndex }: UnrolledEditorTabProps = {}) {
  const canvasActivePanelId = useEditorStore((s) => s.canvasActivePanelId);
  const canvasPanelHeight = useEditorStore((s) => s.canvasPanelHeight);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setCanvasPanelHeight = useEditorStore((s) => s.setCanvasPanelHeight);
  const keyframeBarOpen = useEditorStore((s) => s.keyframeBarOpen);
  const keyframeBarHeight = useEditorStore((s) => s.keyframeBarHeight);
  const setKeyframeBarHeight = useEditorStore((s) => s.setKeyframeBarHeight);
  const showMiniPreview = useEditorStore((s) => s.showMiniPreview);

  // ---- Per-line mode state ----
  const isPerLineTab = lineIndex !== undefined;
  const tabKey = isPerLineTab ? String(lineIndex) : "main";
  const lineName = useChartStore(
    (s) => isPerLineTab ? (s.chart.lines[lineIndex]?.name || `Line ${lineIndex + 1}`) : null,
  );
  const followPlayback = useEditorStore((s) => s.unrolledFollowPlayback[tabKey] ?? true);
  const toggleFollow = useCallback(() => {
    useEditorStore.getState().setUnrolledFollowPlayback(tabKey, !followPlayback);
  }, [tabKey, followPlayback]);

  // On mount for per-line tabs, select the line so Inspector/KeyframeBar show correct data
  useEffect(() => {
    if (isPerLineTab && lineIndex !== undefined) {
      useEditorStore.getState().selectLine(lineIndex);
    }
  }, [isPerLineTab, lineIndex]);

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
      className="unrolled-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
      // When a per-line tab receives interaction, sync the shared editorStore
      onMouseDown={isPerLineTab && lineIndex !== undefined ? () => {
        const es = useEditorStore.getState();
        if (es.selectedLineIndex !== lineIndex) {
          es.selectLine(lineIndex);
        }
      } : undefined}
    >
      {/* Main content area: Toolbar + Center + Inspector */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left toolbar */}
        <Toolbar />

        {/* Center column: LineStrip/Header + Canvas + TransportBar + KeyframeBar */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Per-line header or full LineStrip */}
          {isPerLineTab ? (
            <div style={{
              height: 30, display: "flex", alignItems: "center", gap: 8,
              padding: "0 12px", background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border-color)", fontSize: 12, flexShrink: 0,
            }}>
              <span style={{ opacity: 0.5 }}>Line:</span>
              <span style={{ fontWeight: 600 }}>{lineName}</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={toggleFollow}
                title={followPlayback ? "Following playback (click to make independent)" : "Independent scroll (click to sync with playback)"}
                style={{
                  background: "none", border: "1px solid var(--border-color)", borderRadius: 3,
                  color: followPlayback ? "#22c55e" : "var(--text-secondary)",
                  cursor: "pointer", fontSize: 11, padding: "2px 8px",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {followPlayback ? "Synced" : "Independent"}
              </button>
            </div>
          ) : (
            <LineStrip />
          )}

          {/* Canvas area with MiniGamePreview overlay + Group edit overlay */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <UnrolledCanvas
              {...(isPerLineTab ? {
                overrideLineIndex: lineIndex,
                scrollBeatKey: lineIndex,
                followPlaybackKey: tabKey,
              } : {
                followPlaybackKey: "main",
              })}
            />
            {/* Mini game preview — absolute overlay, top-right corner */}
            {showMiniPreview && <MiniGamePreview />}
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

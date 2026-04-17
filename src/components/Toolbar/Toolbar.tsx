// ============================================================
// Toolbar — Left vertical tool strip (42px)
//
// Compact tool buttons with tool-specific accent colors.
// Includes drawer toggle button at the bottom.
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { EditorTool } from "../../types/editor";

interface ToolDef {
  id: EditorTool;
  label: string;
  icon: string;
  shortcut: string;
  color: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: "◇", shortcut: "V", color: "#a0aec0" },
  { id: "place_tap", label: "Tap", icon: "●", shortcut: "Q", color: "#48b5ff" },
  { id: "place_drag", label: "Drag", icon: "◆", shortcut: "W", color: "#ffd24a" },
  { id: "place_flick", label: "Flick", icon: "▲", shortcut: "E", color: "#ff4a6a" },
  { id: "place_hold", label: "Hold", icon: "▮", shortcut: "R", color: "#4aff7a" },
  { id: "eraser", label: "Eraser", icon: "✕", shortcut: "X", color: "#ff8a8a" },
  { id: "place_pattern", label: "Pattern", icon: "⊡", shortcut: "Ctrl+G", color: "#c084fc" },
];

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const beatSyncPlacement = useEditorStore((s) => s.beatSyncPlacement);
  const toggleBeatSync = useEditorStore((s) => s.toggleBeatSyncPlacement);
  const canvasActivePanelId = useEditorStore((s) => s.canvasActivePanelId);
  const setCanvasActivePanel = useEditorStore((s) => s.setCanvasActivePanel);
  const stepRecordActive = useEditorStore((s) => s.stepRecordActive);
  const toggleStepRecord = useEditorStore((s) => s.toggleStepRecord);
  const xSnapEnabled = useEditorStore((s) => s.xSnapEnabled);
  const toggleXSnap = useEditorStore((s) => s.toggleXSnap);
  const verticalLines = useEditorStore((s) => s.verticalLines);
  const setVerticalLines = useEditorStore((s) => s.setVerticalLines);
  const showBeatGrid = useSettingsStore((s) => s.showBeatGrid);

  return (
    <div
      style={{
        width: 42,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 3px",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        flexShrink: 0,
      }}
    >
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => setTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            style={{
              width: 36,
              height: 34,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              background: isActive ? `${tool.color}18` : "transparent",
              borderLeft: isActive ? `2px solid ${tool.color}` : "2px solid transparent",
              color: isActive ? tool.color : "#666",
              fontSize: 14,
              transition: "all 0.15s",
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            <span>{tool.icon}</span>
            <span style={{ fontSize: 7, opacity: 0.6 }}>{tool.shortcut}</span>
          </button>
        );
      })}

      {/* Divider */}
      <div style={{ height: 1, margin: "3px 6px", background: "var(--border-color)" }} />

      {/* Beat Sync toggle */}
      <button
        onClick={toggleBeatSync}
        title="Beat Sync (T) — place notes at current beat"
        style={{
          width: 36,
          height: 34,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: beatSyncPlacement ? "#e8a84818" : "transparent",
          borderLeft: beatSyncPlacement ? "2px solid #e8a848" : "2px solid transparent",
          color: beatSyncPlacement ? "#e8a848" : "#666",
          fontSize: 14,
          transition: "all 0.15s",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        <span>◷</span>
        <span style={{ fontSize: 7, opacity: 0.6 }}>T</span>
      </button>

      {/* Step Record toggle */}
      <button
        onClick={toggleStepRecord}
        title={`Step Record (S) — auto-advance beat on each click`}
        style={{
          width: 36,
          height: 34,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: stepRecordActive ? "#22d3ee18" : "transparent",
          borderLeft: stepRecordActive ? "2px solid #22d3ee" : "2px solid transparent",
          color: stepRecordActive ? "#22d3ee" : "#666",
          fontSize: 14,
          transition: "all 0.15s",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        <span>{"\u23E9"}</span>
        <span style={{ fontSize: 7, opacity: 0.6 }}>S</span>
      </button>

      {/* Divider */}
      <div style={{ height: 1, margin: "3px 6px", background: "var(--border-color)" }} />

      {/* X Snap toggle */}
      <button
        onClick={toggleXSnap}
        title={`X Snap (Shift+X) — snap notes to vertical grid (${verticalLines} lines)`}
        style={{
          width: 36,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: xSnapEnabled ? "#8b5cf618" : "transparent",
          borderLeft: xSnapEnabled ? "2px solid #8b5cf6" : "2px solid transparent",
          color: xSnapEnabled ? "#8b5cf6" : "#666",
          fontSize: 10,
          fontWeight: xSnapEnabled ? 700 : 400,
          transition: "all 0.15s",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        ⊞
      </button>

      {/* Vertical line preset pills — set line count AND enable snap in one click */}
      {([11, 21, 31, 17] as const).map((n) => {
        const isActive = xSnapEnabled && verticalLines === n;
        return (
          <button
            key={n}
            onClick={() => {
              setVerticalLines(n);
              if (!xSnapEnabled) toggleXSnap();
            }}
            title={`${n}-line grid (step ${Math.round(1350 / (n - 1))})`}
            style={{
              width: 36,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              background: isActive ? "#8b5cf618" : "transparent",
              color: isActive ? "#8b5cf6" : "#555",
              fontSize: 9,
              fontWeight: isActive ? 700 : 400,
              fontFamily: "inherit",
              padding: 0,
              transition: "all 0.15s",
            }}
          >
            {n}
          </button>
        );
      })}

      {/* Divider — separates X snap section from beat grid toggle */}
      <div style={{ height: 1, margin: "3px 6px", background: "var(--border-color)" }} />

      {/* Beat Grid toggle — show beat subdivisions perpendicular to line */}
      <button
        onClick={() => {
          const ss = useSettingsStore.getState();
          ss.updateSettings({ showBeatGrid: !ss.showBeatGrid });
        }}
        title="Beat Grid — show beat subdivisions perpendicular to line"
        style={{
          width: 36,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: showBeatGrid ? "#6c8aff18" : "transparent",
          borderLeft: showBeatGrid ? "2px solid #6c8aff" : "2px solid transparent",
          color: showBeatGrid ? "#6c8aff" : "#666",
          fontSize: 10,
          fontWeight: showBeatGrid ? 700 : 400,
          transition: "all 0.15s",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        ⊥
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Panel Drawer toggle (☰) */}
      <button
        onClick={() => {
          if (canvasActivePanelId) {
            setCanvasActivePanel(null);
          } else {
            setCanvasActivePanel("timeline");
          }
        }}
        title="Panels"
        style={{
          width: 36,
          height: 30,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: canvasActivePanelId ? "#6c8aff18" : "transparent",
          color: canvasActivePanelId ? "var(--accent-primary)" : "#555",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "inherit",
          padding: 0,
          transition: "all 0.15s",
        }}
      >
        ☰
      </button>
    </div>
  );
}

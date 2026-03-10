// ============================================================
// Toolbar — Left vertical tool strip (42px)
//
// Compact tool buttons with tool-specific accent colors.
// Includes drawer toggle button at the bottom.
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
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
];

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const drawerOpen = useEditorStore((s) => s.lineDrawerOpen);
  const toggleDrawer = useEditorStore((s) => s.toggleLineDrawer);

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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Drawer toggle */}
      <button
        onClick={toggleDrawer}
        title="Line Drawer (L)"
        style={{
          width: 36,
          height: 30,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          background: drawerOpen ? "#6c8aff18" : "transparent",
          color: drawerOpen ? "var(--accent-primary)" : "#555",
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

import { useEditorStore } from "../../stores/editorStore";
import type { EditorTool } from "../../types/editor";

interface ToolDef {
  id: EditorTool;
  label: string;
  icon: string;
  shortcut: string;
  color?: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: "⬚", shortcut: "V" },
  { id: "place_tap", label: "Tap", icon: "●", shortcut: "Q", color: "var(--note-tap)" },
  { id: "place_drag", label: "Drag", icon: "◆", shortcut: "W", color: "var(--note-drag)" },
  { id: "place_flick", label: "Flick", icon: "▲", shortcut: "E", color: "var(--note-flick)" },
  { id: "place_hold", label: "Hold", icon: "▮", shortcut: "R", color: "var(--note-hold)" },
  { id: "eraser", label: "Eraser", icon: "✕", shortcut: "X" },
];

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <div className="flex flex-col gap-1 p-1">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors w-full text-left"
            style={{
              backgroundColor: isActive ? "var(--bg-active)" : "transparent",
              color: isActive ? (tool.color ?? "var(--text-primary)") : "var(--text-secondary)",
              borderLeft: isActive ? `2px solid ${tool.color ?? "var(--accent-primary)"}` : "2px solid transparent",
            }}
            onClick={() => setTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <span
              className="w-5 text-center text-sm"
              style={{ color: tool.color ?? "var(--text-primary)" }}
            >
              {tool.icon}
            </span>
            <span className="flex-1">{tool.label}</span>
            <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
              {tool.shortcut}
            </span>
          </button>
        );
      })}
    </div>
  );
}

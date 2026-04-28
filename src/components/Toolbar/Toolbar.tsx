// ============================================================
// Toolbar — Left vertical tool strip (42px)
//
// Compact tool buttons with tool-specific accent colors.
// Includes drawer toggle button at the bottom.
//
// Recent change: removed the Pattern (Ctrl+G) toolbar button (the
// hotkey itself remains active in useHotkeys.ts) and added a 9-button
// event-placement section below the note tools — only visible when
// the active tab is an unrolled editor. Each event tool maps to a
// `place_event_<kind>` EditorTool variant and is color-coded via
// EVENT_COLORS. Keyboard shortcuts (⇪Q .. ⇪O) require CapsLock — see
// the matching CapsLock-gated handlers in useHotkeys.ts.
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";
import type { EditorTool } from "../../types/editor";
import { EVENT_COLORS } from "../../constants/eventColors";

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

// Event-placement tools — shown only on unrolled tabs. Order mirrors
// the QWERTY top row (Q W E R T Y U I O), all CapsLock-gated. The ⇪
// glyph (U+21EA) is the standard CapsLock symbol.
const EVENT_TOOLS: ToolDef[] = [
  { id: "place_event_x",        label: "X Position event",  icon: "◆", shortcut: "⇪Q", color: EVENT_COLORS.x },
  { id: "place_event_y",        label: "Y Position event",  icon: "◆", shortcut: "⇪W", color: EVENT_COLORS.y },
  { id: "place_event_rotation", label: "Rotation event",    icon: "◆", shortcut: "⇪E", color: EVENT_COLORS.rotation },
  { id: "place_event_opacity",  label: "Opacity event",     icon: "◆", shortcut: "⇪R", color: EVENT_COLORS.opacity },
  { id: "place_event_speed",    label: "Speed event",       icon: "◆", shortcut: "⇪T", color: EVENT_COLORS.speed },
  { id: "place_event_scale_x",  label: "Scale X event",     icon: "◆", shortcut: "⇪Y", color: EVENT_COLORS.scale_x },
  { id: "place_event_scale_y",  label: "Scale Y event",     icon: "◆", shortcut: "⇪U", color: EVENT_COLORS.scale_y },
  { id: "place_event_color",    label: "Color event",       icon: "◆", shortcut: "⇪I", color: EVENT_COLORS.color },
  { id: "place_event_text",     label: "Text event",        icon: "◆", shortcut: "⇪O", color: EVENT_COLORS.text },
];

/**
 * Single tool button. Extracted because note tools and event tools
 * render identical chrome — only the data (id/icon/color/shortcut)
 * differs. Active state colors the left border + tinted background
 * with the tool's own accent.
 */
function ToolButton({
  tool, isActive, onClick,
}: {
  tool: ToolDef;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      key={tool.id}
      onClick={onClick}
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
}

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

  // Event tools are only relevant on unrolled tabs — the unified
  // canvas has no clean beat-axis click for placement and the home /
  // panel tabs don't host a canvas at all. Read the active tab's
  // type via the same shape App.tsx uses.
  const isUnrolledTab = useTabStore((s) => {
    const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
    return activeTab?.type === "unrolled_editor";
  });

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
      {TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          onClick={() => setTool(tool.id)}
        />
      ))}

      {/* Event-placement tools — unrolled-only.
          Conditionally rendered so unified / chart / panel tabs keep
          their lean toolbar. activeTool persists across tabs (e.g. if
          user has place_event_x selected then switches to unified, the
          unified canvas just ignores the click — no error path). */}
      {isUnrolledTab && (
        <>
          <div style={{ height: 1, margin: "3px 6px", background: "var(--border-color)" }} />
          {EVENT_TOOLS.map((tool) => (
            <ToolButton
              key={tool.id}
              tool={tool}
              isActive={activeTool === tool.id}
              onClick={() => setTool(tool.id)}
            />
          ))}
        </>
      )}

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

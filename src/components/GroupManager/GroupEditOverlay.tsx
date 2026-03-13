// ============================================================
// Group Edit Overlay — Floating toolbar shown during group edit mode
//
// Positioned at the top of the canvas, shows:
//   - Group name + color badge
//   - "Exit Group Mode" button
//   - Dim Others / Hide Others / Simplified Canvas toggles
// ============================================================

import { useGroupStore } from "../../stores/groupStore";

export function GroupEditOverlay() {
  const activeGroup = useGroupStore((s) => s.getActiveGroup());
  const exitGroupEditMode = useGroupStore((s) => s.exitGroupEditMode);
  const groupEditMode = useGroupStore((s) => s.groupEditMode);
  const setGroupEditSettings = useGroupStore((s) => s.setGroupEditSettings);

  if (!activeGroup) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 6,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px",
        background: "rgba(22, 22, 29, 0.92)",
        border: `1px solid ${activeGroup.color}60`,
        borderRadius: 6,
        zIndex: 50,
        fontSize: 11,
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}
    >
      {/* Color dot + group name */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: activeGroup.color,
            flexShrink: 0,
          }}
        />
        <span style={{ color: "var(--text-primary)", fontWeight: "bold", fontSize: 11 }}>
          {activeGroup.name}
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: 9 }}>
          ({activeGroup.type === "line"
            ? `${activeGroup.lines.length} lines`
            : `${activeGroup.notes.length} notes`})
        </span>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)" }} />

      {/* Toggles */}
      <OverlayToggle
        label="Dim"
        active={groupEditMode.dimOthers}
        onClick={() => setGroupEditSettings({ dimOthers: !groupEditMode.dimOthers })}
      />
      <OverlayToggle
        label="Hide"
        active={groupEditMode.hideOthers}
        onClick={() => setGroupEditSettings({ hideOthers: !groupEditMode.hideOthers })}
      />
      <OverlayToggle
        label="Simple"
        active={groupEditMode.simplifiedCanvas}
        onClick={() => setGroupEditSettings({ simplifiedCanvas: !groupEditMode.simplifiedCanvas })}
      />

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)" }} />

      {/* Exit button */}
      <button
        onClick={exitGroupEditMode}
        style={{
          padding: "2px 8px",
          fontSize: 10,
          fontWeight: "bold",
          background: "#ff4060",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Exit Group
      </button>
    </div>
  );
}

function OverlayToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "1px 6px",
        fontSize: 9,
        background: active ? "var(--bg-active)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        border: active ? "1px solid var(--border-color)" : "1px solid transparent",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

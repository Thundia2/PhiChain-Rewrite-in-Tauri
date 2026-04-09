// ============================================================
// GroupRow — Individual group list item
//
// Displays group color, type badge, name (editable inline),
// member count, lock status, and action buttons.
// Extracted from GroupManager.tsx.
// ============================================================

import type { EditorGroup } from "../../types/group";

export interface GroupRowProps {
  group: EditorGroup;
  isSelected: boolean;
  isActive: boolean;
  editingNameId: string | null;
  editingName: string;
  onSelect: () => void;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onEditingNameChange: (name: string) => void;
}

export function GroupRow({
  group, isSelected, isActive,
  editingNameId, editingName,
  onSelect, onEnterEdit, onExitEdit,
  onDelete, onToggleLock,
  onStartRename, onCommitRename, onCancelRename, onEditingNameChange,
}: GroupRowProps) {
  const isEditing = editingNameId === group.id;
  const memberCount = group.type === "line" ? group.lines.length : group.notes.length;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 6px", borderRadius: 6,
        border: isSelected ? "1px solid var(--accent-primary)" : "1px solid transparent",
        background: isActive ? "rgba(100, 200, 100, 0.08)" : isSelected ? "var(--bg-active)" : "transparent",
        cursor: "pointer", marginBottom: 2,
      }}
      onClick={onSelect}
      onDoubleClick={isActive ? onExitEdit : onEnterEdit}
    >
      {/* Color dot */}
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />

      {/* Type badge */}
      <span style={{
        fontSize: 8, fontWeight: 700, padding: "1px 3px", borderRadius: 3,
        background: group.type === "line" ? "rgba(108, 138, 255, 0.15)" : "rgba(56, 217, 169, 0.15)",
        color: group.type === "line" ? "var(--accent-primary)" : "#38d9a9",
        flexShrink: 0,
      }}>
        {group.type === "line" ? "L" : "N"}
      </span>

      {/* Name */}
      {isEditing ? (
        <input
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, fontSize: 11, padding: "1px 4px",
            background: "var(--bg-secondary)", color: "var(--text-primary)",
            border: "1px solid var(--accent-primary)", borderRadius: 4,
            outline: "none", fontFamily: "inherit", minWidth: 0,
          }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
        >
          {group.name}
        </span>
      )}

      {/* Member count */}
      <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>
        {memberCount}
      </span>

      {/* Lock indicator */}
      {group.locked && (
        <span style={{ fontSize: 9, color: "var(--text-muted)" }} title="Locked">{"\uD83D\uDD12"}</span>
      )}

      {/* Active indicator */}
      {isActive && (
        <span style={{ fontSize: 8, color: "#69db7c", fontWeight: 700 }}>EDIT</span>
      )}

      {/* Actions */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        style={{ fontSize: 10, padding: "0 2px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
        title={group.locked ? "Unlock" : "Lock"}
      >
        {group.locked ? "\uD83D\uDD13" : "\uD83D\uDD12"}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{ fontSize: 10, padding: "0 2px", background: "none", border: "none", color: "#ff4060", cursor: "pointer" }}
        title="Delete group"
      >
        x
      </button>
    </div>
  );
}

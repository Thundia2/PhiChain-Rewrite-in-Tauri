// ============================================================
// Line Drawer — Slide-out overlay for line management
//
// 210px wide panel that slides in from the left.
// Shows all lines with visibility/lock toggles.
// Supports: click to select, double-click rename, right-click
// context menu (Delete, Duplicate, Set Parent, Set Group),
// hierarchy indentation via father_index.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";

// ---- Context menu state ----
interface ContextMenu {
  x: number;
  y: number;
  lineIndex: number;
}

// ---- Compute indentation depth from father_index chain ----
function getDepth(lines: { father_index?: number }[], index: number): number {
  let depth = 0;
  let current = lines[index]?.father_index;
  const visited = new Set<number>();
  while (current != null && current >= 0 && current < lines.length && depth < 5) {
    if (visited.has(current)) break; // prevent cycles
    visited.add(current);
    depth++;
    current = lines[current]?.father_index;
  }
  return depth;
}

export function LineDrawer() {
  const lines = useChartStore((s) => s.chart.lines);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const drawerOpen = useEditorStore((s) => s.lineDrawerOpen);
  const toggleVisibility = useEditorStore((s) => s.toggleLineVisibility);
  const toggleLocked = useEditorStore((s) => s.toggleLineLocked);
  const lineVisibility = useEditorStore((s) => s.lineVisibility);
  const lineLocked = useEditorStore((s) => s.lineLocked);
  const addLine = useChartStore((s) => s.addLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const duplicateLine = useChartStore((s) => s.duplicateLine);
  const editLine = useChartStore((s) => s.editLine);

  // ---- Inline rename state ----
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ---- Context menu state ----
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus rename input when activated
  useEffect(() => {
    if (renamingIndex !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingIndex]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handleClose);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const commitRename = useCallback(() => {
    if (renamingIndex !== null) {
      editLine(renamingIndex, { name: renameValue });
      setRenamingIndex(null);
    }
  }, [renamingIndex, renameValue, editLine]);

  const handleContextMenu = useCallback((e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex: i });
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    const line = lines[i];
    setRenameValue(line?.name || `Line ${i}`);
    setRenamingIndex(i);
  }, [lines]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 210,
        zIndex: 20,
        background: "#16161dF0",
        borderRight: "1px solid var(--border-color)",
        backdropFilter: "blur(8px)",
        transform: drawerOpen ? "translateX(0)" : "translateX(-220px)",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        flexDirection: "column",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontWeight: 700, color: "#aaa", fontSize: 10, letterSpacing: 1 }}>
          LINES
        </span>
        <button
          onClick={() => addLine()}
          style={{
            background: "var(--accent-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "inherit",
          }}
        >
          + Add
        </button>
      </div>

      {/* Line list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {lines.map((line, i) => {
          const isSelected = selectedLineIndex === i;
          const isVisible = lineVisibility[i] !== false;
          const isLocked = lineLocked[i] === true;
          const depth = getDepth(lines, i);

          return (
            <div
              key={i}
              onClick={() => selectLine(i)}
              onContextMenu={(e) => handleContextMenu(e, i)}
              onDoubleClick={(e) => handleDoubleClick(e, i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 6px",
                paddingLeft: 6 + depth * 14,
                borderRadius: 4,
                cursor: "pointer",
                marginBottom: 1,
                background: isSelected ? "#6c8aff15" : "transparent",
                borderLeft: isSelected
                  ? "2px solid var(--accent-primary)"
                  : "2px solid transparent",
              }}
            >
              {/* Visibility toggle */}
              <span
                onClick={(e) => { e.stopPropagation(); toggleVisibility(i); }}
                style={{
                  fontSize: 10,
                  opacity: isVisible ? 0.4 : 0.15,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                title={isVisible ? "Hide line" : "Show line"}
              >
                {isVisible ? "\u{1F441}" : "\u{1F441}"}
              </span>

              {/* Lock toggle */}
              <span
                onClick={(e) => { e.stopPropagation(); toggleLocked(i); }}
                style={{
                  fontSize: 9,
                  opacity: isLocked ? 0.6 : 0.2,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                title={isLocked ? "Unlock line" : "Lock line"}
              >
                {isLocked ? "\u{1F512}" : "\u{1F513}"}
              </span>

              {/* Name (or inline rename input) */}
              {renamingIndex === i ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingIndex(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    background: "var(--bg-active)",
                    border: "1px solid var(--accent-primary)",
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: "#e0e0e8",
                    fontSize: 11,
                    fontFamily: "inherit",
                    outline: "none",
                    minWidth: 0,
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    color: isSelected ? "#e0e0e8" : "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {line.name || `Line ${i}`}
                </span>
              )}

              {/* Note count */}
              <span style={{ color: "#555", fontSize: 9, flexShrink: 0 }}>
                {line.notes.length}N
              </span>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 4,
            padding: "4px 0",
            zIndex: 100,
            minWidth: 140,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {[
            { label: "Rename", action: () => {
              const line = lines[contextMenu.lineIndex];
              setRenameValue(line?.name || `Line ${contextMenu.lineIndex}`);
              setRenamingIndex(contextMenu.lineIndex);
              setContextMenu(null);
            }},
            { label: "Duplicate", action: () => {
              duplicateLine(contextMenu.lineIndex);
              setContextMenu(null);
            }},
            { label: "Delete", action: () => {
              removeLine(contextMenu.lineIndex);
              setContextMenu(null);
            }},
            { label: "Set Parent...", action: () => {
              const val = prompt("Parent line index (-1 for none):", String(lines[contextMenu.lineIndex]?.father_index ?? -1));
              if (val !== null) {
                const idx = parseInt(val);
                editLine(contextMenu.lineIndex, { father_index: idx === -1 ? undefined : idx });
              }
              setContextMenu(null);
            }},
            { label: "Set Group...", action: () => {
              const val = prompt("Group number:", String(lines[contextMenu.lineIndex]?.group ?? 0));
              if (val !== null) {
                const num = parseInt(val);
                editLine(contextMenu.lineIndex, { group: isNaN(num) ? undefined : num === 0 ? undefined : num });
              }
              setContextMenu(null);
            }},
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 12px",
                background: "transparent",
                border: "none",
                color: item.label === "Delete" ? "#ff6b6b" : "#ccc",
                cursor: "pointer",
                fontSize: 11,
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

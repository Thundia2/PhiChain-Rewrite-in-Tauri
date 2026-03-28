// ============================================================
// Line Context Menu — Right-click menu for LineList items
//
// Actions: Open Event Editor, Duplicate, Delete, Set Category.
// ============================================================

import { useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useTabStore } from "../../stores/tabStore";
import {
  LINE_CATEGORY_COLORS,
  LINE_CATEGORY_LABELS,
} from "./lineCategories";

interface LineContextMenuProps {
  x: number;
  y: number;
  lineIndex: number;
  onClose: () => void;
}

export function LineContextMenu({
  x,
  y,
  lineIndex,
  onClose,
}: LineContextMenuProps) {
  const line = useChartStore((s) => s.chart.lines[lineIndex]);
  const editLine = useChartStore((s) => s.editLine);
  const removeLine = useChartStore((s) => s.removeLine);
  const duplicateLine = useChartStore((s) => s.duplicateLine);
  const openLineEventEditor = useTabStore((s) => s.openLineEventEditor);
  const [showCategorySubmenu, setShowCategorySubmenu] = useState(false);

  if (!line) return null;

  // Clamp menu position to viewport
  const menuWidth = 200;
  const menuHeight = 260;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 99 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      {/* Menu */}
      <div
        style={{
          position: "fixed",
          left: clampedX,
          top: clampedY,
          zIndex: 100,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: 4,
          minWidth: menuWidth,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <MenuItem
          label="Open Event Editor"
          onClick={() => {
            openLineEventEditor(lineIndex, line.name);
            onClose();
          }}
        />
        <MenuItem
          label="Duplicate Line"
          onClick={() => {
            duplicateLine(lineIndex);
            onClose();
          }}
        />
        <MenuItem
          label="Delete Line"
          onClick={() => {
            removeLine(lineIndex);
            onClose();
          }}
          danger
        />
        <MenuSeparator />
        <MenuItem
          label={`Category ${showCategorySubmenu ? "▾" : "▸"}`}
          onClick={() => setShowCategorySubmenu(!showCategorySubmenu)}
        />
        {showCategorySubmenu && (
          <div style={{ paddingLeft: 8 }}>
            {(["gameplay", "visual", "text", "helper"] as const).map((cat) => (
              <MenuItem
                key={cat}
                label={LINE_CATEGORY_LABELS[cat]}
                icon={
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: LINE_CATEGORY_COLORS[cat],
                      display: "inline-block",
                      marginRight: 6,
                      flexShrink: 0,
                    }}
                  />
                }
                active={line._category === cat}
                onClick={() => {
                  editLine(lineIndex, { _category: cat });
                  onClose();
                }}
              />
            ))}
            <MenuSeparator />
            <MenuItem
              label="None"
              active={!line._category}
              onClick={() => {
                editLine(lineIndex, { _category: undefined });
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
  active,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 10px",
        fontSize: 11,
        cursor: "pointer",
        borderRadius: 4,
        color: danger
          ? "var(--error)"
          : active
            ? "var(--accent-primary)"
            : "var(--text-primary)",
        display: "flex",
        alignItems: "center",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--bg-active)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {icon}
      {label}
    </div>
  );
}

function MenuSeparator() {
  return (
    <div
      style={{
        height: 1,
        backgroundColor: "var(--border-color)",
        margin: "4px 0",
      }}
    />
  );
}

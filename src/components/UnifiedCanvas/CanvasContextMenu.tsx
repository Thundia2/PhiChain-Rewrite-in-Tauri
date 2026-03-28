// ============================================================
// Canvas Context Menu — Right-click menu on Unified Canvas
//
// Quick event creation: set X/Y at clicked position, set
// rotation/opacity with numeric input, create transitions.
// ============================================================

import { createQuickConstant, createQuickTransition } from "../../utils/quickEventCreate";

interface CanvasContextMenuProps {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  beat: number;
  lineIndex: number;
  onClose: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  canvasX,
  canvasY,
  beat,
  lineIndex,
  onClose,
}: CanvasContextMenuProps) {
  const beatLabel = beat.toFixed(2);

  const menuWidth = 240;
  const menuHeight = 220;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const handleSetXY = () => {
    createQuickConstant(lineIndex, "x", beat, canvasX);
    createQuickConstant(lineIndex, "y", beat, canvasY);
    onClose();
  };

  const handleSetX = () => {
    createQuickConstant(lineIndex, "x", beat, canvasX);
    onClose();
  };

  const handleSetY = () => {
    createQuickConstant(lineIndex, "y", beat, canvasY);
    onClose();
  };

  const handleSetRotation = () => {
    const val = prompt("Rotation (degrees):", "0");
    if (val !== null) {
      createQuickConstant(lineIndex, "rotation", beat, parseFloat(val) || 0);
    }
    onClose();
  };

  const handleSetOpacity = () => {
    const val = prompt("Opacity (0-255):", "255");
    if (val !== null) {
      createQuickConstant(lineIndex, "opacity", beat, Math.max(0, Math.min(255, parseInt(val) || 0)));
    }
    onClose();
  };

  const handleTransitionToHere = () => {
    createQuickTransition(lineIndex, "x", canvasX);
    createQuickTransition(lineIndex, "y", canvasY);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 99 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
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
        <CtxMenuItem label={`Set X/Y at beat ${beatLabel}`} onClick={handleSetXY} />
        <CtxMenuItem label={`Set X at beat ${beatLabel}`} onClick={handleSetX} />
        <CtxMenuItem label={`Set Y at beat ${beatLabel}`} onClick={handleSetY} />
        <CtxMenuSeparator />
        <CtxMenuItem label={`Set rotation at beat ${beatLabel}`} onClick={handleSetRotation} />
        <CtxMenuItem label={`Set opacity at beat ${beatLabel}`} onClick={handleSetOpacity} />
        <CtxMenuSeparator />
        <CtxMenuItem label="Create transition to here" onClick={handleTransitionToHere} />
      </div>
    </>
  );
}

function CtxMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 10px",
        fontSize: 11,
        cursor: "pointer",
        borderRadius: 4,
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-active)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {label}
    </div>
  );
}

function CtxMenuSeparator() {
  return <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />;
}

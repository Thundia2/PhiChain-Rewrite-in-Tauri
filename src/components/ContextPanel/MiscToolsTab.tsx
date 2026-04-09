// ============================================================
// MiscToolsTab — Windows Explorer-style grid of tool cards
//
// 2-column grid of cards with large icon, label, hover border,
// and a pin toggle (visible on hover or when pinned).
// Pinned items show in the ContextPanelHeader quick-access bar.
// ============================================================

import { useState, useCallback } from "react";
import { useContextPanelStore } from "../../stores/contextPanelStore";

// ---- Tool definitions ----

interface MiscTool {
  id: string;
  label: string;
  icon: string;
  actionKey: keyof MiscToolsTabProps;
}

// Tools section — dialog shortcuts
const MISC_TOOLS: MiscTool[] = [
  { id: "paste-special", label: "Paste Special", icon: "\uD83D\uDCCB", actionKey: "onShowPasteSpecial" },
  { id: "record-review", label: "Record Review", icon: "\uD83C\uDF99", actionKey: "onShowRecordReview" },
  { id: "export-diff", label: "Export Diff", icon: "\uD83D\uDCCA", actionKey: "onShowExportDiff" },
  { id: "selective-export", label: "Selective Export", icon: "\uD83D\uDCE6", actionKey: "onShowSelectiveExport" },
  { id: "go-to-beat", label: "Go to Beat", icon: "\u2386", actionKey: "onShowGoToBeat" },
];

// Quick actions section
const QUICK_ACTION_TOOLS: MiscTool[] = [
  { id: "batch-lines", label: "Batch Create Lines", icon: "\u2630", actionKey: "onShowBatchLine" },
  { id: "lyrics-sync", label: "Lyrics Sync", icon: "\u266A", actionKey: "onShowLyricsSync" },
  { id: "parametric", label: "Parametric Trajectory", icon: "\u223F", actionKey: "onShowParametric" },
  { id: "spin-generator", label: "Spin / Rotation", icon: "\u21BB", actionKey: "onShowSpinGenerator" },
  { id: "shake-generator", label: "Shake / Oscillation", icon: "\u301C", actionKey: "onShowShakeGenerator" },
];

// ---- Props ----

export interface MiscToolsTabProps {
  // Dialog tools
  onShowPasteSpecial?: () => void;
  onShowRecordReview?: () => void;
  onShowExportDiff?: () => void;
  onShowSelectiveExport?: () => void;
  onShowGoToBeat?: () => void;
  // Quick actions
  onShowBatchLine?: () => void;
  onShowLyricsSync?: () => void;
  onShowParametric?: () => void;
  onShowSpinGenerator?: () => void;
  onShowShakeGenerator?: () => void;
}

// ---- Component ----

export function MiscToolsTab(props: MiscToolsTabProps) {
  const pinnedMiscItems = useContextPanelStore((s) => s.pinnedMiscItems);
  const togglePinMiscItem = useContextPanelStore((s) => s.togglePinMiscItem);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleClick = useCallback(
    (tool: MiscTool) => {
      const fn = props[tool.actionKey];
      if (typeof fn === "function") (fn as () => void)();
    },
    [props],
  );

  // Renders a single tool card
  const renderCard = (tool: MiscTool) => {
    const isPinned = pinnedMiscItems.includes(tool.id);
    const isHovered = hoveredId === tool.id;

    return (
      <button
        key={tool.id}
        onClick={() => handleClick(tool)}
        onMouseEnter={() => setHoveredId(tool.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "12px 8px 10px",
          minHeight: 80,
          borderRadius: 8,
          border: isHovered
            ? "1px solid var(--accent-primary)"
            : "1px solid var(--border-color)",
          background: isHovered
            ? "rgba(108,138,255,0.05)"
            : "var(--bg-primary)",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "center",
          transition: "all 0.15s",
        }}
      >
        {/* Pin toggle -- visible on hover or when pinned */}
        {(isHovered || isPinned) && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              togglePinMiscItem(tool.id);
            }}
            title={isPinned ? "Unpin from header" : "Pin to header"}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 3,
              fontSize: 10,
              cursor: "pointer",
              color: isPinned ? "var(--accent-primary)" : "var(--text-muted)",
              background: isPinned ? "rgba(108,138,255,0.12)" : "transparent",
              opacity: isPinned ? 1 : 0.6,
              transition: "all 0.12s",
            }}
          >
            {"\uD83D\uDCCC"}
          </div>
        )}

        {/* Icon area */}
        <span style={{ fontSize: 24, lineHeight: 1 }}>{tool.icon}</span>

        {/* Label */}
        <span
          style={{
            fontSize: 11,
            color: isHovered ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: isHovered ? 500 : 400,
            lineHeight: 1.2,
            transition: "color 0.12s",
          }}
        >
          {tool.label}
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Tools section */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.5px", padding: "0 2px 6px" }}>
          Tools
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, padding: 2 }}>
          {MISC_TOOLS.map(renderCard)}
        </div>
      </div>

      {/* Quick actions section */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.5px", padding: "0 2px 6px" }}>
          Quick Actions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, padding: 2 }}>
          {QUICK_ACTION_TOOLS.map(renderCard)}
        </div>
      </div>
    </div>
  );
}

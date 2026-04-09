// ============================================================
// ContextPanelHeader — Title bar + pinned items strip
//
// Renders the mode-aware header row with pop-out / collapse
// controls and an optional row of pinned misc-tool shortcuts.
// ============================================================

import { useContextPanelStore } from "../../stores/contextPanelStore";
import type { ContextPanelMode } from "../../hooks/useContextPanelMode";
import { MODE_CONFIG } from "../../hooks/useContextPanelMode";

const MISC_TOOL_ICONS: Record<string, string> = {
  "paste-special": "\u{1F4CB}",
  "record-review": "\u{1F399}",
  "export-diff": "\u{1F4CA}",
  "selective-export": "\u{1F4E6}",
  "go-to-beat": "\u2386",
};

export function ContextPanelHeader({
  mode,
  modeDetail,
  onPopout,
  onCollapse,
  onPinnedItemClick,
}: {
  mode: ContextPanelMode;
  modeDetail?: string;
  onPopout: () => void;
  onCollapse: () => void;
  onPinnedItemClick: (itemId: string) => void;
}) {
  const pinnedItems = useContextPanelStore((s) => s.pinnedMiscItems);
  const config = MODE_CONFIG[mode];

  return (
    <>
      {/* Title bar */}
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 6,
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}
      >
        {/* Mode icon */}
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <circle
            cx={7}
            cy={7}
            r={5}
            stroke="var(--accent-primary)"
            strokeWidth={1.5}
            fill="none"
          />
          <circle cx={7} cy={7} r={2} fill="var(--accent-primary)" />
        </svg>

        {/* Title */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {config.label}
          {modeDetail && (
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
              {" "}
              {modeDetail}
            </span>
          )}
        </span>

        <div style={{ flex: 1 }} />

        {/* Pop-out button */}
        <HeaderIconButton onClick={onPopout} title="Pop out to window" label={"\u2197"} />

        {/* Collapse button */}
        <HeaderIconButton onClick={onCollapse} title="Collapse panel" label={"\u2715"} fontSize={11} />
      </div>

      {/* Pinned items bar (only shown when there are pinned items) */}
      {pinnedItems.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "3px 10px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          {pinnedItems.map((itemId) => (
            <button
              key={itemId}
              onClick={() => onPinnedItemClick(itemId)}
              title={itemId.replace(/-/g, " ")}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-secondary)",
                fontFamily: "inherit",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--accent-primary)";
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(108,138,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-color)";
                (e.currentTarget as HTMLElement).style.background =
                  "var(--bg-primary)";
              }}
            >
              {MISC_TOOL_ICONS[itemId] ?? "?"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ----- Small reusable icon button used by the header -----

function HeaderIconButton({
  onClick,
  title,
  label,
  fontSize = 14,
}: {
  onClick: () => void;
  title: string;
  label: string;
  fontSize?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize,
        fontFamily: "inherit",
        padding: "0 4px",
        borderRadius: 3,
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)";
        (e.currentTarget as HTMLElement).style.background =
          "rgba(108,138,255,0.1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        (e.currentTarget as HTMLElement).style.background = "none";
      }}
    >
      {label}
    </button>
  );
}

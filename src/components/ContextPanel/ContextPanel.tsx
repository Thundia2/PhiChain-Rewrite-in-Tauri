// ============================================================
// ContextPanel — Root context panel component
//
// Auto-detects the active mode from the editor selection state
// and renders the appropriate header, tab bar, and content area.
// ============================================================

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useContextPanelMode, MODE_TABS } from "../../hooks/useContextPanelMode";
import { useContextPanelStore } from "../../stores/contextPanelStore";
import { ContextPanelHeader } from "./ContextPanelHeader";
import { GlobalMode } from "./modes/GlobalMode";
import { LineMode } from "./modes/LineMode";
import { NoteMode } from "./modes/NoteMode";
import { EventMode } from "./modes/EventMode";
import { MultiLineMode } from "./modes/MultiLineMode";
import { MiscToolsTab } from "./MiscToolsTab";
import { StepRecordBanner } from "./StepRecordBanner";

// ---- Props ----

export interface ContextPanelProps {
  // Dialog callbacks (misc tools)
  onShowPasteSpecial?: () => void;
  onShowRecordReview?: () => void;
  onShowExportDiff?: () => void;
  onShowSelectiveExport?: () => void;
  onShowGoToBeat?: () => void;
  // Quick action callbacks
  onShowBatchLine?: () => void;
  onShowLyricsSync?: () => void;
  onShowParametric?: () => void;
  onShowSpinGenerator?: () => void;
  onShowShakeGenerator?: () => void;
  // Panel/window controls
  onPopout?: () => void;
  onCollapse?: () => void;
}

// ---- Misc tool action map ----

const MISC_ACTION_MAP: Record<string, keyof ContextPanelProps> = {
  "paste-special": "onShowPasteSpecial",
  "record-review": "onShowRecordReview",
  "export-diff": "onShowExportDiff",
  "selective-export": "onShowSelectiveExport",
  "go-to-beat": "onShowGoToBeat",
  "spin-generator": "onShowSpinGenerator",
  "shake-generator": "onShowShakeGenerator",
};

// ---- Component ----

export function ContextPanel(props: ContextPanelProps) {
  const {
    onPopout = () => {},
    onCollapse = () => {},
  } = props;

  const mode = useContextPanelMode();
  const tabs = MODE_TABS[mode];
  const defaultTab = tabs[0]?.id ?? "actions";

  const activeTab = useContextPanelStore((s) => s.getActiveTab(mode, defaultTab));
  const setActiveTab = useContextPanelStore((s) => s.setActiveTab);

  // Track mode+tab to trigger fade animation
  const fadeKey = `${mode}:${activeTab}`;
  const fadeRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef(fadeKey);

  useEffect(() => {
    if (prevKeyRef.current !== fadeKey && fadeRef.current) {
      const el = fadeRef.current;
      el.style.animation = "none";
      // Force reflow
      void el.offsetHeight;
      el.style.animation = "";
      prevKeyRef.current = fadeKey;
    }
  }, [fadeKey]);

  // Handle tab click
  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(mode, tabId);
    },
    [mode, setActiveTab],
  );

  // Handle pinned misc item click
  const handlePinnedItemClick = useCallback(
    (itemId: string) => {
      const propKey = MISC_ACTION_MAP[itemId];
      if (propKey) {
        const fn = props[propKey];
        if (typeof fn === "function") (fn as () => void)();
      }
    },
    [props],
  );

  // Build the content for the active tab
  // Collect all action callbacks to pass down to GlobalMode and MiscToolsTab
  const actionProps = {
    onShowPasteSpecial: props.onShowPasteSpecial,
    onShowRecordReview: props.onShowRecordReview,
    onShowExportDiff: props.onShowExportDiff,
    onShowSelectiveExport: props.onShowSelectiveExport,
    onShowGoToBeat: props.onShowGoToBeat,
    onShowBatchLine: props.onShowBatchLine,
    onShowLyricsSync: props.onShowLyricsSync,
    onShowParametric: props.onShowParametric,
    onShowSpinGenerator: props.onShowSpinGenerator,
    onShowShakeGenerator: props.onShowShakeGenerator,
  };

  const content = useMemo(() => {
    // Misc tab is shared across all modes
    if (activeTab === "misc") return <MiscToolsTab {...actionProps} />;

    switch (mode) {
      case "global": return <GlobalMode activeTab={activeTab} {...actionProps} />;
      case "line": return <LineMode activeTab={activeTab} />;
      case "note": return <NoteMode activeTab={activeTab} />;
      case "event": return <EventMode activeTab={activeTab} />;
      case "multi": return <MultiLineMode activeTab={activeTab} />;
      default: return null;
    }
  }, [mode, activeTab, actionProps]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-secondary)",
        overflow: "hidden",
      }}
    >
      {/* Scoped fade animation */}
      <style>{`@keyframes ctxFadeIn { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: none; } }`}</style>

      {/* Header */}
      <ContextPanelHeader
        mode={mode}
        onPopout={onPopout}
        onCollapse={onCollapse}
        onPinnedItemClick={handlePinnedItemClick}
      />

      {/* Tab bar */}
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "stretch",
          background: "var(--bg-accent)",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TabButton
              key={tab.id}
              label={tab.label}
              isActive={isActive}
              onClick={() => handleTabClick(tab.id)}
            />
          );
        })}
      </div>

      {/* Content area */}
      <div
        ref={fadeRef}
        className="ctx-fade"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: 8,
          animation: "ctxFadeIn 0.18s ease-out",
        }}
      >
        {/* Step recording banner — appears in ALL modes when active */}
        <StepRecordBanner />
        {content}
      </div>
    </div>
  );
}

// ---- Tab button ----

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 10px",
        height: "100%",
        fontSize: 11,
        fontWeight: isActive ? 600 : 400,
        fontFamily: "inherit",
        cursor: "pointer",
        border: "none",
        borderBottom: isActive
          ? "2px solid var(--accent-primary)"
          : "2px solid transparent",
        background: isActive ? "var(--bg-secondary)" : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
        whiteSpace: "nowrap",
        transition: "color 0.12s, background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.03)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
    >
      {label}
    </button>
  );
}


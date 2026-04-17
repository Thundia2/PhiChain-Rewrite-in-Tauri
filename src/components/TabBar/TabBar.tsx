// ============================================================
// Tab Bar — Horizontal tab strip for editor views
//
// Renders all open tabs with view-type badges, inline rename
// on double-click or F2/command palette, and settings-driven
// sizing (tabHeight, tabMaxWidth from settingsStore).
//
// Recent change: Added view-type badges, inline rename support,
// configurable tab dimensions, and double-click-to-rename.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { TabType } from "../../stores/tabStore";

// Badge labels for each editor tab type — shown as a small tag
// inside the tab to distinguish view types at a glance.
const TAB_TYPE_BADGE: Partial<Record<TabType, string>> = {
  unified_editor: "Unified",
  unrolled_editor: "Unrolled",
  chart: "Classic",
  line_event_editor: "Events",
};

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const updateTabLabel = useTabStore((s) => s.updateTabLabel);
  const renamingTabId = useTabStore((s) => s.renamingTabId);
  const startRenameTab = useTabStore((s) => s.startRenameTab);
  const clearRenaming = useTabStore((s) => s.clearRenaming);

  // Settings-driven tab dimensions
  const tabHeight = useSettingsStore((s) => s.tabHeight);
  const tabMaxWidth = useSettingsStore((s) => s.tabMaxWidth);

  // ---- Inline rename state ----
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus and select input text when rename mode activates
  useEffect(() => {
    if (renamingTabId) {
      const tab = useTabStore.getState().tabs.find((t) => t.id === renamingTabId);
      if (tab) setRenameValue(tab.label);
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingTabId]);

  // Commit the rename: update label if non-empty, then exit rename mode
  const commitRename = useCallback(() => {
    if (renamingTabId && renameValue.trim()) {
      updateTabLabel(renamingTabId, renameValue.trim());
    }
    clearRenaming();
  }, [renamingTabId, renameValue, updateTabLabel, clearRenaming]);

  return (
    <div
      className="flex items-end flex-shrink-0 overflow-x-auto"
      style={{
        height: tabHeight + 4,
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const badge = TAB_TYPE_BADGE[tab.type];
        const isRenaming = renamingTabId === tab.id;

        return (
          <button
            key={tab.id}
            className={`tab-button${isActive ? " active" : ""}`}
            style={{
              height: tabHeight,
              maxWidth: tabMaxWidth,
            }}
            onClick={() => setActiveTab(tab.id)}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1 && tab.closable) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
            onDoubleClick={() => {
              // Double-click to rename (only closable/non-system tabs)
              if (tab.closable) {
                startRenameTab(tab.id);
              }
            }}
          >
            {/* View-type badge (Unified, Unrolled, Classic, Events) */}
            {badge && (
              <span className="tab-type-badge">{badge}</span>
            )}

            {/* Tab label — or inline rename input when active */}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") clearRenaming();
                  // Prevent hotkeys from firing while typing
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  background: "var(--bg-active)",
                  border: "1px solid var(--accent-primary)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontFamily: "inherit",
                  outline: "none",
                  minWidth: 0,
                }}
              />
            ) : (
              <span className="truncate">{tab.label}</span>
            )}

            {/* Close button — visible on hover/active */}
            {tab.closable && (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ✕
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

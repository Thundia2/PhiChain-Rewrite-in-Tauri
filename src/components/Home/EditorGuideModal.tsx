// ============================================================
// Interactive Editor Guide Modal — Thin Orchestrator
//
// A tab-based, animation-rich beginner's guide to the PhiChain
// editor. Content is split across sibling files:
//   guideData.ts        — pure data constants + easing math
//   guideComponents.tsx  — shared UI atoms (Kbd, GCard, STitle)
//   guideAnimations.tsx  — interactive SVG animations
//   guideTabs.tsx        — per-tab content components
//
// This file is just the modal shell: sidebar, tab routing,
// footer navigation, and keyboard/lifecycle management.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { TABS } from "./guideData";
import {
  WelcomeTab, CanvasTab, NotesTab, EventsTab, EasingsTab,
  ToolsTab, PanelsTab, ShortcutsTab, AdvancedTab, TipsTab,
} from "./guideTabs";

// ---- Props ----

interface EditorGuideModalProps {
  open: boolean;
  onClose: () => void;
}

// ---- Main Export ----

export function EditorGuideModal({ open, onClose }: EditorGuideModalProps) {
  const [activeTab, setActiveTab] = useState("welcome");
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  // Reset scroll on tab change
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  // Reset to welcome on open
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setActiveTab("welcome");
  }, [open]);

  const tabIndex = TABS.findIndex(t => t.id === activeTab);
  const isLastTab = tabIndex === TABS.length - 1;

  const goNext = useCallback(() => {
    if (isLastTab) { onClose(); return; }
    setActiveTab(TABS[tabIndex + 1].id);
  }, [tabIndex, isLastTab, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(4px)",
      }}
    >
      <div style={{
        width: 760, maxWidth: "92vw", maxHeight: "82vh",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "guideScaleIn 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderBottom: "1px solid var(--border-color)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--accent-primary)" }}>Editor Guide</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
              {TABS[tabIndex]?.label}
            </span>
          </div>
          <button onClick={onClose} style={{
            cursor: "pointer", color: "var(--text-muted)", fontSize: 16,
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, backgroundColor: "var(--bg-active)", border: "none",
          }}>{"\u2715"}</button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{
            width: 160, flexShrink: 0,
            background: "var(--bg-primary)",
            borderRight: "1px solid var(--border-color)",
            overflowY: "auto", padding: "6px 0",
          }}>
            {TABS.map((tab, i) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 14px", border: "none",
                borderLeft: activeTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                background: activeTab === tab.id ? "var(--bg-active)" : "transparent",
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", fontSize: 11, fontWeight: activeTab === tab.id ? 600 : 400,
                textAlign: "left", transition: "background 0.1s",
              }}>
                <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {i <= tabIndex && i !== tabIndex && (
                  <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 9 }}>{"\u2713"}</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {activeTab === "welcome" && <WelcomeTab />}
            {activeTab === "canvas" && <CanvasTab active={activeTab === "canvas"} />}
            {activeTab === "notes" && <NotesTab active={activeTab === "notes"} />}
            {activeTab === "events" && <EventsTab active={activeTab === "events"} />}
            {activeTab === "easings" && <EasingsTab active={activeTab === "easings"} />}
            {activeTab === "tools" && <ToolsTab />}
            {activeTab === "panels" && <PanelsTab />}
            {activeTab === "shortcuts" && <ShortcutsTab />}
            {activeTab === "advanced" && <AdvancedTab />}
            {activeTab === "tips" && <TipsTab />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 18px", borderTop: "1px solid var(--border-color)", flexShrink: 0,
        }}>
          {/* Pagination dots */}
          <div style={{ display: "flex", gap: 5 }}>
            {TABS.map((tab, i) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: 7, height: 7, borderRadius: 7, border: "none", cursor: "pointer", padding: 0,
                background: i === tabIndex ? "var(--accent-primary)" : i < tabIndex ? "var(--accent-primary)" : "var(--border-color)",
                opacity: i === tabIndex ? 1 : i < tabIndex ? 0.4 : 0.3,
                transition: "background 0.2s",
              }} title={tab.label} />
            ))}
          </div>
          {/* Next / Done */}
          <button onClick={goNext} style={{
            padding: "5px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: "none", cursor: "pointer",
            background: "var(--accent-primary)", color: "#fff",
            transition: "opacity 0.15s",
          }}>
            {isLastTab ? "Done" : "Next \u2192"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared HotkeyButton — small button showing icon, label, and hotkey hint
// Extracted from 5 duplicate definitions across ContextPanel mode files

import React from "react";

export function HotkeyButton({ icon, label, hotkey, active, style, onClick }: {
  icon: string; label: string; hotkey: string;
  active?: boolean; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} (${hotkey})`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 2, padding: "6px 2px", borderRadius: 6,
        background: active ? "rgba(108,138,255,0.12)" : "var(--bg-primary)",
        border: active ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
        cursor: "pointer", minHeight: 42, fontFamily: "inherit",
        transition: "all 0.15s",
        ...style,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, color: active ? "var(--accent-primary)" : undefined }}>{icon}</span>
      <span style={{ fontSize: 8, color: active ? "var(--accent-primary)" : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", textAlign: "center" }}>{label}</span>
      <span style={{ fontSize: 8, color: "var(--text-muted)", opacity: 0.6, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{hotkey}</span>
    </button>
  );
}

// Shared ContextBadge — colored info badge showing mode/selection context
// Extracted from 5 duplicate definitions across ContextPanel mode files

import React from "react";

export function ContextBadge({ icon, label, detail, variant }: { icon: React.ReactNode; label: string; detail?: string; variant: "line" | "note" | "event" | "global" }) {
  const colors = { line: "108,138,255", note: "72,181,255", event: "255,107,107", global: "255,255,255" };
  const c = colors[variant];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", marginBottom: 6, borderRadius: 6, fontSize: 11, background: `rgba(${c},0.08)`, border: `1px solid rgba(${c},0.2)`, color: `rgba(${c},0.85)` }}>
      {icon}
      <span style={{ fontWeight: 600 }}>{label}</span>
      {detail && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: "auto" }}>{detail}</span>}
    </div>
  );
}

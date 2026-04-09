// Shared ActionButton — full-width row button with icon and label
// Extracted from 5 duplicate definitions across ContextPanel mode files

export function ActionButton({ icon, label, danger, onClick }: { icon: string; label: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 10px",
        background: "none", border: "none", borderRadius: 5,
        color: danger ? "var(--error, #ff4a6a)" : "var(--text-secondary)",
        cursor: "pointer", fontSize: 11, fontFamily: "inherit", textAlign: "left",
        transition: "all 0.12s",
      }}
    >
      <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );
}

// Shared SectionHeader — small uppercase label with optional count badge and add button
// Extracted from 5 duplicate definitions across ContextPanel mode files

export function SectionHeader({ label, count, onAdd }: { label: string; count?: number; onAdd?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px", cursor: "pointer", borderRadius: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        {count !== undefined && <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 8, fontWeight: 600 }}>{count}</span>}
      </span>
      {onAdd && (
        <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "0 4px", borderRadius: 3, lineHeight: 1 }} onClick={onAdd}>+</button>
      )}
    </div>
  );
}

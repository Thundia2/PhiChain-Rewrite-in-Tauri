// ============================================================
// Shared UI Kit — Design language primitives
//
// Extracted from SettingsModal, GroupManager, TransportBar.
// Every drawer panel and editor component should use these
// instead of raw HTML to maintain visual consistency.
// ============================================================

import { useState } from "react";

/* ── Style Constants ── */

export const INPUT_STYLE: React.CSSProperties = {
  height: 24,
  padding: "4px 8px",
  borderRadius: 6,
  fontSize: 11,
  border: "0.5px solid var(--border-color)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: "pointer",
};

/* ── Card ── */

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--bg-active)",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── CardRow ── */

export function CardRow({
  label,
  description,
  children,
  last = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderBottom: last ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--text-primary)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>
    </div>
  );
}

/* ── SectionHeader ── */

export function SectionHeader({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: color || "var(--text-muted)",
        marginBottom: 8,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

/* ── ActionButton ── */

export function ActionButton({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
  style,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "primary" | "danger" | "default";
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
}) {
  const bg =
    variant === "danger"
      ? "var(--error)"
      : variant === "primary"
        ? "var(--accent-primary)"
        : "var(--bg-active)";
  const fg = variant === "primary" || variant === "danger" ? "#fff" : "var(--text-primary)";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        border: "none",
        fontSize: 10,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        background: bg,
        color: fg,
        transition: "all 0.15s",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── Badge ── */

export function Badge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 10,
        fontSize: 9,
        fontWeight: 600,
        background: `${color}20`,
        color: color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ── Pill ── */

export function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "3px 10px",
        borderRadius: 6,
        border: "none",
        fontSize: 10,
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 500,
        transition: "all 0.15s",
        background: active
          ? "var(--accent-primary)"
          : hovered
            ? "rgba(108, 138, 255, 0.09)"
            : "transparent",
        color: active
          ? "#fff"
          : hovered
            ? "var(--accent-primary)"
            : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

/* ── Toggle ── */

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 32,
        height: 18,
        borderRadius: 9,
        border: "none",
        cursor: "pointer",
        transition: "background-color 0.2s",
        backgroundColor: checked ? "var(--accent-primary)" : "var(--bg-active)",
        padding: 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#fff",
          transition: "transform 0.2s",
          transform: checked ? "translateX(17px)" : "translateX(3px)",
        }}
      />
    </button>
  );
}

/* ── EmptyState ── */

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 11,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// Toast Container — Renders notification toasts bottom-right
// ============================================================

import { useEffect, useState } from "react";
import { useToastStore, type Toast } from "../../stores/toastStore";

const TYPE_COLORS: Record<Toast["type"], string> = {
  error: "#ff4a6a",
  info: "#6c8aff",
  success: "#4aff7a",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), toast.duration - 200);
    const removeTimer = setTimeout(() => removeToast(toast.id), toast.duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderLeft: `3px solid ${TYPE_COLORS[toast.type]}`,
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        maxWidth: 340,
        opacity: exiting ? 0 : 1,
        transform: exiting ? "translateX(12px)" : "translateX(0)",
        transition: "opacity 0.2s, transform 0.2s",
        animation: "toastSlideIn 0.2s ease-out",
      }}
    >
      <div style={{ flex: 1, fontSize: 12, lineHeight: "1.45", color: "var(--text-primary)" }}>
        {toast.message}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 11,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}

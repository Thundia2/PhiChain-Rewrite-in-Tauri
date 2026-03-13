// ============================================================
// Confirm Dialog — Promise-based styled replacement for confirm()
//
// Usage from anywhere:
//   import { showConfirm } from "./ConfirmDialog";
//   if (await showConfirm("Delete this item?")) { ... }
// ============================================================

import { create } from "zustand";

interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((result: boolean) => void) | null;
  showConfirm: (message: string) => Promise<boolean>;
  respond: (result: boolean) => void;
}

const useConfirmStore = create<ConfirmState>()((set, get) => ({
  open: false,
  message: "",
  resolve: null,

  showConfirm: (message: string) => {
    return new Promise<boolean>((resolve) => {
      // If already open, resolve the previous one as false
      const prev = get().resolve;
      if (prev) prev(false);
      set({ open: true, message, resolve });
    });
  },

  respond: (result: boolean) => {
    const { resolve } = get();
    if (resolve) resolve(result);
    set({ open: false, message: "", resolve: null });
  },
}));

/** Call from anywhere (including outside React) to show a styled confirm dialog */
export const showConfirm = (message: string) => useConfirmStore.getState().showConfirm(message);

export function ConfirmDialog() {
  const { open, message, respond } = useConfirmStore();

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes confirmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes confirmScaleIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
          animation: "confirmFadeIn 0.15s",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) respond(false); }}
      >
        <div
          style={{
            width: 380,
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            overflow: "hidden",
            animation: "confirmScaleIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 16 }}>&#x26A0;&#xFE0F;</span>
              <span style={{ fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>
                Confirm
              </span>
            </div>
            <button
              className="flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: "var(--bg-active)",
                color: "var(--text-muted)",
                fontSize: 14,
                cursor: "pointer",
                border: "none",
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              onClick={() => respond(false)}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 20px 24px", fontSize: 13, lineHeight: "1.55", color: "var(--text-primary)" }}>
            {message}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end"
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border-color)",
              gap: 8,
            }}
          >
            <button
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: "pointer",
                border: "none",
                background: "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onClick={() => respond(false)}
            >
              Cancel
            </button>
            <button
              style={{
                padding: "7px 20px",
                borderRadius: 8,
                fontSize: 12,
                backgroundColor: "var(--accent-primary)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 500,
                border: "none",
                transition: "opacity 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onClick={() => respond(true)}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Tooltip Component
//
// A lightweight tooltip that shows on hover. Used for onboarding
// hints and shortcut reminders across the UI.
// ============================================================

import { useState, useRef, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  shortcut?: string;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({
  content,
  shortcut,
  children,
  position = "top",
  delay = 400,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  const positionClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[position];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 ${positionClass} pointer-events-none`}
        >
          <div
            className="px-2 py-1 rounded text-[11px] whitespace-nowrap flex items-center gap-2"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <span>{content}</span>
            {shortcut && (
              <kbd
                className="px-1 py-0.5 rounded text-[9px] font-mono"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {shortcut}
              </kbd>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

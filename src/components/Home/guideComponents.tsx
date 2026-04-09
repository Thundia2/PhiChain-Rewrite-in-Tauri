// ============================================================
// Editor Guide — Shared UI Components & Animation Hook
//
// Small reusable atoms and the animation loop hook used by
// both the animation demos and the tab content components.
// ============================================================

import React, { useRef, useEffect } from "react";
import { easingFns } from "./guideData";

// ---- Animation Hook ----

/** Returns a ref containing elapsed seconds, driven by requestAnimationFrame */
export function useAnimationLoop(active: boolean): React.MutableRefObject<number> {
  const progressRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      progressRef.current = elapsed / 1000;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return progressRef;
}

// ---- Shared Atoms ----

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      background: "var(--bg-active)", border: "1px solid var(--border-color)",
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 10,
      color: "var(--text-primary)", lineHeight: "18px", whiteSpace: "nowrap",
    }}>{children}</kbd>
  );
}

export function GCard({ children, highlight, style: s }: { children: React.ReactNode; highlight?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-tertiary)", border: `1px solid ${highlight || "var(--border-color)"}`,
      borderRadius: 8, padding: "10px 12px", ...s,
    }}>{children}</div>
  );
}

export function STitle({ children, color = "var(--accent-primary)" }: { children: React.ReactNode; color?: string }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
      color, margin: "18px 0 8px", paddingBottom: 5,
      borderBottom: `1px solid ${color}33`,
    }}>{children}</h3>
  );
}

export function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: size, background: color, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />;
}

/** Small SVG easing curve thumbnail */
export function EasingMini({ name, size = 52 }: { name: string; size?: number }) {
  const fn = easingFns[name];
  if (!fn) return null;
  const pad = 5, w = size - pad * 2;
  const pts: string[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const v = fn(t);
    pts.push(`${pad + t * w},${size - pad - v * w}`);
  }
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <rect x={pad} y={pad} width={w} height={w} fill="none" stroke="var(--border-color)" strokeWidth="0.5" rx="2" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================
// XGridSection — Shared X-axis grid/snap control panel
//
// Used by both LineMode and GlobalMode in the ContextPanel.
// Replaces the duplicated X SNAP sections with a unified,
// modernised UI matching the PhiChain design system.
//
// Features:
//   - Pill-style toggle (visibility + snap coupled, RPE parity)
//   - Preset buttons [11, 21, 31, 17] (real-world charter values)
//   - Arbitrary N input (2..256)
//   - Spacing readout + even-N warning status pill
//
// Recent change: Created as part of X grid system rewrite.
// Replaces lanes→verticalLines convention, fixes center-line bug.
// ============================================================

import { useEditorStore } from "../../../stores/editorStore";
import { getXSpacing, hasCenterLine } from "../../../utils/xSnap";

// ---- Tunables ----

const N_PRESETS = [11, 21, 31, 17] as const;
const MAX_VERTICAL_LINES = 256;
const ACCENT = "#8b5cf6";
const ACCENT_SOFT = "rgba(139, 92, 246, 0.15)";
const ACCENT_BORDER = "rgba(139, 92, 246, 0.4)";
const ACCENT_TEXT = "#b89eff";

// ---- Component ----

export function XGridSection() {
  const verticalLines = useEditorStore((s) => s.verticalLines);
  const xSnapEnabled = useEditorStore((s) => s.xSnapEnabled);
  const setVerticalLines = useEditorStore((s) => s.setVerticalLines);
  const toggleXSnap = useEditorStore((s) => s.toggleXSnap);

  const spacing = getXSpacing(verticalLines);
  const spacingDisplay = spacing % 1 === 0 ? spacing.toFixed(0) : spacing.toFixed(2);
  const hasCenter = hasCenterLine(verticalLines);

  return (
    <div style={{
      background: "var(--bg-tertiary)",
      borderRadius: 5,
      padding: "10px 12px",
      borderLeft: `2px solid ${ACCENT}`,
    }}>
      {/* Row 1: Toggle + label + spacing readout */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {/* Pill-style toggle switch */}
        <button
          onClick={toggleXSnap}
          style={{
            width: 28, height: 18,
            borderRadius: 9,
            background: xSnapEnabled ? "rgba(139, 92, 246, 0.25)" : "var(--bg-active)",
            cursor: "pointer",
            position: "relative",
            transition: "background 0.15s",
            border: "none",
            flexShrink: 0,
            padding: 0,
          }}
        >
          {/* Toggle knob */}
          <span style={{
            position: "absolute",
            top: 2, left: 2,
            width: 14, height: 14,
            borderRadius: "50%",
            background: xSnapEnabled ? ACCENT : "var(--text-muted)",
            transition: "transform 0.15s, background 0.15s",
            transform: xSnapEnabled ? "translateX(10px)" : "translateX(0)",
          }} />
        </button>

        <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600, flex: 1 }}>
          X grid
        </span>

        <span style={{
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 10,
          color: "var(--text-muted)",
        }}>
          {verticalLines} lines · {spacingDisplay}
        </span>
      </div>

      {/* Row 2: Preset buttons + arbitrary N input */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", gap: 3 }}>
          {N_PRESETS.map((n) => {
            const isActive = verticalLines === n;
            return (
              <button
                key={n}
                onClick={() => {
                  setVerticalLines(n);
                  if (!xSnapEnabled) toggleXSnap();
                }}
                style={{
                  width: 26, height: 22,
                  fontSize: 10,
                  borderRadius: 3,
                  border: isActive ? `1px solid ${ACCENT_BORDER}` : "1px solid transparent",
                  background: isActive ? ACCENT_SOFT : "var(--bg-active)",
                  color: isActive ? ACCENT_TEXT : "var(--text-secondary)",
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  transition: "all 0.1s",
                  padding: 0,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <input
          type="number"
          min={2}
          max={MAX_VERTICAL_LINES}
          value={verticalLines}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) setVerticalLines(v);
          }}
          style={{
            width: 48, height: 22,
            padding: "0 6px",
            background: "var(--bg-active)",
            border: "1px solid var(--border-color)",
            borderRadius: 3,
            color: "var(--text-primary)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            textAlign: "center",
            marginLeft: "auto",
            outline: "none",
          }}
          onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border-color)"; }}
        />
      </div>

      {/* Status indicator — center line warning */}
      <div style={{
        marginTop: 8,
        padding: "6px 8px",
        borderRadius: 3,
        fontSize: 10,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: hasCenter ? "rgba(74, 255, 122, 0.07)" : "rgba(255, 212, 59, 0.07)",
        color: hasCenter ? "#6fc78a" : "#ddb842",
      }}>
        {/* Status dot */}
        <span style={{
          width: 6, height: 6,
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        }} />
        <span>
          {hasCenter
            ? "N is odd \u2014 center line at X=0 is snappable"
            : "N is even \u2014 no snap point at X=0"}
        </span>
      </div>
    </div>
  );
}

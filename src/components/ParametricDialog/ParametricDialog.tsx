// ============================================================
// Parametric Trajectory Dialog — Redesigned
//
// Modal dialog for generating line movement events from
// parametric sin/cos equations. Sectioned card layout matching
// the new dialog design system.
// ============================================================

import { useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { LineEventKind } from "../../types/chart";
import { generateParametricEvents, type ParametricConfig } from "../../utils/parametricTrajectory";

interface ParametricDialogProps {
  open: boolean;
  onClose: () => void;
}

/* ── Reusable sub-components ── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 12,
  border: "0.5px solid var(--border-color)",
  backgroundColor: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--accent-primary)";
}
function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--border-color)";
}

function CardRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "10px 14px",
        borderBottom: last ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-primary)", minWidth: 0 }}>{label}</span>
      <div className="flex-shrink-0 ml-3" style={{ width: 130 }}>{children}</div>
    </div>
  );
}

function CardRowWide({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: last ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
      }}
    >
      <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── Main Dialog ── */

export function ParametricDialog({ open, onClose }: ParametricDialogProps) {
  const [kind, setKind] = useState<LineEventKind>("x");
  const [startBeat, setStartBeat] = useState(0);
  const [endBeat, setEndBeat] = useState(16);
  const [steps, setSteps] = useState(32);
  const [amplitude, setAmplitude] = useState(200);
  const [frequency, setFrequency] = useState(1);
  const [phase, setPhase] = useState(0);
  const [offset, setOffset] = useState(0);
  const [waveform, setWaveform] = useState<"sin" | "cos">("sin");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGenerate = () => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();

    if (es.selectedLineIndex === null) {
      setError("Please select a line first.");
      return;
    }

    const config: ParametricConfig = {
      kind, startBeat, endBeat, steps, amplitude, frequency, phase, offset, waveform,
    };

    const events = generateParametricEvents(config);
    if (events.length === 0) {
      setError("No events generated. Check start/end beats and steps.");
      return;
    }

    for (const event of events) {
      cs.addEvent(es.selectedLineIndex, event);
    }

    setError(null);
    onClose();
  };

  return (
    <>
      <style>{`
        @keyframes paramFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes paramScaleIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
          animation: "paramFadeIn 0.15s",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="flex flex-col"
          style={{
            width: 420,
            maxHeight: "80vh",
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            overflow: "hidden",
            animation: "paramScaleIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 16 }}>〰️</span>
              <span style={{ fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>Parametric Trajectory</span>
            </div>
            <button
              className="flex items-center justify-center"
              style={{
                width: 28, height: 28, borderRadius: 6,
                backgroundColor: "var(--bg-active)", color: "var(--text-muted)",
                fontSize: 14, cursor: "pointer", border: "none", transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", padding: "16px 20px" }}>

            {/* WAVE PARAMETERS */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader>Wave parameters</SectionHeader>
              <div style={{ backgroundColor: "var(--bg-active)", borderRadius: 10, overflow: "hidden" }}>
                <CardRowWide label="Event kind">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as LineEventKind)}
                    style={{ ...INPUT_STYLE, cursor: "pointer" }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  >
                    <option value="x">X Position</option>
                    <option value="y">Y Position</option>
                    <option value="rotation">Rotation</option>
                    <option value="opacity">Opacity</option>
                    <option value="scale_x">Scale X</option>
                    <option value="scale_y">Scale Y</option>
                  </select>
                </CardRowWide>
                <CardRow label="Waveform">
                  <select
                    value={waveform}
                    onChange={(e) => setWaveform(e.target.value as "sin" | "cos")}
                    style={{ ...INPUT_STYLE, cursor: "pointer" }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  >
                    <option value="sin">sin</option>
                    <option value="cos">cos</option>
                  </select>
                </CardRow>
                <CardRow label="Amplitude">
                  <input
                    type="number"
                    step="1"
                    value={amplitude}
                    onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Frequency">
                  <input
                    type="number"
                    step="0.1"
                    value={frequency}
                    onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Phase (rad)">
                  <input
                    type="number"
                    step="0.1"
                    value={phase}
                    onChange={(e) => setPhase(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Offset" last>
                  <input
                    type="number"
                    step="1"
                    value={offset}
                    onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
              </div>
            </div>

            {/* RANGE */}
            <div style={{ marginBottom: 16 }}>
              <SectionHeader>Range</SectionHeader>
              <div style={{ backgroundColor: "var(--bg-active)", borderRadius: 10, overflow: "hidden" }}>
                <CardRow label="Start beat">
                  <input
                    type="number"
                    step="0.25"
                    value={startBeat}
                    onChange={(e) => setStartBeat(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="End beat">
                  <input
                    type="number"
                    step="0.25"
                    value={endBeat}
                    onChange={(e) => setEndBeat(parseFloat(e.target.value) || 0)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Steps" last>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={steps}
                    onChange={(e) => setSteps(parseInt(e.target.value) || 1)}
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
              </div>
            </div>

            {/* Formula preview */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                backgroundColor: "var(--bg-active)",
                fontSize: 11,
                color: "var(--text-secondary)",
                lineHeight: "1.5",
                fontFamily: "monospace",
              }}
            >
              <div>{kind}(t) = {amplitude} * {waveform}({frequency} * t * 2π + {phase}) + {offset}</div>
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                Generates {steps} transition events from beat {startBeat} to {endBeat}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#ff6b6b",
                  backgroundColor: "rgba(255,70,70,0.1)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end flex-shrink-0"
            style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)", gap: 8 }}
          >
            <button
              style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12,
                color: "var(--text-secondary)", cursor: "pointer",
                border: "none", background: "transparent", transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              style={{
                padding: "7px 20px", borderRadius: 8, fontSize: 12,
                backgroundColor: "var(--accent-primary)", color: "#fff",
                cursor: "pointer", fontWeight: 500, border: "none",
                transition: "opacity 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onClick={handleGenerate}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

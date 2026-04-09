// ============================================================
// StepRecordBanner — persistent banner in the ContextPanel
// that appears when step recording is active.
//
// Shows status, step size presets, note kind selector, and exit.
// Renders above the mode content in all ContextPanel modes.
//
// Recent change: Initial creation for Section D (ContextPanel).
// ============================================================

import { useEditorStore } from "../../stores/editorStore";
import { STEP_PRESETS, formatStepSize } from "../../utils/stepPresets";
import { snapBeat, formatBeat } from "../../utils/beat";

export function StepRecordBanner() {
  const active = useEditorStore((s) => s.stepRecordActive);
  const currentBeat = useEditorStore((s) => s.stepRecordCurrentBeat);
  const noteKind = useEditorStore((s) => s.stepRecordNoteKind);
  const stepSize = useEditorStore((s) => s.stepRecordStepSize);
  const notesPlaced = useEditorStore((s) => s.stepRecordNotesPlaced);
  const density = useEditorStore((s) => s.density);
  const setStepSize = useEditorStore((s) => s.setStepRecordStepSize);
  const setNoteKind = useEditorStore((s) => s.setStepRecordNoteKind);
  const exitStepRecord = useEditorStore((s) => s.exitStepRecord);
  const halveStepSize = useEditorStore((s) => s.halveStepSize);
  const doubleStepSize = useEditorStore((s) => s.doubleStepSize);

  if (!active) return null;

  const beatLabel = formatBeat(snapBeat(currentBeat, density));
  const stepLabel = formatStepSize(stepSize);

  return (
    <div style={{
      margin: "0 0 6px 0",
      padding: "8px",
      background: "rgba(34, 211, 238, 0.06)",
      border: "1px solid rgba(34, 211, 238, 0.2)",
      borderRadius: 6,
    }}>
      {/* Scoped pulse animation */}
      <style>{`@keyframes stepPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

      {/* ---- Status line ---- */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 6, fontSize: 10,
      }}>
        {/* Pulsing dot */}
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22d3ee",
          boxShadow: "0 0 4px #22d3ee",
          animation: "stepPulse 1.2s ease-in-out infinite",
        }} />
        <span style={{ color: "#22d3ee", fontWeight: 700 }}>STEP</span>
        <span style={{ color: "var(--text-secondary)" }}>
          {noteKind.toUpperCase()} · {stepLabel} · Beat {beatLabel}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 9 }}>
          {notesPlaced} placed
        </span>
      </div>

      {/* ---- Step size presets ---- */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          fontSize: 9, color: "var(--text-muted)", marginBottom: 2,
        }}>
          Step Size <span style={{ opacity: 0.5 }}>(Shift+Up/Down)</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          {/* Halve step size button */}
          <button
            onClick={halveStepSize}
            disabled={stepSize <= 1 / 32}
            title="Halve step size (Shift+\u2193)"
            style={{
              fontSize: 11, padding: "2px 5px", borderRadius: 3,
              border: "none", cursor: stepSize <= 1 / 32 ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: "var(--bg-active)", color: "var(--text-muted)",
              opacity: stepSize <= 1 / 32 ? 0.3 : 1,
              fontWeight: 700, transition: "all 0.1s",
            }}
          >
            −
          </button>
          {STEP_PRESETS.map((p) => {
            const isActive = Math.abs(stepSize - p.value) < 0.0001;
            return (
              <button key={p.label} onClick={() => setStepSize(p.value)} style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: isActive ? "#22d3ee" : "var(--bg-active)",
                color: isActive ? "#000" : "var(--text-muted)",
                fontWeight: isActive ? 700 : 400,
                transition: "all 0.1s",
              }}>
                {p.label}
              </button>
            );
          })}
          {/* Double step size button */}
          <button
            onClick={doubleStepSize}
            disabled={stepSize >= 4}
            title="Double step size (Shift+\u2191)"
            style={{
              fontSize: 11, padding: "2px 5px", borderRadius: 3,
              border: "none", cursor: stepSize >= 4 ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: "var(--bg-active)", color: "var(--text-muted)",
              opacity: stepSize >= 4 ? 0.3 : 1,
              fontWeight: 700, transition: "all 0.1s",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* ---- Note kind selector ---- */}
      <div style={{ marginBottom: 6 }}>
        <div style={{
          fontSize: 9, color: "var(--text-muted)", marginBottom: 2,
        }}>
          Note Kind <span style={{ opacity: 0.5 }}>(Q/W/E/R)</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {(["tap", "drag", "flick", "hold"] as const).map((kind) => (
            <button key={kind} onClick={() => setNoteKind(kind)} style={{
              flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: noteKind === kind ? "#22d3ee" : "var(--bg-active)",
              color: noteKind === kind ? "#000" : "var(--text-muted)",
              fontWeight: noteKind === kind ? 700 : 400,
              textTransform: "capitalize",
              transition: "all 0.1s",
            }}>
              {kind}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Exit button ---- */}
      <button onClick={exitStepRecord} style={{
        width: "100%", fontSize: 9, padding: "3px 0", borderRadius: 3,
        border: "1px solid rgba(34, 211, 238, 0.2)",
        background: "transparent", color: "var(--text-muted)",
        cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.1s",
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(34, 211, 238, 0.1)";
          e.currentTarget.style.color = "#22d3ee";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        Exit Step Record (S / Esc)
      </button>
    </div>
  );
}

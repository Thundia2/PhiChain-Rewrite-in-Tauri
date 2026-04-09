// ============================================================
// LineMode — Note Generator Sub-tab
//
// Inline note pattern generator for batch-creating notes on
// the selected line. Supports linear, sine, zigzag, staircase,
// arc, random, and custom f(t) shapes. Extracted from
// LineMode.tsx for size management.
// ============================================================

import { useState, useMemo } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import { generateNotePattern, validateExpression } from "../../../utils/notePatternGenerator";
import type { NotePatternConfig, PatternShape } from "../../../types/notePattern";
import type { NoteKind } from "../../../types/chart";
import { NumericInput } from "../../common/FormFields";
import { SectionHeader } from "../shared/SectionHeader";
import { ContextBadge } from "../shared/ContextBadge";

// ---- Constants ----

const NOTE_GEN_SHAPES: { value: PatternShape; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "sine", label: "Sine" },
  { value: "cosine", label: "Cosine" },
  { value: "zigzag", label: "Zigzag" },
  { value: "staircase", label: "Staircase" },
  { value: "arc", label: "Arc" },
  { value: "random", label: "Random" },
  { value: "custom", label: "f(t)" },
];

const NOTE_GEN_KINDS: { value: NoteKind; label: string; color: string }[] = [
  { value: "tap", label: "Tap", color: "#48b5ff" },
  { value: "drag", label: "Drag", color: "#ffd24a" },
  { value: "flick", label: "Flick", color: "#ff4a6a" },
  { value: "hold", label: "Hold", color: "#4aff7a" },
];

// ---- Note Gen Tab ----

export function NoteGenTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const batchAddNotes = useChartStore((s) => s.batchAddNotes);

  const [config, setConfig] = useState<NotePatternConfig>({
    startBeat: 0, endBeat: 8, noteCount: 16,
    noteKind: "drag", above: true, shape: "linear",
    startX: -300, endX: 300, cycles: 2, amplitude: 300,
    stairWidth: 4, arcHeight: 200, speed: 1, fake: false, holdDuration: 1,
    expression: "300*sin(2*pi*t)",
  });

  const update = (changes: Partial<NotePatternConfig>) =>
    setConfig((prev) => ({ ...prev, ...changes }));

  const previewNotes = useMemo(() => generateNotePattern(config), [config]);

  const handleGenerate = () => {
    if (selectedLineIndex === null) return;
    const notes = generateNotePattern(config);
    batchAddNotes(selectedLineIndex, notes);
  };

  const showCycles = config.shape === "sine" || config.shape === "cosine" || config.shape === "zigzag";
  const showStairWidth = config.shape === "staircase";
  const showArcHeight = config.shape === "arc";
  const showExpression = config.shape === "custom";

  const expressionError = useMemo(
    () => showExpression && config.expression ? validateExpression(config.expression) : null,
    [showExpression, config.expression],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ContextBadge
        icon={<span style={{ fontSize: 12 }}>{"\u2B1A"}</span>}
        label="Note Pattern Generator"
        detail={`${previewNotes.length} notes`}
        variant="line"
      />

      {/* Shape selector */}
      <SectionHeader label="SHAPE" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "0 4px" }}>
        {NOTE_GEN_SHAPES.map((s) => (
          <button
            key={s.value}
            onClick={() => update({ shape: s.value })}
            style={{
              fontSize: 9, padding: "3px 7px", borderRadius: 4,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: config.shape === s.value ? "var(--accent-primary)" : "var(--bg-active)",
              color: config.shape === s.value ? "#fff" : "var(--text-muted)",
              fontWeight: config.shape === s.value ? 600 : 400,
              transition: "all 0.1s",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Timing */}
      <SectionHeader label="TIMING" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "0 4px" }}>
        <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
          Start Beat
          <NumericInput value={config.startBeat} onChange={(v) => update({ startBeat: v })} step={0.25} style={{ width: "100%" }} />
        </label>
        <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
          End Beat
          <NumericInput value={config.endBeat} onChange={(v) => update({ endBeat: v })} step={0.25} style={{ width: "100%" }} />
        </label>
        <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
          Count
          <NumericInput value={config.noteCount} onChange={(v) => update({ noteCount: Math.max(1, Math.round(v)) })} step={1} min={1} style={{ width: "100%" }} />
        </label>
      </div>

      {/* X Range */}
      <SectionHeader label="X RANGE" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "0 4px" }}>
        <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
          Start X
          <NumericInput value={config.startX} onChange={(v) => update({ startX: v })} step={10} style={{ width: "100%" }} />
        </label>
        <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
          End X
          <NumericInput value={config.endX} onChange={(v) => update({ endX: v })} step={10} style={{ width: "100%" }} />
        </label>
      </div>

      {/* Shape-specific params */}
      {showCycles && (
        <>
          <SectionHeader label="WAVE PARAMS" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "0 4px" }}>
            <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
              Cycles
              <NumericInput value={config.cycles ?? 2} onChange={(v) => update({ cycles: v })} step={0.5} min={0.5} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
              Amplitude
              <NumericInput value={config.amplitude ?? 300} onChange={(v) => update({ amplitude: v })} step={10} style={{ width: "100%" }} />
            </label>
          </div>
        </>
      )}
      {showStairWidth && (
        <div style={{ padding: "0 4px" }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
            Stair Width
            <NumericInput value={config.stairWidth ?? 4} onChange={(v) => update({ stairWidth: Math.max(1, Math.round(v)) })} step={1} min={1} style={{ width: "100%" }} />
          </label>
        </div>
      )}
      {showArcHeight && (
        <div style={{ padding: "0 4px" }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)" }}>
            Arc Height
            <NumericInput value={config.arcHeight ?? 200} onChange={(v) => update({ arcHeight: v })} step={10} style={{ width: "100%" }} />
          </label>
        </div>
      )}
      {showExpression && (
        <>
          <SectionHeader label="CUSTOM EXPRESSION" />
          <div style={{ padding: "0 4px" }}>
            <div style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 3 }}>
              X = f(t), where t goes from 0 to 1. Available: sin, cos, tan, abs, sqrt, pow, pi, e, min, max, floor, ceil, round
            </div>
            <input
              type="text"
              value={config.expression ?? ""}
              onChange={(e) => update({ expression: e.target.value })}
              placeholder="300*sin(2*pi*t)"
              spellCheck={false}
              style={{
                width: "100%", fontSize: 10, padding: "5px 8px", borderRadius: 4,
                border: `1px solid ${expressionError ? "#ff4a6a" : config.expression ? "#4ade80" : "var(--border-color)"}`,
                background: "var(--bg-tertiary)", color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none", transition: "border-color 0.15s",
              }}
            />
            {expressionError && (
              <div style={{ fontSize: 8, color: "#ff4a6a", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                {expressionError}
              </div>
            )}
            {!expressionError && config.expression && (
              <div style={{ fontSize: 8, color: "#4ade80", marginTop: 2 }}>
                Valid expression
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 4 }}>
              {[
                "300*sin(2*pi*t)",
                "675*(2*t-1)",
                "400*cos(4*pi*t)*t",
                "300*sin(pi*t)^2",
                "675*sin(t*pi)*(1-t)",
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => update({ expression: ex })}
                  style={{
                    fontSize: 7, padding: "1px 4px", borderRadius: 3,
                    border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                    background: config.expression === ex ? "rgba(108,138,255,0.15)" : "var(--bg-active)",
                    color: config.expression === ex ? "var(--accent-primary)" : "var(--text-muted)",
                    transition: "all 0.1s",
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Note kind */}
      <SectionHeader label="NOTE KIND" />
      <div style={{ display: "flex", gap: 2, padding: "0 4px" }}>
        {NOTE_GEN_KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => update({ noteKind: k.value })}
            style={{
              flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 4,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: config.noteKind === k.value ? k.color : "var(--bg-active)",
              color: config.noteKind === k.value ? "#000" : "var(--text-muted)",
              fontWeight: config.noteKind === k.value ? 700 : 400,
              transition: "all 0.1s",
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Above/Below */}
      <div style={{ display: "flex", gap: 4, padding: "0 4px" }}>
        <button
          onClick={() => update({ above: true })}
          style={{
            flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 4,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: config.above ? "#4ade80" : "var(--bg-active)",
            color: config.above ? "#000" : "var(--text-muted)",
            fontWeight: config.above ? 700 : 400,
          }}
        >
          Above
        </button>
        <button
          onClick={() => update({ above: false })}
          style={{
            flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 4,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: !config.above ? "#ef4444" : "var(--bg-active)",
            color: !config.above ? "#fff" : "var(--text-muted)",
            fontWeight: !config.above ? 700 : 400,
          }}
        >
          Below
        </button>
      </div>

      {/* Generate */}
      <div style={{ padding: "4px 4px 0" }}>
        <button
          onClick={handleGenerate}
          disabled={selectedLineIndex === null || previewNotes.length === 0}
          style={{
            width: "100%", padding: "8px 0", borderRadius: 6,
            border: "none", cursor: selectedLineIndex === null ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontSize: 11, fontWeight: 600,
            background: selectedLineIndex !== null ? "var(--accent-primary)" : "var(--bg-active)",
            color: selectedLineIndex !== null ? "#fff" : "var(--text-muted)",
            opacity: selectedLineIndex === null ? 0.5 : 1,
            transition: "all 0.15s",
          }}
        >
          Generate {previewNotes.length} notes
        </button>
      </div>
    </div>
  );
}

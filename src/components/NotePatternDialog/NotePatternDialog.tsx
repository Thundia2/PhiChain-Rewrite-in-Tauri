// ============================================================
// Note Pattern Dialog
//
// Modal dialog for generating note patterns with a preview.
// Alternative to the canvas-native pattern tool for users who
// prefer typing exact numbers.
// ============================================================

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Field, SelectField } from "../common/FormFields";
import { safeParseNumber } from "../common/FormFields";
import { generateNotePattern } from "../../utils/notePatternGenerator";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { NotePatternConfig, PatternShape } from "../../types/notePattern";
import type { NoteKind } from "../../types/chart";

const SHAPE_OPTIONS = [
  { value: "linear", label: "Linear" },
  { value: "sine", label: "Sine wave" },
  { value: "cosine", label: "Cosine wave" },
  { value: "zigzag", label: "Zigzag" },
  { value: "staircase", label: "Staircase" },
  { value: "arc", label: "Arc (bezier)" },
  { value: "random", label: "Random" },
];

const KIND_OPTIONS = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

function PatternPreview({ config }: { config: NotePatternConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewNotes = useMemo(() => generateNotePattern(config), [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const rootStyles = getComputedStyle(document.documentElement);
    const bgColor = rootStyles.getPropertyValue("--bg-primary").trim() || "#1a1b2e";
    const borderColor = rootStyles.getPropertyValue("--border-color").trim() || "#333";

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = borderColor;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    if (previewNotes.length === 0) return;

    const beatRange = (config.endBeat - config.startBeat) || 1;
    const NOTE_COLORS: Record<string, string> = {
      tap: "#35b5ff", drag: "#f0d040", flick: "#ff4060", hold: "#35b5ff",
    };
    ctx.fillStyle = NOTE_COLORS[config.noteKind] ?? "#35b5ff";

    for (const note of previewNotes) {
      const nx = ((note.x + 675) / 1350) * W;
      const beatFloat = note.beat[0] + note.beat[1] / note.beat[2];
      const ny = ((beatFloat - config.startBeat) / beatRange) * H;
      ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
    }
  }, [previewNotes, config]);

  return <canvas ref={canvasRef} width={280} height={140}
    style={{ width: "100%", height: 140, borderRadius: 8,
             border: "1px solid var(--border-color)" }} />;
}

export function NotePatternDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const batchAddNotes = useChartStore((s) => s.batchAddNotes);

  const [config, setConfig] = useState<NotePatternConfig>({
    startBeat: 0,
    endBeat: 8,
    noteCount: 16,
    noteKind: "drag",
    above: true,
    shape: "linear",
    startX: -300,
    endX: 300,
    cycles: 2,
    amplitude: 300,
    stairWidth: 4,
    arcHeight: 200,
    speed: 1,
    fake: false,
    holdDuration: 1,
  });

  const update = useCallback((changes: Partial<NotePatternConfig>) => {
    setConfig((prev) => ({ ...prev, ...changes }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (selectedLineIndex === null) return;
    const notes = generateNotePattern(config);
    batchAddNotes(selectedLineIndex, notes);
    onClose();
  }, [selectedLineIndex, config, batchAddNotes, onClose]);

  if (!open) return null;

  const showCycles = config.shape === "sine" || config.shape === "cosine" || config.shape === "zigzag";
  const showStairWidth = config.shape === "staircase";
  const showArcHeight = config.shape === "arc";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          borderRadius: 12, padding: 20, minWidth: 360, maxWidth: 440,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: "bold", color: "var(--text-primary)", marginBottom: 16 }}>
          Generate Note Pattern
        </div>

        {selectedLineIndex === null && (
          <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>
            Select a line first
          </div>
        )}

        {/* Timing */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <Field label="Start beat" value={config.startBeat} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ startBeat: n });
          }} step="0.25" />
          <Field label="End beat" value={config.endBeat} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ endBeat: n });
          }} step="0.25" />
          <Field label="Count" value={config.noteCount} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ noteCount: Math.max(1, Math.round(n)) });
          }} />
          <SelectField label="Type" value={config.noteKind} options={KIND_OPTIONS}
            onChange={(v) => update({ noteKind: v as NoteKind })} />
        </div>

        {/* Side */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", width: 40 }}>Side</span>
          <button onClick={() => update({ above: true })} style={{
            fontSize: 10, padding: "2px 10px", borderRadius: 3, border: "none",
            background: config.above ? "#22c55e30" : "var(--bg-active)",
            color: config.above ? "#4ade80" : "var(--text-muted)",
            cursor: "pointer", fontFamily: "inherit",
          }}>Above</button>
          <button onClick={() => update({ above: false })} style={{
            fontSize: 10, padding: "2px 10px", borderRadius: 3, border: "none",
            background: !config.above ? "#ef444430" : "var(--bg-active)",
            color: !config.above ? "#f87171" : "var(--text-muted)",
            cursor: "pointer", fontFamily: "inherit",
          }}>Below</button>
        </div>

        {/* Shape */}
        <SelectField label="Pattern" value={config.shape} options={SHAPE_OPTIONS}
          onChange={(v) => update({ shape: v as PatternShape })} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, marginBottom: 12 }}>
          <Field label="Start X" value={config.startX} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ startX: n });
          }} />
          <Field label="End X" value={config.endX} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ endX: n });
          }} />
          {showCycles && (
            <Field label="Cycles" value={config.cycles ?? 2} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ cycles: n });
            }} step="0.5" />
          )}
          {(config.shape === "sine" || config.shape === "cosine") && (
            <Field label="Amplitude" value={config.amplitude ?? 300} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ amplitude: n });
            }} />
          )}
          {showStairWidth && (
            <Field label="Step width" value={config.stairWidth ?? 4} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ stairWidth: Math.max(1, Math.round(n)) });
            }} />
          )}
          {showArcHeight && (
            <Field label="Arc height" value={config.arcHeight ?? 200} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ arcHeight: n });
            }} />
          )}
        </div>

        {/* Preview */}
        <PatternPreview config={config} />

        {/* Options */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <Field label="Speed" value={config.speed ?? 1} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ speed: n });
          }} step="0.1" />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)" }}>
            <input type="checkbox" checked={config.fake ?? false}
              onChange={(e) => update({ fake: e.target.checked })} />
            Fake notes
          </label>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border-color)",
            background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={handleGenerate} disabled={selectedLineIndex === null} style={{
            padding: "6px 16px", borderRadius: 6, border: "none",
            background: selectedLineIndex !== null ? "var(--accent-primary)" : "#444",
            color: "#fff", cursor: selectedLineIndex !== null ? "pointer" : "not-allowed",
            fontSize: 12, fontFamily: "inherit",
          }}>Generate</button>
        </div>
      </div>
    </div>
  );
}

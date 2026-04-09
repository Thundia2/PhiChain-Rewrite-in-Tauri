// ============================================================
// Spin Generator Dialog
//
// Takes rotation count + direction + starting angle and generates
// the correct rotation event, eliminating mental math.
// ============================================================

import { useState, useCallback } from "react";
import { Field, safeParseNumber } from "../common/FormFields";
import { EasingPicker } from "../common/EasingPicker";
import { generateSpinEvent } from "../../utils/spinGenerator";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { SpinConfig } from "../../utils/spinGenerator";
import type { EasingType } from "../../types/chart";

export function SpinGeneratorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const addEvent = useChartStore((s) => s.addEvent);

  const [config, setConfig] = useState<SpinConfig>({
    startBeat: 0,
    endBeat: 8,
    rotations: 2,
    clockwise: true,
    startAngle: 0,
    easing: "linear",
  });

  const endAngle = config.startAngle + config.rotations * 360 * (config.clockwise ? 1 : -1);

  const update = useCallback((changes: Partial<SpinConfig>) => {
    setConfig((prev) => ({ ...prev, ...changes }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (selectedLineIndex === null) return;
    const event = generateSpinEvent(config);
    addEvent(selectedLineIndex, event);
    onClose();
  }, [selectedLineIndex, config, addEvent, onClose]);

  if (!open) return null;

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
          borderRadius: 12, padding: 20, minWidth: 320,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: "bold", color: "var(--text-primary)", marginBottom: 16 }}>
          Generate Spin
        </div>

        {selectedLineIndex === null && (
          <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>
            Select a line first
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Start beat" value={config.startBeat} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ startBeat: n });
            }} step="0.25" />
            <Field label="End beat" value={config.endBeat} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ endBeat: n });
            }} step="0.25" />
          </div>

          <Field label="Rotations" value={config.rotations} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ rotations: Math.max(0, n) });
          }} step="0.5" />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 64, textAlign: "right" }}>Direction</span>
            <button onClick={() => update({ clockwise: true })} style={{
              fontSize: 10, padding: "2px 10px", borderRadius: 3, border: "none",
              background: config.clockwise ? "var(--accent-primary)" : "var(--bg-active)",
              color: config.clockwise ? "#fff" : "var(--text-muted)",
              cursor: "pointer", fontFamily: "inherit",
            }}>CW</button>
            <button onClick={() => update({ clockwise: false })} style={{
              fontSize: 10, padding: "2px 10px", borderRadius: 3, border: "none",
              background: !config.clockwise ? "var(--accent-primary)" : "var(--bg-active)",
              color: !config.clockwise ? "#fff" : "var(--text-muted)",
              cursor: "pointer", fontFamily: "inherit",
            }}>CCW</button>
          </div>

          <Field label="Start angle" value={config.startAngle} onChange={(v) => {
            const n = safeParseNumber(v); if (n !== null) update({ startAngle: n });
          }} step="1" />

          <Field label="End angle" value={Math.round(endAngle * 100) / 100} onChange={() => {}} disabled />

          <EasingPicker value={typeof config.easing === "string" ? config.easing : "linear"} onChange={(v) => update({ easing: v as EasingType })} />
        </div>

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

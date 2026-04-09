// ============================================================
// Shake Generator Dialog
//
// Generates oscillating moveX / moveY / rotation events for
// screen-shake effects. Follows the same dialog pattern as
// SpinGeneratorDialog. Includes waveform preview and presets.
//
// Recent change: Initial creation for Feature C (Shake Generator).
// ============================================================

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Field, safeParseNumber } from "../common/FormFields";
import { EasingPicker } from "../common/EasingPicker";
import {
  generateShakeEvents,
  shakeEventCount,
  generateShakePreviewData,
  DEFAULT_SHAKE_CONFIG,
  SHAKE_PRESETS,
} from "../../utils/shakeGenerator";
import type { ShakeConfig } from "../../utils/shakeGenerator";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { EasingType } from "../../types/chart";

export function ShakeGeneratorDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const activeLayer = useEditorStore((s) => s.eventEditorActiveLayer);
  const batchMultiLine = useChartStore((s) => s.batchMultiLineMutations);
  const batchAddToLayer = useChartStore((s) => s.batchAddEventsToLayer);
  const ensureEventLayers = useChartStore((s) => s.ensureEventLayers);

  const [config, setConfig] = useState<ShakeConfig>({ ...DEFAULT_SHAKE_CONFIG });

  // Target: -1 = flat events, 0-4 = event layer index
  // Defaults to the currently active layer in the event editor
  const [targetLayer, setTargetLayer] = useState<number>(
    activeLayer >= 0 ? activeLayer : 1,
  );

  const eventCount = useMemo(() => shakeEventCount(config), [config]);

  const update = useCallback((changes: Partial<ShakeConfig>) => {
    setConfig((prev) => ({ ...prev, ...changes }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (selectedLineIndex === null) return;

    const events = generateShakeEvents(config);
    if (events.length === 0) return;

    if (targetLayer < 0) {
      // Flat events — use batchMultiLineMutations with newEvents
      batchMultiLine([{
        lineIndex: selectedLineIndex,
        newEvents: events,
      }]);
    } else {
      // Layer events — ensure layers exist, then batch-add
      ensureEventLayers(selectedLineIndex);
      batchAddToLayer(selectedLineIndex, targetLayer, config.kind, events);
    }

    onClose();
  }, [
    selectedLineIndex, config, targetLayer,
    batchMultiLine, batchAddToLayer, ensureEventLayers, onClose,
  ]);

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
          borderRadius: 12, padding: 20, minWidth: 340, maxWidth: 420,
          maxHeight: "80vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          fontSize: 14, fontWeight: "bold",
          color: "var(--text-primary)", marginBottom: 12,
        }}>
          Generate Shake / Oscillation
        </div>

        {selectedLineIndex === null && (
          <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>
            Select a line first
          </div>
        )}

        {/* ---- Preset quick-buttons ---- */}
        <div style={{ marginBottom: 10 }}>
          <span style={{
            fontSize: 10, color: "var(--text-muted)",
            display: "block", marginBottom: 4,
          }}>Presets</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {SHAKE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => update({ ...preset.config })}
                title={preset.description}
                style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)", color: "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent-primary)";
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-primary)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.borderColor = "var(--border-color)";
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Property and Target Layer */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <span style={{
                fontSize: 10, color: "var(--text-muted)",
                display: "block", marginBottom: 2,
              }}>Property</span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["x", "y", "rotation"] as const).map((k) => (
                  <button key={k} onClick={() => update({ kind: k })} style={{
                    fontSize: 10, padding: "2px 10px", borderRadius: 3, border: "none",
                    background: config.kind === k ? "var(--accent-primary)" : "var(--bg-active)",
                    color: config.kind === k ? "#fff" : "var(--text-muted)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{k === "rotation" ? "ROT" : k.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={{
                fontSize: 10, color: "var(--text-muted)",
                display: "block", marginBottom: 2,
              }}>Target</span>
              <select
                value={targetLayer}
                onChange={(e) => setTargetLayer(parseInt(e.target.value))}
                style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 3,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)", color: "var(--text-primary)",
                  fontFamily: "inherit", width: "100%",
                }}
              >
                <option value={-1}>Flat events</option>
                {[0, 1, 2, 3, 4].map((i) => (
                  <option key={i} value={i}>Layer {i}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start beat + Duration */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Start beat" value={config.startBeat} onChange={(v) => {
              const n = safeParseNumber(v); if (n !== null) update({ startBeat: n });
            }} step="0.25" />
            <Field label="Duration (beats)" value={config.durationBeats} onChange={(v) => {
              const n = safeParseNumber(v);
              if (n !== null) update({ durationBeats: Math.max(0, n) });
            }} step="0.25" />
          </div>

          {/* Amplitude + Frequency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field
              label={`Amplitude (${config.kind === "rotation" ? "degrees" : "units"})`}
              value={config.amplitude}
              onChange={(v) => {
                const n = safeParseNumber(v);
                if (n !== null) update({ amplitude: Math.max(0, n) });
              }}
              step={config.kind === "rotation" ? "0.5" : "1"}
            />
            <Field label="Freq (per beat)" value={config.frequency} onChange={(v) => {
              const n = safeParseNumber(v);
              if (n !== null) update({ frequency: Math.max(0.5, Math.min(24, n)) });
            }} step="1" />
          </div>

          {/* Easing */}
          <div>
            <span style={{
              fontSize: 10, color: "var(--text-muted)",
              display: "block", marginBottom: 2,
            }}>Easing</span>
            <EasingPicker
              value={typeof config.easing === "string" ? config.easing : "linear"}
              onChange={(easing: string) => update({ easing: easing as EasingType })}
            />
          </div>

          {/* Decay */}
          <div>
            <span style={{
              fontSize: 10, color: "var(--text-muted)",
              display: "block", marginBottom: 2,
            }}>Decay</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["none", "linear", "exponential"] as const).map((d) => (
                <button key={d} onClick={() => update({ decay: d })} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "none",
                  background: config.decay === d ? "var(--accent-primary)" : "var(--bg-active)",
                  color: config.decay === d ? "#fff" : "var(--text-muted)",
                  cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                }}>{d}</button>
              ))}
            </div>
          </div>

          {/* Half-life (only for exponential) */}
          {config.decay === "exponential" && (
            <Field label="Half-life (beats)" value={config.decayHalfLife} onChange={(v) => {
              const n = safeParseNumber(v);
              if (n !== null) update({ decayHalfLife: Math.max(0.25, n) });
            }} step="0.5" />
          )}

          {/* ---- Waveform preview canvas ---- */}
          <ShakeWaveformPreview config={config} />

          {/* Preview info */}
          <div style={{
            fontSize: 10, color: "var(--text-muted)", padding: "4px 0",
            borderTop: "1px solid var(--border-color)", marginTop: 4,
          }}>
            Will generate <strong style={{ color: "var(--text-primary)" }}>{eventCount}</strong> events
            over {config.durationBeats} beats
            {targetLayer >= 0 ? ` on Layer ${targetLayer}` : " (flat)"}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={onClose} style={{
              fontSize: 11, padding: "4px 14px", borderRadius: 4,
              border: "1px solid var(--border-color)",
              background: "transparent", color: "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button
              onClick={handleGenerate}
              disabled={selectedLineIndex === null || eventCount === 0}
              style={{
                fontSize: 11, padding: "4px 14px", borderRadius: 4,
                border: "none",
                background: selectedLineIndex !== null && eventCount > 0
                  ? "var(--accent-primary)" : "var(--bg-active)",
                color: selectedLineIndex !== null && eventCount > 0
                  ? "#fff" : "var(--text-muted)",
                cursor: selectedLineIndex !== null && eventCount > 0
                  ? "pointer" : "not-allowed",
                fontFamily: "inherit", fontWeight: 600,
              }}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ShakeWaveformPreview — renders a mini oscilloscope of the
// shake waveform. Shows amplitude envelope and oscillation shape.
// ============================================================

function ShakeWaveformPreview({ config }: { config: ShakeConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const previewData = useMemo(
    () => generateShakePreviewData(config, 300),
    [config],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || previewData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear with dark background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    // Grid: center line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Determine Y scale from max amplitude in the data
    const maxVal = Math.max(
      ...previewData.map((p) => Math.abs(p.value)),
      0.001,
    );
    const yScale = (h / 2 - 4) / maxVal; // 4px padding

    // Draw amplitude envelope (faint fill)
    const tintColor = config.kind === "rotation"
      ? "rgba(251, 146, 60, 0.08)"   // Orange tint for rotation
      : "rgba(139, 92, 246, 0.08)";  // Purple tint for X/Y
    ctx.fillStyle = tintColor;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (const { t, value } of previewData) {
      ctx.lineTo(t * w, h / 2 - Math.abs(value) * yScale);
    }
    ctx.lineTo(w, h / 2);
    ctx.closePath();
    ctx.fill();

    // Mirror envelope below
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (const { t, value } of previewData) {
      ctx.lineTo(t * w, h / 2 + Math.abs(value) * yScale);
    }
    ctx.lineTo(w, h / 2);
    ctx.closePath();
    ctx.fill();

    // Draw waveform line
    ctx.strokeStyle = config.kind === "rotation"
      ? "#fb923c"    // Orange for rotation
      : "#8b5cf6";   // Purple for X/Y
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let first = true;
    for (const { t, value } of previewData) {
      const px = t * w;
      const py = h / 2 - value * yScale;
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`\u00B1${config.amplitude}${config.kind === "rotation" ? "\u00B0" : ""}`, 3, 10);
    ctx.textAlign = "right";
    ctx.fillText(`${config.durationBeats}b`, w - 3, h - 3);
  }, [previewData, config]);

  if (previewData.length === 0) return null;

  return (
    <div style={{ marginTop: 2 }}>
      <span style={{
        fontSize: 10, color: "var(--text-muted)",
        display: "block", marginBottom: 2,
      }}>Waveform Preview</span>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%", height: 60,
          borderRadius: 4,
          border: "1px solid var(--border-color)",
        }}
      />
    </div>
  );
}

// ============================================================
// Onset Calibration Dialog
//
// A wizard that shows 4 representative regions of the song
// (Dense, Medium, Sparse, Quiet) so the user can visually
// tune onset detection sensitivity before committing.
//
// Each region renders a canvas with the spectral flux envelope
// and onset markers. The shared sensitivity slider updates all
// 4 panels in real-time (<5ms via pickOnsetsFromFlux).
//
// Recent change: Created for onset calibration wizard feature.
// ============================================================

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAudioStore } from "../../stores/audioStore";
import { useToastStore } from "../../stores/toastStore";
import { audioEngine } from "../../audio/audioEngine";
import {
  getOrComputeFlux,
  pickOnsetsFromFlux,
  HOP_SIZE,
  type FluxCacheEntry,
} from "../../utils/onsetDetector";
import { analyzeRegions, type OnsetRegion, type RegionLabel } from "../../utils/onsetRegionAnalyzer";

// ============================================================
// Constants
// ============================================================

/** Colors for each region label */
const LABEL_COLORS: Record<RegionLabel, string> = {
  DENSE: "#ff6b35",
  MEDIUM: "#ffa832",
  SPARSE: "#ffd166",
  QUIET: "#8b8b8b",
};

/** Canvas dimensions (CSS pixels, scaled by DPR) */
const CANVAS_W = 290;
const CANVAS_H = 82;

// ============================================================
// Overlay + Dialog styling
// ============================================================

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  backdropFilter: "blur(6px)",
};

const DIALOG_STYLE: React.CSSProperties = {
  width: 660,
  maxWidth: "94vw",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 12px 48px rgba(0, 0, 0, 0.6)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

// ============================================================
// Main Component
// ============================================================

interface CalibrationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CalibrationDialog({ open, onClose }: CalibrationDialogProps) {
  // ---- Local state (draft sensitivity, not committed until Apply) ----
  const [sensitivity, setSensitivity] = useState(0.5);
  const [regions, setRegions] = useState<OnsetRegion[] | null>(null);
  const [fluxEntry, setFluxEntry] = useState<FluxCacheEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingRegion, setPlayingRegion] = useState<string | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Initialize on open ----
  useEffect(() => {
    if (!open) return;

    // Reset state on each open
    setSensitivity(useSettingsStore.getState().onsetSensitivity);
    setRegions(null);
    setFluxEntry(null);
    setPlayingRegion(null);
    setLoading(true);

    const url = audioEngine.getCurrentUrl();
    if (!url) {
      setLoading(false);
      return;
    }

    const duration = useAudioStore.getState().duration;

    getOrComputeFlux(url).then((entry) => {
      setFluxEntry(entry);
      const analyzed = analyzeRegions(entry.flux, entry.sampleRate, HOP_SIZE, duration);
      setRegions(analyzed);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => {
      // Stop any playing preview on close
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [open]);

  // ---- Keyboard: Escape=close, Enter=apply ----
  // Fixed: was missing dependency array, causing listener re-attachment every render
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && regions) handleApply();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, regions, handleApply]);

  // ---- Compute onset count for display ----
  const totalOnsets = React.useMemo(() => {
    if (!fluxEntry) return 0;
    return pickOnsetsFromFlux(fluxEntry, sensitivity).length;
  }, [fluxEntry, sensitivity]);

  // ---- Play a region preview ----
  const handlePlayRegion = useCallback((region: OnsetRegion) => {
    // Stop previous preview
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    audioEngine.seek(region.startTime);
    audioEngine.play();
    setPlayingRegion(region.label);

    // Auto-stop after region duration
    const durationMs = (region.endTime - region.startTime) * 1000;
    playTimerRef.current = setTimeout(() => {
      audioEngine.pause();
      setPlayingRegion(null);
      playTimerRef.current = null;
    }, durationMs);
  }, []);

  // ---- Apply calibrated sensitivity ----
  const handleApply = useCallback(() => {
    useSettingsStore.getState().updateSettings({ onsetSensitivity: sensitivity });
    useToastStore.getState().addToast({
      message: `Onset sensitivity set to ${Math.round(sensitivity * 100)}%`,
      type: "success",
    });
    // Stop any preview
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      audioEngine.pause();
    }
    onClose();
  }, [sensitivity, onClose]);

  if (!open) return null;

  return (
    <div
      style={OVERLAY_STYLE}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={DIALOG_STYLE} onClick={(e) => e.stopPropagation()}>
        {/* ---- Header ---- */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              letterSpacing: 0.5,
            }}>
              ONSET CALIBRATION
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {loading ? "Analyzing audio\u2026" : `${totalOnsets} onsets detected at ${Math.round(sensitivity * 100)}% sensitivity`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 18, lineHeight: 1,
              padding: "4px 8px", borderRadius: 4,
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* ---- Region grid ---- */}
        {loading ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 200, color: "var(--text-muted)", fontSize: 12,
          }}>
            {"Analyzing spectral flux\u2026"}
          </div>
        ) : regions && regions.length > 0 && fluxEntry ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}>
            {regions.map((region) => (
              <RegionPanel
                key={region.label}
                region={region}
                fluxEntry={fluxEntry}
                sensitivity={sensitivity}
                isPlaying={playingRegion === region.label}
                onPlay={() => handlePlayRegion(region)}
              />
            ))}
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 200, color: "var(--text-muted)", fontSize: 12,
          }}>
            No audio loaded
          </div>
        )}

        {/* ---- Sensitivity slider ---- */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 9, color: "#ffa832", fontWeight: 600, minWidth: 70,
            fontFamily: "monospace", textTransform: "uppercase",
          }}>
            Sensitivity
          </span>
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            style={{ flex: 1, height: 6, accentColor: "#ffa832" }}
          />
          <span style={{
            fontSize: 11, color: "#ffa832", fontWeight: 700, minWidth: 36,
            fontFamily: "monospace", textAlign: "right",
          }}>
            {Math.round(sensitivity * 100)}%
          </span>
        </div>

        {/* ---- Footer ---- */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px", borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-active)",
              color: "var(--text-muted)",
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!regions}
            style={{
              padding: "6px 20px", borderRadius: 6,
              border: "1px solid rgba(255, 168, 50, 0.4)",
              background: "rgba(255, 168, 50, 0.15)",
              color: "#ffa832",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              opacity: regions ? 1 : 0.4,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Region Panel — canvas-rendered waveform + onset markers
// ============================================================

interface RegionPanelProps {
  region: OnsetRegion;
  fluxEntry: FluxCacheEntry;
  sensitivity: number;
  isPlaying: boolean;
  onPlay: () => void;
}

function RegionPanel({ region, fluxEntry, sensitivity, isPlaying, onPlay }: RegionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // ---- Compute onsets in this region ----
  const regionOnsets = React.useMemo(() => {
    const allOnsets = pickOnsetsFromFlux(fluxEntry, sensitivity);
    return allOnsets.filter((m) => m.time >= region.startTime && m.time <= region.endTime);
  }, [fluxEntry, sensitivity, region.startTime, region.endTime]);

  // ---- Canvas rendering ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = "var(--bg-active)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // Fallback for CSS variable not working in canvas
      ctx.fillStyle = "#1a1f35";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const regionDuration = region.endTime - region.startTime;
      const frameCount = region.fluxEndIdx - region.fluxStartIdx;

      // ---- Layer 1: Flux envelope (faint amber bars) ----
      if (frameCount > 0) {
        // Find max flux in this region for normalization
        let maxFlux = 0;
        for (let i = region.fluxStartIdx; i < region.fluxEndIdx; i++) {
          if (fluxEntry.flux[i] > maxFlux) maxFlux = fluxEntry.flux[i];
        }

        if (maxFlux > 0) {
          const labelColor = LABEL_COLORS[region.label];
          for (let px = 0; px < CANVAS_W; px++) {
            // Map pixel X to flux frame index
            const t = px / CANVAS_W;
            const frameIdx = Math.floor(region.fluxStartIdx + t * frameCount);
            if (frameIdx >= region.fluxEndIdx) continue;

            const val = fluxEntry.flux[frameIdx] / maxFlux;
            const barH = val * (CANVAS_H - 8);

            ctx.fillStyle = labelColor;
            ctx.globalAlpha = 0.1 + val * 0.12;
            ctx.fillRect(px, CANVAS_H - barH, 1, barH);
          }
          ctx.globalAlpha = 1;
        }
      }

      // ---- Layer 2: Onset marker lines ----
      for (const marker of regionOnsets) {
        const x = ((marker.time - region.startTime) / regionDuration) * CANVAS_W;
        const alpha = 0.25 + marker.strength * 0.65;
        const h = 10 + marker.strength * (CANVAS_H - 18);

        ctx.strokeStyle = `rgba(255, 170, 50, ${alpha})`;
        ctx.lineWidth = Math.max(0.8, marker.strength * 2);
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_H - h);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();

        // Triangle for strong onsets
        if (marker.strength > 0.4) {
          ctx.fillStyle = `rgba(255, 170, 50, ${alpha * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(x - 2.5, CANVAS_H - h);
          ctx.lineTo(x, CANVAS_H - h - 4);
          ctx.lineTo(x + 2.5, CANVAS_H - h);
          ctx.fill();
        }
      }

      // ---- Playback indicator ----
      if (isPlaying) {
        const currentTime = useAudioStore.getState().currentTime;
        if (currentTime >= region.startTime && currentTime <= region.endTime) {
          const px = ((currentTime - region.startTime) / regionDuration) * CANVAS_W;
          ctx.strokeStyle = "#00e5ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, CANVAS_H);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Use RAF loop during playback for smooth playhead, otherwise draw once
    function loop() {
      draw();
      if (isPlaying) {
        animRef.current = requestAnimationFrame(loop);
      }
    }

    loop();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [fluxEntry, regionOnsets, region, isPlaying]);

  // ---- Time format helper ----
  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const labelColor = LABEL_COLORS[region.label];

  return (
    <div style={{
      position: "relative",
      background: "#12162a",
      border: `1px solid ${isPlaying ? "rgba(255, 170, 50, 0.4)" : "var(--border-color)"}`,
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: isPlaying ? "0 0 16px rgba(255, 170, 50, 0.15)" : "none",
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: CANVAS_W, height: CANVAS_H }}
      />

      {/* Overlay labels */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        padding: "5px 7px",
        pointerEvents: "none",
      }}>
        {/* Category badge */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: 1.2,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: labelColor,
          background: `${labelColor}18`,
          padding: "2px 6px",
          borderRadius: 3,
        }}>
          {region.label}
        </span>

        {/* Onset count */}
        <span style={{
          fontSize: 9, fontWeight: 600, color: "#ffa832",
          fontFamily: "monospace",
          background: "rgba(0, 0, 0, 0.5)",
          padding: "1px 5px",
          borderRadius: 3,
        }}>
          {regionOnsets.length}
        </span>
      </div>

      {/* Bottom bar: time range + play button */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "4px 7px",
        background: "rgba(0, 0, 0, 0.3)",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
      }}>
        <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
          {fmtTime(region.startTime)} {"\u2013"} {fmtTime(region.endTime)}
        </span>
        <button
          onClick={onPlay}
          style={{
            background: isPlaying ? "rgba(255, 170, 50, 0.2)" : "rgba(255, 255, 255, 0.06)",
            border: "none",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 9,
            color: isPlaying ? "#ffa832" : "var(--text-muted)",
            fontFamily: "inherit",
            fontWeight: isPlaying ? 700 : 400,
          }}
        >
          {isPlaying ? "\u25A0 Stop" : "\u25B6 Play"}
        </button>
      </div>
    </div>
  );
}

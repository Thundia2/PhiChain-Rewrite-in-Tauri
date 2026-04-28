// ============================================================
// Onset Calibration Dialog
//
// Modal wizard for tuning the ddc_onset peak-picker on 4
// representative windows of the loaded song (Dense, Medium,
// Sparse, Quiet). Each window renders a canvas with the CNN
// salience envelope + current pick markers; the four
// peak-picker sliders live below and update every panel in
// real-time (no Rust re-run — the raw salience is cached).
//
// Recent change: Created for Phase C of onset plan (2026-04-20).
// Replaces the deleted flux-based CalibrationDialog. Uses the
// ddc_onset CNN output via `getCachedOnsetResults()` instead of
// computing spectral flux on open; swaps the single sensitivity
// slider for the four Phase A fields (target density, abs floor,
// adaptive delta, min display strength) plus a density-preset
// chip row labelled with ddc_onset's DDR difficulty tiers.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAudioStore } from "../../stores/audioStore";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useToastStore } from "../../stores/toastStore";
import { audioEngine } from "../../audio/audioEngine";
import {
  peakPickT1,
  getCachedOnsetResults,
} from "../../hooks/useOnsetDetection";
import { analyzeRegions, type OnsetRegion, type RegionLabel } from "../../utils/onsetRegionAnalyzer";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../types/chart";
import { snapBeat } from "../../utils/beat";
import type { OnsetResult } from "../../utils/ipc";

// ── Design tokens ──────────────────────────────────────────────
// The dialog leans into the editor's existing "night sky + warm
// orange" palette with a slightly darker card background and a
// faint inner glow behind the 4 region panels. Typography uses
// JetBrains Mono (already in the codebase) for labels / data and
// inherits the system font for the preset chips so they read as
// tappable controls rather than monospace data.

const FRAME_RATE = 100; // Matches ONSET_PIPELINE_VERSION = 2 on the Rust side.

/** Per-label accent color. These aren't arbitrary — DENSE is the same hot
 *  orange used for strong onsets elsewhere; QUIET fades to neutral gray so
 *  it doesn't compete for attention. */
const LABEL_COLORS: Record<RegionLabel, string> = {
  DENSE: "#ff6b35",
  MEDIUM: "#ffa832",
  SPARSE: "#ffd166",
  QUIET: "#8b8b8b",
};

/** Canvas dimensions in CSS pixels (devicePixelRatio scaled at draw time). */
const CANVAS_W = 304;
const CANVAS_H = 92;

/** Density presets for the chip row. Numbers match the per-difficulty
 *  output density observed on `Sell a Friend.mp3` in the experiment — see
 *  `test/out_ddc/summary.json`. Labels mirror ddc_onset's DDR difficulty
 *  tiers for recognizability, even though we use density budget internally. */
const DENSITY_PRESETS: Array<{ label: string; density: number; tooltip: string }> = [
  { label: "Beginner", density: 1.6, tooltip: "Sparse — one marker every ~2 beats at 180 BPM" },
  { label: "Easy",     density: 2.6, tooltip: "Lightly dense — on-beat + selected half-beats" },
  { label: "Medium",   density: 3.3, tooltip: "~One marker per beat at 180 BPM" },
  { label: "Hard",     density: 4.5, tooltip: "Eighth-note-heavy" },
  { label: "Challenge", density: 5.7, tooltip: "Maximum density — dense 16th-note coverage" },
];

// ── Styles ────────────────────────────────────────────────────

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(5, 8, 20, 0.55)",
  backdropFilter: "blur(8px) saturate(1.1)",
  // Single orchestrated fade-in; no scattered micro-animations.
  animation: "onsetCalibFade 220ms cubic-bezier(0.2, 0.9, 0.3, 1) both",
};

const DIALOG_STYLE: React.CSSProperties = {
  width: 680,
  maxWidth: "94vw",
  maxHeight: "92vh",
  overflow: "auto",
  backgroundColor: "#0e1226",
  border: "1px solid rgba(255, 168, 50, 0.18)",
  borderRadius: 14,
  padding: "18px 22px 20px",
  boxShadow:
    "0 20px 60px rgba(0, 0, 0, 0.65), " +
    "inset 0 1px 0 rgba(255, 255, 255, 0.04), " +
    "0 0 140px -40px rgba(255, 168, 50, 0.28)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  // Slight scale-up pairs with the overlay fade for a coordinated entry.
  animation: "onsetCalibScale 240ms cubic-bezier(0.18, 0.9, 0.25, 1.05) both",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  position: "relative",
};

const MONO_FAMILY = "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";

const HEADER_TITLE_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#ffbf6b",
  fontFamily: MONO_FAMILY,
  letterSpacing: 2.4,
  textTransform: "uppercase",
};

const STAT_LABEL_STYLE: React.CSSProperties = {
  fontSize: 8,
  color: "rgba(255, 255, 255, 0.42)",
  fontFamily: MONO_FAMILY,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  marginBottom: 2,
};

const STAT_VALUE_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
  fontFamily: MONO_FAMILY,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

// ── Animation keyframes (injected once at mount) ────────────────

const KEYFRAMES = `
  @keyframes onsetCalibFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes onsetCalibScale {
    from { opacity: 0; transform: translateY(6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }
  @keyframes onsetCalibPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 168, 50, 0.22); }
    50%      { box-shadow: 0 0 0 6px rgba(255, 168, 50, 0); }
  }
`;

// ── Component ─────────────────────────────────────────────────

interface OnsetCalibrationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function OnsetCalibrationDialog({ open, onClose }: OnsetCalibrationDialogProps) {
  // Settings read directly from the store (live subscriptions so the
  // canvases re-render as the user drags sliders).
  const targetDensity = useSettingsStore((s) => s.onsetTargetDensity);
  const absFloor = useSettingsStore((s) => s.onsetAbsFloor);
  const adaptiveDelta = useSettingsStore((s) => s.onsetAdaptiveDelta);
  const minDisplayStrength = useSettingsStore((s) => s.onsetMinDisplayStrength);
  const snapToGrid = useSettingsStore((s) => s.onsetSnapToGrid);
  const chartOnsetTargetDensity = useChartStore((s) => s.chart.onset_target_density);
  const onsetEnabled = useSettingsStore((s) => s.onsetDetectionEnabled);
  const onsetAnalyzing = useEditorStore((s) => s.onsetAnalyzing);
  // Subscribing to onsetMarkers is our proxy for "raw cache was updated" —
  // whenever the hook's Effect B runs, markers change, and we re-read
  // getCachedOnsetResults() for a fresh snapshot.
  const markersEpoch = useEditorStore((s) => s.onsetMarkers);

  // Effective density matches the hook's resolution logic — per-chart wins.
  const effectiveDensity = chartOnsetTargetDensity ?? targetDensity;

  // Local region state, recomputed when the cache snapshot changes.
  const [regions, setRegions] = useState<OnsetRegion[] | null>(null);
  const [rawResults, setRawResults] = useState<readonly OnsetResult[] | null>(null);
  const [playingRegion, setPlayingRegion] = useState<RegionLabel | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Region (re)computation on open / cache update ──
  useEffect(() => {
    if (!open) return;
    const results = getCachedOnsetResults();
    setRawResults(results);
    if (results === null || results.length === 0) {
      setRegions(null);
      return;
    }
    setRegions(analyzeRegions(results, FRAME_RATE));
    // markersEpoch is intentionally in the dep list — it changes whenever
    // the underlying cache does, giving us a subscription without the
    // overhead of a separate Zustand store. See getCachedOnsetResults() docs.
  }, [open, markersEpoch]);

  // ── Keyboard shortcuts: Esc closes, Enter applies (same as old dialog) ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clean up any preview timer on unmount / close.
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
      audioEngine.pause();
    }
    setPlayingRegion(null);
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    useToastStore.getState().addToast({
      message: `Onset settings applied — target ${effectiveDensity.toFixed(1)}/sec`,
      type: "success",
    });
    handleClose();
  }, [effectiveDensity, handleClose]);

  // ── Preset chip click: write per-chart density if a chart is loaded,
  //     otherwise tweak the global setting. Matches the slider's write path
  //     in GlobalMode.tsx. ──
  const applyDensityPreset = useCallback((density: number) => {
    useChartStore.getState().setOnsetTargetDensity(density);
  }, []);

  // ── Play-region preview: seek + play + auto-stop after region length. ──
  const handlePlayRegion = useCallback((region: OnsetRegion) => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    if (playingRegion === region.label) {
      audioEngine.pause();
      setPlayingRegion(null);
      return;
    }
    audioEngine.seek(region.startTime);
    audioEngine.play();
    setPlayingRegion(region.label);
    const ms = (region.endTime - region.startTime) * 1000;
    playTimerRef.current = setTimeout(() => {
      audioEngine.pause();
      setPlayingRegion(null);
      playTimerRef.current = null;
    }, ms);
  }, [playingRegion]);

  // ── Total pick count across the whole song (for the header stat). ──
  const songTotalPicks = useMemo(() => {
    if (!rawResults) return 0;
    const cs = useChartStore.getState();
    const bl = new BpmList(cs.chart.bpm_list);
    // Mirror the hook's peak-picker config so the stat matches the editor.
    const snapFrameToCell = snapToGrid
      ? (frame: number) => {
          const tSec = frame / FRAME_RATE;
          const beat = bl.beatAtFloat(tSec - cs.chart.offset);
          const density = useEditorStore.getState().density;
          const snapped = beatToFloat(snapBeat(beat, density));
          return String(Math.round(snapped * 10000));
        }
      : undefined;
    const picks = peakPickT1(
      rawResults as OnsetResult[],
      absFloor,
      adaptiveDelta,
      effectiveDensity,
      (t) => bl.bpmAtTime(t),
      snapFrameToCell,
    );
    return minDisplayStrength > 0
      ? picks.filter((p) => p.probability >= minDisplayStrength).length
      : picks.length;
  }, [rawResults, absFloor, adaptiveDelta, effectiveDensity, minDisplayStrength, snapToGrid]);

  const duration = useAudioStore((s) => s.duration);

  if (!open) return null;

  return (
    <div
      style={OVERLAY_STYLE}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Injected keyframes for the entrance animation. Using a style tag
          rather than a CSS file keeps this dialog self-contained. */}
      <style>{KEYFRAMES}</style>
      <div style={DIALOG_STYLE} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Onset calibration">
        {/* Decorative inner glow — low-contrast warm radial behind the
            region grid. Kept at 3-5% alpha so it suggests depth without
            interfering with the panel borders. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: 14,
            background:
              "radial-gradient(80% 60% at 50% 30%, rgba(255, 168, 50, 0.06) 0%, transparent 70%)",
          }}
        />

        {/* ── Header strip: title, stats, close button ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={HEADER_TITLE_STYLE}>
              <span style={{ color: "#ffa832" }}>◢</span> Onset Calibration
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
              <div>
                <div style={STAT_LABEL_STYLE}>Markers</div>
                <div style={STAT_VALUE_STYLE}>
                  {onsetAnalyzing
                    ? "\u2026"
                    : regions === null
                    ? "\u2013"
                    : songTotalPicks.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={STAT_LABEL_STYLE}>Density</div>
                <div style={STAT_VALUE_STYLE}>
                  {effectiveDensity.toFixed(2)}
                  <span style={{ fontSize: 9, fontWeight: 400, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>/s</span>
                </div>
              </div>
              <div>
                <div style={STAT_LABEL_STYLE}>Duration</div>
                <div style={STAT_VALUE_STYLE}>
                  {duration > 0 ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, "0")}` : "\u2013"}
                </div>
              </div>
              <div>
                <div style={STAT_LABEL_STYLE}>Source</div>
                <div style={{ ...STAT_VALUE_STYLE, fontSize: 10, color: chartOnsetTargetDensity !== undefined ? "#ffa832" : "rgba(255,255,255,0.6)" }}>
                  {chartOnsetTargetDensity !== undefined ? "PER-CHART" : "GLOBAL"}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: 14,
              lineHeight: 1,
              padding: "4px 9px",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: MONO_FAMILY,
              transition: "color 120ms, border-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ffffff";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
            }}
          >✕</button>
        </div>

        {/* ── Density preset chip row ─────────────────────────────
             The main tuning action: click a preset to set density to a
             named difficulty tier. The active chip glows to confirm. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
          <span style={{ ...STAT_LABEL_STYLE, marginBottom: 0, minWidth: 46 }}>Preset</span>
          {DENSITY_PRESETS.map((preset) => {
            const active = Math.abs(effectiveDensity - preset.density) < 0.06;
            return (
              <button
                key={preset.label}
                onClick={() => applyDensityPreset(preset.density)}
                title={preset.tooltip}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 6,
                  border: `1px solid ${active ? "rgba(255, 168, 50, 0.5)" : "rgba(255, 255, 255, 0.06)"}`,
                  background: active ? "rgba(255, 168, 50, 0.14)" : "rgba(255, 255, 255, 0.03)",
                  color: active ? "#ffc678" : "rgba(255, 255, 255, 0.55)",
                  fontSize: 10,
                  fontFamily: "inherit",
                  fontWeight: active ? 700 : 500,
                  letterSpacing: 0.4,
                  cursor: "pointer",
                  transition: "background 140ms, color 140ms, border-color 140ms",
                  animation: active ? "onsetCalibPulse 1.8s ease-in-out infinite" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = "rgba(255, 255, 255, 0.85)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = "rgba(255, 255, 255, 0.55)";
                }}
              >
                <div>{preset.label}</div>
                <div style={{ fontFamily: MONO_FAMILY, fontSize: 8, opacity: 0.75, marginTop: 1 }}>
                  {preset.density.toFixed(1)}/s
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Target density slider (the fine-grained knob) ────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <span style={{ ...STAT_LABEL_STYLE, marginBottom: 0, minWidth: 46 }}>Density</span>
          <input
            type="range" min={0.5} max={8.0} step={0.1}
            value={effectiveDensity}
            onChange={(e) => useChartStore.getState().setOnsetTargetDensity(parseFloat(e.target.value))}
            style={{ flex: 1, height: 6, accentColor: "#ffa832" }}
            aria-label="Target onset density in onsets per second"
          />
          <span style={{ fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: 700, color: "#ffa832", minWidth: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {effectiveDensity.toFixed(1)} /s
          </span>
        </div>

        {/* ── Region grid (2x2) ──────────────────────────────────
             Renders 4 canvases showing CNN salience + pick markers for
             each representative region of the song. Selecting a region
             starts audition playback; the canvas overlays a cyan
             playhead during playback. */}
        <div style={{ position: "relative", minHeight: 196 }}>
          {!onsetEnabled ? (
            <EmptyState message="Onset detection is off" sub="Turn it on in the sidebar to analyze this song, then re-open Calibration." />
          ) : onsetAnalyzing || (rawResults === null) ? (
            <EmptyState
              message={onsetAnalyzing ? "Analyzing audio\u2026" : "No cached results"}
              sub={onsetAnalyzing ? "One-time ~2 s CNN pass over the song." : "Load a song with onset detection enabled first."}
              pulse={onsetAnalyzing}
            />
          ) : regions && regions.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {regions.map((region) => (
                <RegionPanel
                  key={region.label}
                  region={region}
                  rawResults={rawResults}
                  effectiveDensity={effectiveDensity}
                  absFloor={absFloor}
                  adaptiveDelta={adaptiveDelta}
                  minDisplayStrength={minDisplayStrength}
                  snapToGrid={snapToGrid}
                  isPlaying={playingRegion === region.label}
                  onPlay={() => handlePlayRegion(region)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="Song too short" sub="Calibration needs at least ~12 seconds of non-silent audio." />
          )}
        </div>

        {/* ── Advanced sliders (collapsible) ─────────────────── */}
        <AdvancedSliders
          absFloor={absFloor}
          adaptiveDelta={adaptiveDelta}
          minDisplayStrength={minDisplayStrength}
          snapToGrid={snapToGrid}
        />

        {/* ── Footer ─────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, position: "relative" }}>
          <span style={{ fontFamily: MONO_FAMILY, fontSize: 8, color: "rgba(255, 255, 255, 0.35)", letterSpacing: 1 }}>
            Esc close {"\u2022"} Enter apply
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClose}
              style={{
                padding: "7px 18px",
                borderRadius: 6,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "transparent",
                color: "rgba(255, 255, 255, 0.65)",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleApply}
              style={{
                padding: "7px 22px",
                borderRadius: 6,
                border: "1px solid rgba(255, 168, 50, 0.45)",
                background: "linear-gradient(180deg, rgba(255, 168, 50, 0.22), rgba(255, 168, 50, 0.12))",
                color: "#ffcd7a",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                letterSpacing: 0.3,
                boxShadow: "0 0 0 1px rgba(255, 168, 50, 0.08) inset, 0 6px 18px -6px rgba(255, 168, 50, 0.35)",
              }}
            >Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty-state helper ─────────────────────────────────────────

function EmptyState({ message, sub, pulse }: { message: string; sub: string; pulse?: boolean }) {
  return (
    <div
      style={{
        height: 196,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        color: "rgba(255, 255, 255, 0.55)",
        fontFamily: "inherit",
        border: "1px dashed rgba(255, 255, 255, 0.08)",
        borderRadius: 10,
        animation: pulse ? "onsetCalibPulse 1.6s ease-in-out infinite" : undefined,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600 }}>{message}</div>
      <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.35)", maxWidth: 360, textAlign: "center" }}>
        {sub}
      </div>
    </div>
  );
}

// ── Advanced sliders section (collapsible) ─────────────────────

function AdvancedSliders({
  absFloor,
  adaptiveDelta,
  minDisplayStrength,
  snapToGrid,
}: {
  absFloor: number;
  adaptiveDelta: number;
  minDisplayStrength: number;
  snapToGrid: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.45)",
          fontFamily: MONO_FAMILY,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms" }}>▸</span>
        Advanced
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AdvancedRow
            label="Min str"
            hint="Hide markers below this salience (visual only)."
            value={minDisplayStrength}
            min={0} max={1} step={0.01}
            onChange={(v) => useSettingsStore.getState().updateSettings({ onsetMinDisplayStrength: v })}
            format={(v) => v.toFixed(2)}
          />
          <AdvancedRow
            label="Abs floor"
            hint="Absolute threshold floor. A peak must clear both this AND rolling-median + delta."
            value={absFloor}
            min={0} max={1} step={0.01}
            onChange={(v) => useSettingsStore.getState().updateSettings({ onsetAbsFloor: v })}
            format={(v) => v.toFixed(2)}
          />
          <AdvancedRow
            label="Adapt Δ"
            hint="Added to the 1-sec rolling median to form the per-frame adaptive threshold."
            value={adaptiveDelta}
            min={0} max={0.2} step={0.005}
            onChange={(v) => useSettingsStore.getState().updateSettings({ onsetAdaptiveDelta: v })}
            format={(v) => v.toFixed(3)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 10, color: "rgba(255, 255, 255, 0.65)" }}>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => useSettingsStore.getState().updateSettings({ onsetSnapToGrid: e.target.checked })}
              style={{ accentColor: "#ffa832" }}
            />
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>
              Snap to beat grid
            </span>
            <span style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.35)" }}>
              (collapses pick candidates onto the current grid density)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function AdvancedRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }} title={hint}>
      <span style={{ ...STAT_LABEL_STYLE, marginBottom: 0, minWidth: 60 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 4, accentColor: "#ffa832" }}
      />
      <span style={{ fontFamily: MONO_FAMILY, fontSize: 10, color: "rgba(255, 255, 255, 0.7)", minWidth: 48, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {format(value)}
      </span>
    </div>
  );
}

// ── Region panel (canvas + overlays) ───────────────────────────

interface RegionPanelProps {
  region: OnsetRegion;
  rawResults: readonly OnsetResult[];
  effectiveDensity: number;
  absFloor: number;
  adaptiveDelta: number;
  minDisplayStrength: number;
  snapToGrid: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}

function RegionPanel({
  region,
  rawResults,
  effectiveDensity,
  absFloor,
  adaptiveDelta,
  minDisplayStrength,
  snapToGrid,
  isPlaying,
  onPlay,
}: RegionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Compute the picks inside THIS region's time range. We re-pick on every
  // slider change — the full-song picker is O(n) per run and a 6-second
  // window gives us ~600 frames so this is trivial (<1 ms per panel).
  const regionPicks = useMemo(() => {
    const cs = useChartStore.getState();
    const bl = new BpmList(cs.chart.bpm_list);
    const snapFrameToCell = snapToGrid
      ? (frame: number) => {
          const tSec = frame / FRAME_RATE;
          const beat = bl.beatAtFloat(tSec - cs.chart.offset);
          const density = useEditorStore.getState().density;
          const snapped = beatToFloat(snapBeat(beat, density));
          return String(Math.round(snapped * 10000));
        }
      : undefined;
    const allPicks = peakPickT1(
      rawResults as OnsetResult[],
      absFloor,
      adaptiveDelta,
      effectiveDensity,
      (t) => bl.bpmAtTime(t),
      snapFrameToCell,
    );
    const inRegion = allPicks.filter(
      (p) => p.time >= region.startTime && p.time < region.endTime,
    );
    return minDisplayStrength > 0
      ? inRegion.filter((p) => p.probability >= minDisplayStrength)
      : inRegion;
  }, [rawResults, region.startTime, region.endTime, effectiveDensity, absFloor, adaptiveDelta, minDisplayStrength, snapToGrid]);

  // Canvas rendering — runs on settings changes and during playback frames.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background (explicit hex so the canvas doesn't depend on CSS vars).
      ctx.fillStyle = "#0a0d1c";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const regionDuration = region.endTime - region.startTime;
      const frameCount = region.frameEndIdx - region.frameStartIdx;
      const labelColor = LABEL_COLORS[region.label];

      // ── Layer 1: CNN salience envelope (faint bars at each frame) ──
      // We draw every frame at its column, scaled to local max so the
      // visualization is useful even for low-probability regions.
      if (frameCount > 0) {
        let localMax = 0;
        for (let i = region.frameStartIdx; i < region.frameEndIdx; i++) {
          const p = rawResults[i]?.probability ?? 0;
          if (p > localMax) localMax = p;
        }
        if (localMax > 0) {
          for (let px = 0; px < CANVAS_W; px++) {
            const t = px / CANVAS_W;
            const frameIdx = Math.floor(region.frameStartIdx + t * frameCount);
            if (frameIdx >= region.frameEndIdx) continue;
            const val = (rawResults[frameIdx]?.probability ?? 0) / localMax;
            const barH = val * (CANVAS_H - 14);
            ctx.fillStyle = labelColor;
            ctx.globalAlpha = 0.08 + val * 0.22;
            ctx.fillRect(px, CANVAS_H - barH - 2, 1, barH);
          }
          ctx.globalAlpha = 1;
        }
      }

      // ── Layer 2: baseline line ──
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H - 1.5);
      ctx.lineTo(CANVAS_W, CANVAS_H - 1.5);
      ctx.stroke();

      // ── Layer 3: Onset pick markers (vertical ticks sized by strength) ──
      for (const pick of regionPicks) {
        const x = ((pick.time - region.startTime) / regionDuration) * CANVAS_W;
        const strength = pick.probability;
        const alpha = 0.30 + strength * 0.65;
        const h = 14 + strength * (CANVAS_H - 22);

        ctx.strokeStyle = `rgba(255, 175, 70, ${alpha})`;
        ctx.lineWidth = Math.max(0.9, strength * 2);
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_H - h);
        ctx.lineTo(x, CANVAS_H - 2);
        ctx.stroke();

        // Strong picks get a tiny cap triangle — mirrors the old dialog's
        // "bold onsets stand out" affordance.
        if (strength > 0.4) {
          ctx.fillStyle = `rgba(255, 180, 80, ${alpha * 0.8})`;
          ctx.beginPath();
          ctx.moveTo(x - 2.6, CANVAS_H - h);
          ctx.lineTo(x, CANVAS_H - h - 4.2);
          ctx.lineTo(x + 2.6, CANVAS_H - h);
          ctx.fill();
        }
      }

      // ── Layer 4: playback indicator (cyan line + glow) ──
      if (isPlaying) {
        const currentTime = useAudioStore.getState().currentTime;
        if (currentTime >= region.startTime && currentTime <= region.endTime) {
          const px = ((currentTime - region.startTime) / regionDuration) * CANVAS_W;
          const grad = ctx.createLinearGradient(px - 6, 0, px + 6, 0);
          grad.addColorStop(0.0, "rgba(0, 229, 255, 0)");
          grad.addColorStop(0.5, "rgba(0, 229, 255, 0.22)");
          grad.addColorStop(1.0, "rgba(0, 229, 255, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(px - 6, 0, 12, CANVAS_H);
          ctx.strokeStyle = "#7bf0ff";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, CANVAS_H);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

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
  }, [region, rawResults, regionPicks, isPlaying]);

  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const labelColor = LABEL_COLORS[region.label];
  const borderColor = isPlaying
    ? `${labelColor}70`
    : "rgba(255, 255, 255, 0.06)";

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(180deg, #0f1328 0%, #0a0d1c 100%)",
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: isPlaying ? `0 0 24px -6px ${labelColor}55` : "0 1px 0 rgba(255, 255, 255, 0.02) inset",
        transition: "border-color 180ms, box-shadow 180ms",
      }}
    >
      {/* Colored rim on the left — subtle identifier for the category */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: labelColor,
          opacity: 0.8,
        }}
      />
      <canvas ref={canvasRef} style={{ display: "block", width: CANVAS_W, height: CANVAS_H }} />

      {/* Overlay strip: label + pick count */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 8,
          right: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: MONO_FAMILY,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.8,
            color: labelColor,
            background: "rgba(10, 13, 28, 0.72)",
            padding: "2px 7px",
            borderRadius: 3,
          }}
        >
          {region.label}
        </span>
        <span
          style={{
            fontFamily: MONO_FAMILY,
            fontSize: 10,
            fontWeight: 700,
            color: "#ffc678",
            background: "rgba(10, 13, 28, 0.72)",
            padding: "1px 7px",
            borderRadius: 3,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {regionPicks.length}
          <span style={{ fontSize: 7, marginLeft: 2, color: "rgba(255, 198, 120, 0.6)" }}>onsets</span>
        </span>
      </div>

      {/* Footer: time range + play button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "3px 8px",
          background: "rgba(0, 0, 0, 0.4)",
          borderTop: "1px solid rgba(255, 255, 255, 0.04)",
        }}
      >
        <span
          style={{
            fontFamily: MONO_FAMILY,
            fontSize: 9,
            color: "rgba(255, 255, 255, 0.42)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmtTime(region.startTime)} – {fmtTime(region.endTime)}
        </span>
        <button
          onClick={onPlay}
          style={{
            background: isPlaying ? "rgba(255, 168, 50, 0.18)" : "rgba(255, 255, 255, 0.04)",
            border: "none",
            borderRadius: 4,
            padding: "2px 10px",
            cursor: "pointer",
            fontSize: 9,
            color: isPlaying ? "#ffc678" : "rgba(255, 255, 255, 0.55)",
            fontFamily: "inherit",
            fontWeight: isPlaying ? 700 : 500,
            letterSpacing: 0.4,
          }}
        >
          {isPlaying ? "◼ Stop" : "▶ Play"}
        </button>
      </div>
    </div>
  );
}

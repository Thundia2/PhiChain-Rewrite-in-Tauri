// ============================================================
// Transport Bar — Independent playback & time scrub control
//
// Sits between the canvas and keyframe bar. Contains:
//   - Play/Pause + Stop buttons
//   - Speed presets (0.25x, 0.5x, 0.75x, 1.0x)
//   - Metronome toggle
//   - Time display (formatted time + beat)
//   - Custom styled time scrub slider
//
// Extracted from KeyframeBar (transport) and UnifiedInspector
// (TimeScrub) into a single independent component.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { useChartStore } from "../../stores/chartStore";
import { audioEngine } from "../../audio/audioEngine";
import { BpmList } from "../../utils/bpmList";
import { Pill } from "../common/UIKit";

// ============================================================
// Constants
// ============================================================

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0];

// ============================================================
// Component
// ============================================================

export function TransportBar() {
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlayPause = useAudioStore((s) => s.togglePlayPause);
  const playbackRate = useAudioStore((s) => s.playbackRate);
  const setPlaybackRate = useAudioStore((s) => s.setPlaybackRate);
  const duration = useAudioStore((s) => s.duration);
  const loopEnabled = useAudioStore((s) => s.loopEnabled);
  const loopStartBeat = useAudioStore((s) => s.loopStartBeat);
  const loopEndBeat = useAudioStore((s) => s.loopEndBeat);

  const [metronome, setMetronome] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [displayBeat, setDisplayBeat] = useState(0);

  const stopPlayback = useCallback(() => audioEngine.stop(), []);

  // Smooth time/beat tracking via rAF
  useEffect(() => {
    let raf = 0;
    function tick() {
      const { currentTime } = useAudioStore.getState();
      const cs = useChartStore.getState();
      setDisplayTime(currentTime);
      try {
        const bpmList = new BpmList(cs.chart.bpm_list);
        setDisplayBeat(bpmList.beatAtFloat(currentTime - cs.chart.offset));
      } catch {
        setDisplayBeat(0);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useAudioStore.getState().seek(parseFloat(e.target.value));
  }, []);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const maxTime = Math.max(duration, 1);
  const progress = (displayTime / maxTime) * 100;

  return (
    <div
      style={{
        height: 36,
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "0 10px",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-color)",
        borderBottom: "1px solid var(--border-color)",
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      {/* ── Play / Pause / Stop ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button
          onClick={togglePlayPause}
          style={{
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            background: isPlaying ? "rgba(108, 138, 255, 0.12)" : "transparent",
            color: isPlaying ? "var(--accent-primary)" : "var(--text-primary)",
            transition: "all 0.15s",
          }}
          title="Play / Pause (Space)"
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        <button
          onClick={stopPlayback}
          style={{
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            background: "transparent",
            color: "var(--text-secondary, #888)",
            transition: "all 0.15s",
          }}
          title="Stop"
        >
          {"\u23F9"}
        </button>
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)", margin: "0 8px" }} />

      {/* ── Speed presets ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginRight: 2 }}>Speed</span>
        {SPEED_PRESETS.map((s) => (
          <Pill key={s} active={playbackRate === s} onClick={() => setPlaybackRate(s)}>
            {s}×
          </Pill>
        ))}
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)", margin: "0 8px" }} />

      {/* ── Metronome ── */}
      <button
        onClick={() => setMetronome(!metronome)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "inherit",
          background: metronome ? "rgba(108, 138, 255, 0.08)" : "transparent",
          color: metronome ? "var(--accent-primary)" : "var(--text-muted)",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12 }}>{"\u2669"}</span>
        <span>Metro</span>
      </button>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 16, background: "var(--border-color)", margin: "0 8px" }} />

      {/* ── Loop controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {/* Loop toggle */}
        <button
          onClick={() => useAudioStore.getState().toggleLoop()}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "3px 7px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 10, fontFamily: "inherit",
            background: loopEnabled ? "rgba(108, 138, 255, 0.08)" : "transparent",
            color: loopEnabled ? "var(--accent-primary)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
          title="Toggle loop (\\)"
        >
          <span style={{ fontSize: 12 }}>{"\u21BB"}</span>
          <span>Loop</span>
        </button>

        {/* Set loop start */}
        <button
          onClick={() => {
            const cs = useChartStore.getState();
            const bpmList = new BpmList(cs.chart.bpm_list);
            const beat = bpmList.beatAtFloat(useAudioStore.getState().currentTime - cs.chart.offset);
            useAudioStore.getState().setLoopStart(beat);
          }}
          style={{
            padding: "3px 6px", borderRadius: 4, border: "none", cursor: "pointer",
            fontSize: 9, fontFamily: "inherit",
            background: loopStartBeat !== null ? "rgba(108, 138, 255, 0.08)" : "transparent",
            color: loopStartBeat !== null ? "var(--accent-primary)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
          title={loopStartBeat !== null ? `Loop start: beat ${loopStartBeat.toFixed(2)} ([)` : "Set loop start ([)"}
        >
          [{loopStartBeat !== null ? ` ${loopStartBeat.toFixed(1)}` : ""}
        </button>

        {/* Set loop end */}
        <button
          onClick={() => {
            const cs = useChartStore.getState();
            const bpmList = new BpmList(cs.chart.bpm_list);
            const beat = bpmList.beatAtFloat(useAudioStore.getState().currentTime - cs.chart.offset);
            useAudioStore.getState().setLoopEnd(beat);
          }}
          style={{
            padding: "3px 6px", borderRadius: 4, border: "none", cursor: "pointer",
            fontSize: 9, fontFamily: "inherit",
            background: loopEndBeat !== null ? "rgba(108, 138, 255, 0.08)" : "transparent",
            color: loopEndBeat !== null ? "var(--accent-primary)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
          title={loopEndBeat !== null ? `Loop end: beat ${loopEndBeat.toFixed(2)} (])` : "Set loop end (])"}
        >
          {loopEndBeat !== null ? `${loopEndBeat.toFixed(1)} ` : ""}]
        </button>

        {/* Clear loop — only show when start or end is set */}
        {(loopStartBeat !== null || loopEndBeat !== null) && (
          <button
            onClick={() => useAudioStore.getState().clearLoop()}
            style={{
              padding: "3px 5px", borderRadius: 4, border: "none", cursor: "pointer",
              fontSize: 9, fontFamily: "inherit",
              background: "transparent", color: "var(--text-muted)",
              transition: "all 0.15s",
            }}
            title="Clear loop markers"
          >
            {"\u2715"}
          </button>
        )}

        {/* Loop range display when both bounds are set and loop is active */}
        {loopEnabled && loopStartBeat !== null && loopEndBeat !== null && (
          <span style={{ fontSize: 9, color: "var(--accent-primary)", marginLeft: 2, fontFamily: "var(--font-mono, monospace)" }}>
            {"\u27F2"} {loopStartBeat.toFixed(1)}{"\u2013"}{loopEndBeat.toFixed(1)}
          </span>
        )}
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Time display ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginRight: 10,
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
          {formatTime(displayTime)}
        </span>
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
          b{displayBeat.toFixed(2)}
        </span>
      </div>

      {/* ── Time scrub slider ── */}
      <div style={{ width: 260, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", flex: 1, height: 16, display: "flex", alignItems: "center" }}>
          {/* Track background */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 4,
              borderRadius: 2,
              background: "var(--bg-active)",
            }}
          />
          {/* Filled portion */}
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${progress}%`,
              height: 4,
              borderRadius: 2,
              background: "linear-gradient(90deg, var(--accent-primary), #8aa4ff)",
              transition: "width 0.05s linear",
            }}
          />
          {/* Thumb */}
          <div
            style={{
              position: "absolute",
              left: `${progress}%`,
              transform: "translateX(-50%)",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--accent-primary)",
              border: "2px solid var(--bg-secondary)",
              boxShadow: "0 0 6px rgba(108, 138, 255, 0.4)",
              transition: "left 0.05s linear",
              pointerEvents: "none",
            }}
          />
          {/* Invisible range input for interaction */}
          <input
            type="range"
            min={0}
            max={maxTime}
            step={0.01}
            value={displayTime}
            onChange={handleScrub}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              width: "100%",
              height: 16,
              opacity: 0,
              cursor: "pointer",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono, monospace)",
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {formatTime(maxTime)}
        </span>
      </div>
    </div>
  );
}

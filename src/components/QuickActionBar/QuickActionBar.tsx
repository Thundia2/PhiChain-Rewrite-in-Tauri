import { useAudioStore } from "../../stores/audioStore";
import { useChartStore } from "../../stores/chartStore";
import { beatToFloat } from "../../types/chart";
import { BpmList } from "../../utils/bpmList";
import { useMemo } from "react";
import { Tooltip } from "../common/Tooltip";

// ============================================================
// CONFIGURABLE: Available playback speed presets
// ============================================================
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0];

/** Default max time (seconds) when no audio is loaded */
const DEFAULT_MAX_TIME = 120;

export function QuickActionBar() {
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  const playbackRate = useAudioStore((s) => s.playbackRate);
  const metronomeEnabled = useAudioStore((s) => s.metronomeEnabled);
  const togglePlayPause = useAudioStore((s) => s.togglePlayPause);
  const stop = useAudioStore((s) => s.stop);
  const seek = useAudioStore((s) => s.seek);
  const setPlaybackRate = useAudioStore((s) => s.setPlaybackRate);
  const toggleMetronome = useAudioStore((s) => s.toggleMetronome);

  const bpmList = useChartStore((s) => s.chart.bpm_list);
  const lines = useChartStore((s) => s.chart.lines);

  // Compute the effective max time for the slider
  const maxTime = useMemo(() => {
    if (duration > 0) return duration;

    // Estimate from chart content: find the latest beat across all notes/events
    let maxBeat = 0;
    for (const line of lines) {
      for (const note of line.notes) {
        const b = beatToFloat(note.beat);
        if (note.hold_beat) maxBeat = Math.max(maxBeat, b + beatToFloat(note.hold_beat));
        else maxBeat = Math.max(maxBeat, b);
      }
      for (const ev of line.events) {
        maxBeat = Math.max(maxBeat, beatToFloat(ev.end_beat));
      }
    }

    if (maxBeat > 0) {
      const bl = new BpmList(bpmList);
      // Add some padding (4 beats)
      return bl.timeAt([Math.ceil(maxBeat) + 4, 0, 1]);
    }
    return DEFAULT_MAX_TIME;
  }, [duration, lines, bpmList]);

  const progressPercent = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${t.toFixed(2)}s`;
  };

  return (
    <div
      className="flex items-center h-8 px-3 gap-3 flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {/* ---- Transport Controls ---- */}
      <div className="flex items-center gap-1">
        <Tooltip content={isPlaying ? "Pause" : "Play"} shortcut="Space" position="bottom">
          <button
            className="w-7 h-6 flex items-center justify-center rounded text-xs hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-primary)" }}
            onClick={togglePlayPause}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        </Tooltip>
        <Tooltip content="Stop" position="bottom">
          <button
            className="w-7 h-6 flex items-center justify-center rounded text-xs hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-primary)" }}
            onClick={stop}
          >
            ⏹
          </button>
        </Tooltip>
      </div>

      {/* ---- Divider ---- */}
      <div className="w-px h-4" style={{ backgroundColor: "var(--border-color)" }} />

      {/* ---- Speed Control ---- */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Speed:</span>
        {SPEED_PRESETS.map((s) => (
          <button
            key={s}
            className="px-1.5 py-0.5 rounded text-xs transition-colors"
            style={{
              backgroundColor: playbackRate === s ? "var(--accent-primary)" : "transparent",
              color: playbackRate === s ? "white" : "var(--text-secondary)",
            }}
            onClick={() => setPlaybackRate(s)}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* ---- Divider ---- */}
      <div className="w-px h-4" style={{ backgroundColor: "var(--border-color)" }} />

      {/* ---- Metronome ---- */}
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={metronomeEnabled}
          onChange={toggleMetronome}
          className="w-3 h-3"
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Metronome</span>
      </label>

      {/* ---- Spacer pushes the rest to the right ---- */}
      <div className="flex-1" />

      {/* ---- Progress Slider ---- */}
      <div className="flex items-center gap-2 w-72">
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={Math.min(progressPercent, 100)}
          onChange={(e) => seek((Number(e.target.value) / 100) * maxTime)}
          className="flex-1 h-1 cursor-pointer"
          style={{ accentColor: "var(--accent-primary)" }}
        />
        <span
          className="text-xs font-mono w-12 text-right"
          style={{ color: "var(--text-secondary)" }}
        >
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
}

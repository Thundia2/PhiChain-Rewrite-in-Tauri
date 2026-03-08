import { useState } from "react";

// ============================================================
// CONFIGURABLE: Available playback speed presets
// ============================================================
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0];

/**
 * The quick action bar sits below the menu bar and contains:
 * - Play/Pause/Stop buttons (the old editor only had a space bar hotkey)
 * - Playback speed selector with presets
 * - Metronome toggle
 * - Progress slider and time/beat display
 * - Aspect ratio selector
 *
 * In later phases, these will be connected to the audio store
 * and editor store for real functionality.
 */
export function QuickActionBar() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [metronome, setMetronome] = useState(false);
  const [progress, setProgress] = useState(0);

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
        <button
          className="w-7 h-6 flex items-center justify-center rounded text-xs hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-primary)" }}
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          className="w-7 h-6 flex items-center justify-center rounded text-xs hover:bg-white/10 transition-colors"
          style={{ color: "var(--text-primary)" }}
          onClick={() => { setIsPlaying(false); setProgress(0); }}
          title="Stop"
        >
          ⏹
        </button>
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
              backgroundColor: speed === s ? "var(--accent-primary)" : "transparent",
              color: speed === s ? "white" : "var(--text-secondary)",
            }}
            onClick={() => setSpeed(s)}
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
          checked={metronome}
          onChange={(e) => setMetronome(e.target.checked)}
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
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="flex-1 h-1 cursor-pointer"
          style={{ accentColor: "var(--accent-primary)" }}
        />
        <span
          className="text-xs font-mono w-12 text-right"
          style={{ color: "var(--text-secondary)" }}
        >
          0.00s
        </span>
        <span
          className="text-xs font-mono w-12 text-right"
          style={{ color: "var(--text-secondary)" }}
        >
          0.00b
        </span>
      </div>
    </div>
  );
}

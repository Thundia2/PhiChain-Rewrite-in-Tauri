// ============================================================
// Go-to-Beat Dialog
//
// Quick-jump modal opened with Ctrl+J. Accepts either a beat
// number (e.g. "12", "4.75") or a time string ("1:30", "90")
// and seeks the playhead to that position.
//
// Shows a live preview of what exists at the target beat:
// how many lines are active and how many notes are nearby.
// ============================================================

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { audioEngine } from "../../audio/audioEngine";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../types/chart";
import type { Line } from "../../types/chart";

interface GoToBeatDialogProps {
  open: boolean;
  onClose: () => void;
}

// ---- Input parsing ----

interface ParsedInput {
  /** The resolved beat number (float) */
  beat: number;
  /** The resolved time in seconds (after chart offset) */
  time: number;
  /** Whether the input was parsed as a time string */
  isTime: boolean;
  /** Human-readable description of what was parsed */
  label: string;
}

/**
 * Parse user input into a beat and time position.
 *
 * Supported formats:
 *   "12"      -> beat 12
 *   "4.75"    -> beat 4.75 (= beat 4 and 3/4)
 *   "1:30"    -> 1 minute 30 seconds
 *   "90s"     -> 90 seconds
 *   "90"      -> beat 90 (numbers without ":" are beats by default)
 */
function parseInput(
  raw: string,
  bpmList: BpmList,
  offset: number,
): ParsedInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // MM:SS or M:SS format
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

    const totalSeconds = minutes * 60 + seconds;
    const chartTime = totalSeconds - offset;
    const beat = bpmList.beatAtFloat(Math.max(0, chartTime));
    return {
      beat,
      time: totalSeconds,
      isTime: true,
      label: `${Math.floor(minutes)}:${seconds.toFixed(1).padStart(4, "0")}`,
    };
  }

  // Seconds format: "90s" or "12.5s"
  if (trimmed.toLowerCase().endsWith("s")) {
    const numPart = trimmed.slice(0, -1).trim();
    const totalSeconds = parseFloat(numPart);
    if (isNaN(totalSeconds) || totalSeconds < 0) return null;

    const chartTime = totalSeconds - offset;
    const beat = bpmList.beatAtFloat(Math.max(0, chartTime));
    return {
      beat,
      time: totalSeconds,
      isTime: true,
      label: `${totalSeconds.toFixed(1)}s`,
    };
  }

  // Beat number (default)
  const beatVal = parseFloat(trimmed);
  if (isNaN(beatVal) || beatVal < 0) return null;

  const chartTime = bpmList.timeAtFloat(beatVal);
  const absoluteTime = chartTime + offset;
  return {
    beat: beatVal,
    time: absoluteTime,
    isTime: false,
    label: `Beat ${beatVal % 1 === 0 ? beatVal.toFixed(0) : beatVal.toFixed(2)}`,
  };
}

// ---- Preview computation ----

interface BeatPreview {
  /** Number of lines that have events spanning this beat */
  activeLines: number;
  /** Number of notes within +/- 0.5 beats of the target */
  nearbyNotes: number;
  /** BPM at this beat position */
  bpm: number;
}

/**
 * Compute a preview of what exists at a given beat position.
 * Counts active lines (those with events spanning the beat)
 * and notes within a half-beat window.
 */
function computePreview(
  beat: number,
  lines: Line[],
  bpmList: BpmList,
): BeatPreview {
  const WINDOW = 0.5; // beats
  let activeLines = 0;
  let nearbyNotes = 0;

  for (const line of lines) {
    // Check if any event on this line spans the target beat
    let lineActive = false;
    for (const evt of line.events) {
      const startF = beatToFloat(evt.start_beat);
      const endF = beatToFloat(evt.end_beat);
      if (startF <= beat && endF >= beat) {
        lineActive = true;
        break;
      }
    }
    if (lineActive) activeLines++;

    // Count notes within the window
    for (const note of line.notes) {
      const noteF = beatToFloat(note.beat);
      if (Math.abs(noteF - beat) <= WINDOW) {
        nearbyNotes++;
      }
    }
  }

  const bpm = bpmList.bpmAtTime(bpmList.timeAtFloat(beat));

  return { activeLines, nearbyNotes, bpm };
}

// ---- Styles ----

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: 120,
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  backdropFilter: "blur(4px)",
};

const DIALOG_STYLE: React.CSSProperties = {
  width: 340,
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  padding: 16,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
  border: "1px solid var(--border-color)",
  backgroundColor: "var(--bg-active)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "var(--text-muted)",
};

const PREVIEW_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "5px 0",
  fontSize: 12,
  color: "var(--text-secondary)",
};

const PREVIEW_VALUE_STYLE: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
  fontSize: 12,
  color: "var(--text-primary)",
};

// ---- Component ----

export function GoToBeatDialog({ open, onClose }: GoToBeatDialogProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chart = useChartStore((s) => s.chart);
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);

  // Build BpmList from chart data
  const bpmList = useMemo(
    () => new BpmList(chart.bpm_list),
    [chart.bpm_list],
  );

  // Current beat for display
  const currentBeat = useMemo(() => {
    const chartTime = currentTime - chart.offset;
    return bpmList.beatAtFloat(Math.max(0, chartTime));
  }, [currentTime, chart.offset, bpmList]);

  // Parse the current input
  const parsed = useMemo(
    () => parseInput(input, bpmList, chart.offset),
    [input, bpmList, chart.offset],
  );

  // Compute preview for the parsed position
  const preview = useMemo(() => {
    if (!parsed) return null;
    return computePreview(parsed.beat, chart.lines, bpmList);
  }, [parsed, chart.lines, bpmList]);

  // Auto-focus and reset on open
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput("");
      // Small delay to ensure the dialog is rendered before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Confirm: seek to the parsed position and close
  const handleConfirm = useCallback(() => {
    if (!parsed) return;

    // Clamp to valid range
    const seekTime = Math.max(0, duration > 0 ? Math.min(parsed.time, duration) : parsed.time);
    audioEngine.seek(seekTime);
    onClose();
  }, [parsed, duration, onClose]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleConfirm, onClose],
  );

  // Click overlay to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (seconds < 0) return "0:00.0";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  };

  const hasError = input.trim().length > 0 && !parsed;

  return (
    <div style={OVERLAY_STYLE} onClick={handleOverlayClick}>
      <div style={DIALOG_STYLE}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Go to Beat
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            Ctrl+J
          </span>
        </div>

        {/* Current position indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            padding: "6px 10px",
            borderRadius: 6,
            backgroundColor: "var(--bg-primary)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <span>Now:</span>
          <span style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace" }}>
            Beat {currentBeat.toFixed(2)}
          </span>
          <span style={{ color: "var(--text-muted)" }}>|</span>
          <span style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace" }}>
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Input field */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>
            Beat number, seconds (e.g. 90s), or time (MM:SS)
          </div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. 32, 1:15, 45s"
            style={{
              ...INPUT_STYLE,
              borderColor: hasError
                ? "var(--error)"
                : focused
                  ? "var(--accent-primary)"
                  : "var(--border-color)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {hasError && (
            <div style={{ fontSize: 10, color: "var(--error)", marginTop: 4 }}>
              Invalid input. Use a beat number, seconds (e.g. 90s), or MM:SS format.
            </div>
          )}
        </div>

        {/* Preview section */}
        {parsed && preview && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              backgroundColor: "var(--bg-primary)",
              marginBottom: 12,
              borderLeft: "2px solid var(--accent-primary)",
            }}
          >
            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Preview</div>

            {/* Target position */}
            <div style={PREVIEW_ROW_STYLE}>
              <span>Target</span>
              <span style={PREVIEW_VALUE_STYLE}>
                {parsed.isTime
                  ? `${parsed.label} (Beat ${parsed.beat.toFixed(2)})`
                  : `${parsed.label} (${formatTime(parsed.time)})`}
              </span>
            </div>

            {/* BPM at target */}
            <div style={PREVIEW_ROW_STYLE}>
              <span>BPM</span>
              <span style={PREVIEW_VALUE_STYLE}>{preview.bpm.toFixed(1)}</span>
            </div>

            {/* Active lines */}
            <div style={PREVIEW_ROW_STYLE}>
              <span>Active lines</span>
              <span style={PREVIEW_VALUE_STYLE}>{preview.activeLines}</span>
            </div>

            {/* Nearby notes */}
            <div style={PREVIEW_ROW_STYLE}>
              <span>Notes nearby</span>
              <span style={{
                ...PREVIEW_VALUE_STYLE,
                color: preview.nearbyNotes > 0 ? "var(--accent-primary)" : "var(--text-muted)",
              }}>
                {preview.nearbyNotes}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 12,
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-active)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-active)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!parsed}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 12,
              border: "1px solid var(--accent-primary)",
              backgroundColor: parsed ? "var(--accent-primary)" : "var(--bg-active)",
              color: parsed ? "#fff" : "var(--text-muted)",
              cursor: parsed ? "pointer" : "not-allowed",
              opacity: parsed ? 1 : 0.5,
              transition: "background-color 0.15s, opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              if (parsed) e.currentTarget.style.backgroundColor = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (parsed) e.currentTarget.style.backgroundColor = "var(--accent-primary)";
            }}
          >
            Go
          </button>
        </div>

        {/* Footer hint */}
        <div
          style={{
            marginTop: 10,
            fontSize: 10,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          Enter to confirm &middot; Escape to cancel
        </div>
      </div>
    </div>
  );
}

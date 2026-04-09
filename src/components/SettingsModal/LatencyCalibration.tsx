// ============================================================
// Latency Calibration — Phira-style falling note calibration
//
// Recent change: Fixed timing desync — clicks and note position
// now share a common cycleStartTime reference. Clicks fire at
// cycleStart + FALL_DURATION + N*LOOP_PERIOD (when the note
// crosses the judgment line). Note position is computed as
// elapsed time from cycleStart, so at offset=0 the visual and
// audio are perfectly aligned.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { ActionButton } from "../common/UIKit";

// ---- Calibration Configuration ----
const LATENCY_MIN_MS = -300;
const LATENCY_MAX_MS = 300;
const LATENCY_STEP_MS = 5;

// ---- Canvas / Visual Constants ----
const CANVAS_HEIGHT = 200;          // CSS pixels
const LINE_Y_OFFSET = 30;          // judgment line distance from bottom
const TOP_MARGIN = 20;             // note starting Y from top
const NOTE_COLOR = "#35b5ff";      // tap note color (matches GameRenderer)
const NOTE_WIDTH = 60;             // note visual width
const NOTE_HEIGHT = 8;             // note visual height
const NOTE_RADIUS = 3;             // rounded corners
const LINE_THICKNESS = 3;          // matches GameRenderer
const BG_COLOR = "#0c0c12";        // dark background

// ---- Timing Constants ----
const LOOP_PERIOD = 2.0;           // seconds per cycle
const FALL_DURATION = 1.0;         // note falls for 1s out of 2s loop
const FLASH_DURATION = 0.08;       // hit flash duration in seconds
const TAP_FADE_DURATION = 0.6;     // tap feedback fade time in seconds

// ---- Audio Constants ----
const CLICK_FREQ_HZ = 1000;        // Click pitch
const CLICK_DURATION_S = 0.03;     // Click length (30ms)
const CLICK_VOLUME = 0.7;          // Click volume (0-1)
const SCHEDULE_AHEAD = 4.0;        // schedule clicks up to 4s ahead

// ---- Tap feedback entry ----
interface TapFeedback {
  y: number;       // canvas Y-position where the note was
  time: number;    // performance.now() / 1000 when the tap happened
}

type CalibrationMode = "idle" | "calibrating";

// ---- Schedule a metronome click on an AudioContext ----
function scheduleClick(ctx: AudioContext, when: number) {
  const osc = ctx.createOscillator();
  osc.frequency.value = CLICK_FREQ_HZ;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(CLICK_VOLUME, when);
  gain.gain.linearRampToValueAtTime(0, when + CLICK_DURATION_S);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + CLICK_DURATION_S);
}

export function LatencyCalibration() {
  const audioLatencyMs = useSettingsStore((s) => s.audioLatencyMs);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [mode, setMode] = useState<CalibrationMode>("idle");

  // Refs for calibration state (not triggering re-renders)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextScheduleTimeRef = useRef(0);
  const cycleStartRef = useRef(0);       // AudioContext time when the note cycle begins
  const tapFeedbacksRef = useRef<TapFeedback[]>([]);
  const initialOffsetRef = useRef(0);
  // Read offset from store each frame without re-rendering
  const offsetMsRef = useRef(audioLatencyMs);

  // Keep offsetMsRef in sync with the store value
  useEffect(() => {
    offsetMsRef.current = audioLatencyMs;
  }, [audioLatencyMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Cleanup ----
  const cleanup = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    tapFeedbacksRef.current = [];
  }, []);

  // ---- Schedule a rolling batch of clicks ----
  const scheduleBatch = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;
    while (nextScheduleTimeRef.current < horizon) {
      scheduleClick(ctx, nextScheduleTimeRef.current);
      nextScheduleTimeRef.current += LOOP_PERIOD;
    }
  }, []);

  // ---- Canvas draw loop ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d");
    const audioCtx = audioCtxRef.current;
    if (!canvas || !ctx2d || !audioCtx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const lineY = h - LINE_Y_OFFSET;
    const travelDistance = lineY - TOP_MARGIN;

    ctx2d.save();
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear with dark background
    ctx2d.fillStyle = BG_COLOR;
    ctx2d.fillRect(0, 0, w, h);

    // 2. Draw judgment line (white, full width)
    ctx2d.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx2d.fillRect(0, lineY - LINE_THICKNESS / 2, w, LINE_THICKNESS);

    // 3. Compute note position relative to cycle start
    //    elapsed = time since cycle began
    //    offset shifts the note: positive offset → note arrives later (compensates for late audio)
    const elapsed = audioCtx.currentTime - cycleStartRef.current;
    const offsetSec = offsetMsRef.current / 1000;
    const t = ((elapsed - offsetSec) % LOOP_PERIOD + LOOP_PERIOD) % LOOP_PERIOD;

    // 4. Draw falling note (visible during first half of cycle)
    if (t < FALL_DURATION) {
      const progress = t / FALL_DURATION; // 0 at top, 1 at judgment line
      const noteY = TOP_MARGIN + progress * travelDistance;
      const noteX = w / 2;

      ctx2d.fillStyle = NOTE_COLOR;
      ctx2d.beginPath();
      ctx2d.roundRect(
        noteX - NOTE_WIDTH / 2,
        noteY - NOTE_HEIGHT / 2,
        NOTE_WIDTH,
        NOTE_HEIGHT,
        NOTE_RADIUS,
      );
      ctx2d.fill();
    }

    // 5. Hit flash — brief white glow when note crosses the line
    if (t >= FALL_DURATION && t < FALL_DURATION + FLASH_DURATION) {
      const flashProgress = (t - FALL_DURATION) / FLASH_DURATION;
      const flashAlpha = (1.0 - flashProgress) * 0.5;
      ctx2d.fillStyle = `rgba(53, 181, 255, ${flashAlpha})`;
      ctx2d.fillRect(0, lineY - 10, w, 20);
    }

    // 6. Draw tap feedback lines (fade out)
    const now = performance.now() / 1000;
    const feedbacks = tapFeedbacksRef.current;
    for (let i = feedbacks.length - 1; i >= 0; i--) {
      const fb = feedbacks[i];
      const age = now - fb.time;
      if (age > TAP_FADE_DURATION) {
        feedbacks.splice(i, 1);
        continue;
      }
      const alpha = 1.0 - age / TAP_FADE_DURATION;
      const dist = Math.abs(fb.y - lineY);

      // Color by accuracy: green = perfect, yellow = close, red = far
      let r: number, g: number, b: number;
      if (dist < 8) {
        r = 74; g = 255; b = 122;       // green
      } else if (dist < 25) {
        r = 255; g = 210; b = 74;       // yellow
      } else {
        r = 255; g = 74; b = 106;       // red
      }
      ctx2d.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx2d.fillRect(0, fb.y - 1, w, 2);
    }

    ctx2d.restore();

    // 7. Schedule more clicks if needed
    scheduleBatch();

    // 8. Continue loop
    rafRef.current = requestAnimationFrame(draw);
  }, [scheduleBatch]);

  // ---- Set up canvas dimensions ----
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
  }, []);

  // ---- Start Calibration ----
  const startCalibration = useCallback(() => {
    // Capture initial offset for cancel support
    initialOffsetRef.current = useSettingsStore.getState().audioLatencyMs;
    tapFeedbacksRef.current = [];

    setMode("calibrating");

    // Defer canvas setup + audio start to after the canvas element mounts
    requestAnimationFrame(() => {
      setupCanvas();

      // Create dedicated AudioContext
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      ctx.resume(); // ensure running after user gesture

      // The cycle starts 0.2s from now (small buffer for AudioContext warmup).
      // Clicks fire when the note hits the line: at cycleStart + FALL_DURATION + N*LOOP_PERIOD.
      // This ensures that at offset=0 the visual note crossing and the audio click are aligned.
      const cycleStart = ctx.currentTime + 0.2;
      cycleStartRef.current = cycleStart;
      nextScheduleTimeRef.current = cycleStart + FALL_DURATION;
      scheduleBatch();

      // Start render loop
      rafRef.current = requestAnimationFrame(draw);
    });
  }, [setupCanvas, scheduleBatch, draw]);

  // ---- Handle Tap (during calibration) ----
  const handleTap = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    const canvas = canvasRef.current;
    if (!audioCtx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const h = canvas.height / dpr;
    const lineY = h - LINE_Y_OFFSET;
    const travelDistance = lineY - TOP_MARGIN;

    // Compute where the note is right now (same formula as draw loop)
    const elapsed = audioCtx.currentTime - cycleStartRef.current;
    const offsetSec = offsetMsRef.current / 1000;
    const t = ((elapsed - offsetSec) % LOOP_PERIOD + LOOP_PERIOD) % LOOP_PERIOD;

    let noteY: number;
    if (t < FALL_DURATION) {
      const progress = t / FALL_DURATION;
      noteY = TOP_MARGIN + progress * travelDistance;
    } else {
      // Note already passed — show feedback at the judgment line
      noteY = lineY;
    }

    tapFeedbacksRef.current.push({
      y: noteY,
      time: performance.now() / 1000,
    });
  }, []);

  // ---- Stop Calibration (Done — keep offset) ----
  const stopCalibration = useCallback(() => {
    cleanup();
    setMode("idle");
  }, [cleanup]);

  // ---- Cancel Calibration (revert offset) ----
  const cancelCalibration = useCallback(() => {
    cleanup();
    updateSettings({ audioLatencyMs: initialOffsetRef.current });
    setMode("idle");
  }, [cleanup, updateSettings]);

  // ---- IDLE state ----
  if (mode === "idle") {
    return (
      <div>
        {/* Manual slider row */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid rgba(42, 42, 53, 0.55)",
          }}
        >
          <div className="flex items-center justify-between">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>Audio latency</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                Compensates for audio hardware delay
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <input
                type="range"
                min={LATENCY_MIN_MS}
                max={LATENCY_MAX_MS}
                step={LATENCY_STEP_MS}
                value={audioLatencyMs}
                onChange={(e) => updateSettings({ audioLatencyMs: parseInt(e.target.value) })}
                className="w-24"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <span
                style={{
                  fontSize: 11,
                  width: 48,
                  textAlign: "right",
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {audioLatencyMs} ms
              </span>
            </div>
          </div>
        </div>

        {/* Calibrate + Reset buttons */}
        <div style={{ padding: "10px 14px" }} className="flex items-center gap-2">
          <ActionButton variant="primary" onClick={startCalibration}>
            Calibrate
          </ActionButton>
          {audioLatencyMs !== 0 && (
            <ActionButton variant="default" onClick={() => updateSettings({ audioLatencyMs: 0 })}>
              Reset to 0
            </ActionButton>
          )}
        </div>
      </div>
    );
  }

  // ---- CALIBRATING state ----
  return (
    <div>
      {/* Canvas area */}
      <div ref={containerRef} style={{ lineHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: CANVAS_HEIGHT,
            cursor: "pointer",
            display: "block",
            borderRadius: "10px 10px 0 0",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            handleTap();
          }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              handleTap();
            }
          }}
          tabIndex={0}
        />
      </div>

      {/* Instruction text */}
      <div
        style={{
          padding: "8px 14px 4px",
          fontSize: 10,
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        Adjust until the note hits the line in sync with the sound. Tap to check timing.
      </div>

      {/* Live offset slider */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid rgba(42, 42, 53, 0.55)",
        }}
      >
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>Offset</div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <input
              type="range"
              min={LATENCY_MIN_MS}
              max={LATENCY_MAX_MS}
              step={LATENCY_STEP_MS}
              value={audioLatencyMs}
              onChange={(e) => updateSettings({ audioLatencyMs: parseInt(e.target.value) })}
              className="w-24"
              style={{ accentColor: "var(--accent-primary)" }}
            />
            <span
              style={{
                fontSize: 11,
                width: 48,
                textAlign: "right",
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {audioLatencyMs} ms
            </span>
          </div>
        </div>
      </div>

      {/* Done / Cancel buttons */}
      <div style={{ padding: "10px 14px" }} className="flex items-center gap-2">
        <ActionButton variant="primary" onClick={stopCalibration}>
          Done
        </ActionButton>
        <ActionButton variant="default" onClick={cancelCalibration}>
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

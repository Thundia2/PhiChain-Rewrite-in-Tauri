// ============================================================
// Preset Preview Animation
//
// A small canvas (80x60px) that animates a preset's effect.
// Shows a simplified line/dot moving through the preset's events
// over ~2 seconds. Auto-plays on hover or via a play button.
// Uses requestAnimationFrame for smooth animation.
// ============================================================

import { useRef, useEffect, useState, useCallback } from "react";
import type { EventPreset, EventTemplate } from "../../types/preset";
import type { LineEventKind, EasingType } from "../../types/chart";
import { beatToFloat } from "../../types/chart";

const CANVAS_W = 80;
const CANVAS_H = 60;
const ANIMATION_DURATION = 2000; // ms

// ============================================================
// Easing evaluation (simplified for preview purposes)
// ============================================================

function evaluateEasing(t: number, easing: EasingType): number {
  if (typeof easing !== "string") return t; // fallback to linear for custom types

  switch (easing) {
    case "linear": return t;
    case "ease_in_quad": return t * t;
    case "ease_out_quad": return t * (2 - t);
    case "ease_in_out_quad": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "ease_in_cubic": return t * t * t;
    case "ease_out_cubic": { const u = t - 1; return u * u * u + 1; }
    case "ease_in_out_cubic": return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    case "ease_in_sine": return 1 - Math.cos((t * Math.PI) / 2);
    case "ease_out_sine": return Math.sin((t * Math.PI) / 2);
    case "ease_in_out_sine": return -(Math.cos(Math.PI * t) - 1) / 2;
    case "ease_in_expo": return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
    case "ease_out_expo": return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "ease_in_out_expo":
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case "ease_out_bounce": {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
      if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
      { const u = t - 2.625 / 2.75; return 7.5625 * u * u + 0.984375; }
    }
    case "ease_in_bounce": return 1 - evaluateEasing(1 - t, "ease_out_bounce");
    case "ease_in_out_bounce":
      return t < 0.5
        ? (1 - evaluateEasing(1 - 2 * t, "ease_out_bounce")) / 2
        : (1 + evaluateEasing(2 * t - 1, "ease_out_bounce")) / 2;
    case "ease_in_back": { const s = 1.70158; return t * t * ((s + 1) * t - s); }
    case "ease_out_back": { const s = 1.70158; const u = t - 1; return u * u * ((s + 1) * u + s) + 1; }
    case "ease_in_out_back": {
      const s = 1.70158 * 1.525;
      if (t < 0.5) return (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2;
      return (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
    }
    case "ease_in_elastic": {
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
    }
    case "ease_out_elastic": {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    }
    case "ease_in_out_elastic": {
      if (t === 0 || t === 1) return t;
      const c = (2 * Math.PI) / 4.5;
      return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c)) / 2 + 1;
    }
    default: return t;
  }
}

// ============================================================
// Evaluate templates at a given normalized time (0-1)
// ============================================================

interface ChannelValue {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  speed: number;
}

function evaluatePresetAtTime(
  templates: EventTemplate[],
  totalBeats: number,
  normalizedTime: number,
): ChannelValue {
  const currentBeat = normalizedTime * totalBeats;

  const result: ChannelValue = { x: 0, y: 0, rotation: 0, opacity: 255, speed: 1 };

  for (const tmpl of templates) {
    const start = beatToFloat(tmpl.startBeatOffset);
    const end = beatToFloat(tmpl.endBeatOffset);
    const startVal = tmpl.startValue === "$CURRENT" ? result[tmpl.kind] : tmpl.startValue;
    const endVal = tmpl.endValue === "$CURRENT" ? result[tmpl.kind] : tmpl.endValue;

    if (currentBeat < start) continue;
    if (currentBeat >= end) {
      result[tmpl.kind] = endVal;
      continue;
    }

    const progress = (currentBeat - start) / Math.max(0.001, end - start);
    const easedProgress = evaluateEasing(Math.max(0, Math.min(1, progress)), tmpl.easing);
    result[tmpl.kind] = startVal + (endVal - startVal) * easedProgress;
  }

  return result;
}

function getTotalBeats(templates: EventTemplate[]): number {
  let maxBeat = 0;
  for (const tmpl of templates) {
    maxBeat = Math.max(maxBeat, beatToFloat(tmpl.endBeatOffset));
  }
  return Math.max(1, maxBeat);
}

// ============================================================
// Channel color mapping for drawing
// ============================================================

const CHANNEL_COLORS: Record<LineEventKind, string> = {
  x: "#4fc3f7",
  y: "#81c784",
  rotation: "#ffb74d",
  opacity: "#ce93d8",
  speed: "#ef5350",
};

// ============================================================
// Component
// ============================================================

export function PresetPreviewAnimation({
  preset,
  size = { width: CANVAS_W, height: CANVAS_H },
  autoPlayOnHover = true,
}: {
  preset: EventPreset;
  size?: { width: number; height: number };
  autoPlayOnHover?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const totalBeats = getTotalBeats(preset.template);

  const draw = useCallback(
    (normalizedTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx.strokeStyle = "#2a2a4a";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Evaluate current state
      const state = evaluatePresetAtTime(preset.template, totalBeats, normalizedTime);

      // Draw trail (last 20% of animation path)
      const trailSteps = 15;
      const trailRange = 0.15;
      for (let i = 0; i < trailSteps; i++) {
        const t = Math.max(0, normalizedTime - trailRange * (1 - i / trailSteps));
        const s = evaluatePresetAtTime(preset.template, totalBeats, t);
        const alpha = (i / trailSteps) * 0.3;

        // Normalize position values to canvas space
        const px = w / 2 + (s.x / 675) * (w / 2) * 0.8;
        const py = h / 2 - (s.y / 450) * (h / 2) * 0.8;

        ctx.fillStyle = `rgba(100, 200, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw the line representation
      const cx = w / 2 + (state.x / 675) * (w / 2) * 0.8;
      const cy = h / 2 - (state.y / 450) * (h / 2) * 0.8;
      const lineLen = 20;
      const rad = (state.rotation * Math.PI) / 180;
      const opacityNorm = state.opacity / 255;

      // Line segment
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacityNorm})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-lineLen / 2, 0);
      ctx.lineTo(lineLen / 2, 0);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = `rgba(100, 200, 255, ${opacityNorm})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw progress bar at bottom
      ctx.fillStyle = "#2a2a4a";
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillStyle = "#4fc3f7";
      ctx.fillRect(0, h - 3, w * normalizedTime, 3);

      // Channel indicators at top-left
      const activeChannels = [...new Set(preset.template.map((t) => t.kind))];
      activeChannels.forEach((ch, i) => {
        ctx.fillStyle = CHANNEL_COLORS[ch];
        ctx.fillRect(2 + i * 6, 2, 4, 4);
      });
    },
    [preset, totalBeats],
  );

  const animate = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const normalizedTime = (elapsed % ANIMATION_DURATION) / ANIMATION_DURATION;

      draw(normalizedTime);
      animFrameRef.current = requestAnimationFrame(animate);
    },
    [draw],
  );

  const startAnimation = useCallback(() => {
    startTimeRef.current = 0;
    setIsPlaying(true);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setIsPlaying(false);
    // Draw static preview at t=0
    draw(0);
  }, [draw]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Draw initial static frame
  useEffect(() => {
    draw(0);
  }, [draw]);

  return (
    <div
      className="relative inline-block"
      style={{ width: size.width, height: size.height }}
      onMouseEnter={autoPlayOnHover ? startAnimation : undefined}
      onMouseLeave={autoPlayOnHover ? stopAnimation : undefined}
    >
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="rounded"
        style={{ display: "block", width: size.width, height: size.height }}
      />
      {!autoPlayOnHover && !isPlaying && (
        <button
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={startAnimation}
        >
          <span style={{ color: "white", fontSize: "16px" }}>&#9654;</span>
        </button>
      )}
    </div>
  );
}

// ============================================================
// Built-in Event Presets
// ============================================================

import type { EventPreset } from "../types/preset";

export const BUILTIN_PRESETS: EventPreset[] = [
  // ---- Movement ----
  {
    id: "slide-in-left",
    name: "Slide in from left",
    category: "movement",
    description: "X: -675 \u2192 0, ease_out_quad, 4 beats",
    channels: ["x"],
    defaultDuration: 4,
    template: [{
      kind: "x", beatOffset: 0, endBeatOffset: 4,
      value: { transition: { start: "$LEFT", end: "$CENTER", easing: "ease_out_quad" } },
    }],
  },
  {
    id: "slide-in-right",
    name: "Slide in from right",
    category: "movement",
    description: "X: +675 \u2192 0, ease_out_quad, 4 beats",
    channels: ["x"],
    defaultDuration: 4,
    template: [{
      kind: "x", beatOffset: 0, endBeatOffset: 4,
      value: { transition: { start: "$RIGHT", end: "$CENTER", easing: "ease_out_quad" } },
    }],
  },
  {
    id: "slide-in-bottom",
    name: "Slide in from bottom",
    category: "movement",
    description: "Y: -450 \u2192 0, ease_out_sine, 4 beats",
    channels: ["y"],
    defaultDuration: 4,
    template: [{
      kind: "y", beatOffset: 0, endBeatOffset: 4,
      value: { transition: { start: "$BOTTOM", end: "$CENTER", easing: "ease_out_sine" } },
    }],
  },
  {
    id: "bounce-y",
    name: "Bounce Y",
    category: "movement",
    description: "Y: current \u2192 +200 \u2192 current, ease_out_bounce",
    channels: ["y"],
    defaultDuration: 4,
    template: [
      { kind: "y", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: "$CURRENT", end: 200, easing: "ease_out_quad" } } },
      { kind: "y", beatOffset: 2, endBeatOffset: 4,
        value: { transition: { start: 200, end: "$CURRENT", easing: "ease_out_bounce" } } },
    ],
  },
  {
    id: "offscreen-fling",
    name: "Off-screen fling + return",
    category: "movement",
    description: "Y flings to 710, teleports to -1910, eases back",
    channels: ["y"],
    defaultDuration: 6,
    template: [
      { kind: "y", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: "$CURRENT", end: 710, easing: "ease_in_quad" } } },
      { kind: "y", beatOffset: 3, endBeatOffset: 6,
        value: { transition: { start: -1910, end: "$CURRENT", easing: "ease_out_quad" } } },
    ],
  },

  // ---- Visibility ----
  {
    id: "fade-in",
    name: "Fade in",
    category: "visibility",
    description: "Opacity: 0 \u2192 255, 2 beats",
    channels: ["opacity"],
    defaultDuration: 2,
    template: [{
      kind: "opacity", beatOffset: 0, endBeatOffset: 2,
      value: { transition: { start: "$ZERO", end: "$FULL_OPACITY", easing: "linear" } },
    }],
  },
  {
    id: "fade-out",
    name: "Fade out",
    category: "visibility",
    description: "Opacity: 255 \u2192 0, 2 beats",
    channels: ["opacity"],
    defaultDuration: 2,
    template: [{
      kind: "opacity", beatOffset: 0, endBeatOffset: 2,
      value: { transition: { start: "$FULL_OPACITY", end: "$ZERO", easing: "linear" } },
    }],
  },
  {
    id: "strobe-flash",
    name: "Strobe flash",
    category: "visibility",
    description: "Opacity: rapid 255/0 flash, 2 beats",
    channels: ["opacity"],
    defaultDuration: 2,
    template: [
      { kind: "opacity", beatOffset: 0, endBeatOffset: 0.5,
        value: { transition: { start: 255, end: 0, easing: "linear" } } },
      { kind: "opacity", beatOffset: 0.5, endBeatOffset: 1.0,
        value: { transition: { start: 0, end: 255, easing: "linear" } } },
      { kind: "opacity", beatOffset: 1.0, endBeatOffset: 1.5,
        value: { transition: { start: 255, end: 0, easing: "linear" } } },
      { kind: "opacity", beatOffset: 1.5, endBeatOffset: 2.0,
        value: { transition: { start: 0, end: 255, easing: "linear" } } },
    ],
  },

  // ---- Rotation ----
  {
    id: "gentle-sway",
    name: "Gentle sway",
    category: "rotation",
    description: "R: 0 \u2192 5 \u2192 -5 \u2192 0, sine, 8 beats",
    channels: ["rotation"],
    defaultDuration: 8,
    template: [
      { kind: "rotation", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: 0, end: 5, easing: "ease_in_out_sine" } } },
      { kind: "rotation", beatOffset: 2, endBeatOffset: 4,
        value: { transition: { start: 5, end: -5, easing: "ease_in_out_sine" } } },
      { kind: "rotation", beatOffset: 4, endBeatOffset: 6,
        value: { transition: { start: -5, end: 5, easing: "ease_in_out_sine" } } },
      { kind: "rotation", beatOffset: 6, endBeatOffset: 8,
        value: { transition: { start: 5, end: 0, easing: "ease_in_out_sine" } } },
    ],
  },
  {
    id: "spin-360",
    name: "Full spin (360\u00B0)",
    category: "rotation",
    description: "R: 0 \u2192 360, ease_in_out_cubic, 4 beats",
    channels: ["rotation"],
    defaultDuration: 4,
    template: [{
      kind: "rotation", beatOffset: 0, endBeatOffset: 4,
      value: { transition: { start: "$CURRENT", end: 360, easing: "ease_in_out_cubic" } },
    }],
  },

  // ---- Speed ----
  {
    id: "speed-freeze",
    name: "Speed freeze (dramatic)",
    category: "speed",
    description: "Speed: current \u2192 0, 2 beats",
    channels: ["speed"],
    defaultDuration: 2,
    template: [{
      kind: "speed", beatOffset: 0, endBeatOffset: 2,
      value: { transition: { start: "$CURRENT", end: 0, easing: "ease_in_quad" } },
    }],
  },
  {
    id: "speed-burst",
    name: "Speed burst",
    category: "speed",
    description: "Speed: 1 \u2192 4 \u2192 1, dramatic acceleration",
    channels: ["speed"],
    defaultDuration: 4,
    template: [
      { kind: "speed", beatOffset: 0, endBeatOffset: 1,
        value: { transition: { start: 1, end: 4, easing: "ease_in_quad" } } },
      { kind: "speed", beatOffset: 1, endBeatOffset: 4,
        value: { transition: { start: 4, end: 1, easing: "ease_out_quad" } } },
    ],
  },

  // ---- Speed Drama (v5) ----
  {
    id: "speed-freeze-quick", name: "Quick freeze (speed 0, 1 beat)", category: "speed",
    description: "Speed: current → 0, 1 beat (faster than existing 2-beat freeze)",
    channels: ["speed"], defaultDuration: 1,
    template: [{ kind: "speed", beatOffset: 0, endBeatOffset: 1,
      value: { transition: { start: "$CURRENT", end: 0, easing: "ease_in_quad" } } }],
  },
  {
    id: "speed-unfreeze", name: "Unfreeze (speed 0→1)", category: "speed",
    description: "Speed: 0 → 1, instant snap-back",
    channels: ["speed"], defaultDuration: 0.25,
    template: [{ kind: "speed", beatOffset: 0, endBeatOffset: 0.25,
      value: { transition: { start: 0, end: 1, easing: "ease_out_expo" } } }],
  },
  {
    id: "speed-freeze-unfreeze", name: "Freeze + unfreeze", category: "speed",
    description: "Speed: 1→0 (freeze), hold 4 beats, 0→1 (snap back)",
    channels: ["speed"], defaultDuration: 6,
    template: [
      { kind: "speed", beatOffset: 0, endBeatOffset: 1,
        value: { transition: { start: "$CURRENT", end: 0, easing: "ease_in_quad" } } },
      { kind: "speed", beatOffset: 1, endBeatOffset: 5,
        value: { constant: 0 } },
      { kind: "speed", beatOffset: 5, endBeatOffset: 6,
        value: { transition: { start: 0, end: "$CURRENT", easing: "ease_out_expo" } } },
    ],
  },
  {
    id: "speed-rush", name: "Speed rush (1→10→1)", category: "speed",
    description: "Speed spikes to 10 then returns, 2 beats",
    channels: ["speed"], defaultDuration: 2,
    template: [
      { kind: "speed", beatOffset: 0, endBeatOffset: 0.5,
        value: { transition: { start: "$CURRENT", end: 10, easing: "ease_out_expo" } } },
      { kind: "speed", beatOffset: 0.5, endBeatOffset: 2,
        value: { transition: { start: 10, end: "$CURRENT", easing: "ease_out_quad" } } },
    ],
  },
  {
    id: "speed-slowmo", name: "Slow motion (speed 0.3)", category: "speed",
    description: "Speed: current → 0.3, 2 beats",
    channels: ["speed"], defaultDuration: 2,
    template: [{ kind: "speed", beatOffset: 0, endBeatOffset: 2,
      value: { transition: { start: "$CURRENT", end: 0.3, easing: "ease_in_out_sine" } } }],
  },

  // ---- Solarflare-style compound patterns (v5) ----
  {
    id: "dual-spin-opposite", name: "Dual spin (opposite directions)",
    category: "compound",
    description: "Rotation 0→4000° over 28 beats. Apply to one line, invert for the other.",
    channels: ["rotation"], defaultDuration: 28,
    template: [{ kind: "rotation", beatOffset: 0, endBeatOffset: 28,
      value: { transition: { start: "$CURRENT", end: 4000, easing: "linear" } } }],
  },
  {
    id: "ghost-sweep", name: "Ghost line sweep", category: "compound",
    description: "Slide X + fade alpha, like Solarflare's visual helpers",
    channels: ["x", "opacity"], defaultDuration: 4,
    template: [
      { kind: "opacity", beatOffset: 0, endBeatOffset: 0.5,
        value: { transition: { start: 0, end: 180, easing: "ease_out_sine" } } },
      { kind: "x", beatOffset: 0, endBeatOffset: 4,
        value: { transition: { start: "$CURRENT", end: 500, easing: "linear" } } },
      { kind: "opacity", beatOffset: 0.5, endBeatOffset: 4,
        value: { transition: { start: 180, end: 0, easing: "ease_in_sine" } } },
    ],
  },
  {
    id: "offscreen-spin-return", name: "Off-screen + spin return",
    category: "compound",
    description: "Y flings off-screen, line spins 180° while returning (Solarflare beat 186)",
    channels: ["y", "rotation"], defaultDuration: 8,
    template: [
      { kind: "y", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: "$CURRENT", end: 710, easing: "ease_in_quad" } } },
      { kind: "y", beatOffset: 3, endBeatOffset: 8,
        value: { transition: { start: -1910, end: "$CURRENT", easing: "ease_out_sine" } } },
      { kind: "rotation", beatOffset: 3, endBeatOffset: 8,
        value: { transition: { start: 130, end: 180, easing: "ease_out_sine" } } },
    ],
  },
  {
    id: "texture-pop-in", name: "Image pop-in", category: "compound",
    description: "Scale from 0 + opacity fade in (for texture lines like baie.png)",
    channels: ["scale_x", "scale_y", "opacity"], defaultDuration: 2,
    template: [
      { kind: "scale_x", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: 0, end: 0.17, easing: "ease_out_back" } } },
      { kind: "scale_y", beatOffset: 0, endBeatOffset: 2,
        value: { transition: { start: 0, end: 0.17, easing: "ease_out_back" } } },
      { kind: "opacity", beatOffset: 0, endBeatOffset: 1,
        value: { transition: { start: 0, end: 255, easing: "ease_out_sine" } } },
    ],
  },
];

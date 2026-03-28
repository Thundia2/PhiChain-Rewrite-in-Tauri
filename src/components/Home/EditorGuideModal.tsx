// ============================================================
// Interactive Editor Guide Modal
//
// A tab-based, animation-rich beginner's guide to the PhiChain
// editor. Replaces the old static text wall with live SVG
// animations demonstrating notes, events, easings, and the
// coordinate system.
//
// 10 tabs: Welcome, Canvas, Notes, Events, Easings, Tools,
//          Panels, Shortcuts, Advanced, Tips
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";

// ════════════════════════════════════════════════════
// DATA CONSTANTS
// ════════════════════════════════════════════════════

const NOTE_TYPES = [
  { kind: "tap", icon: "●", shortcut: "Q", color: "#48b5ff", desc: "Tap the screen when the note reaches the judgment line. The most common note type." },
  { kind: "drag", icon: "◆", shortcut: "W", color: "#ffd24a", desc: "Slide through — no need to lift your finger. Doesn't break combo if held." },
  { kind: "flick", icon: "▲", shortcut: "E", color: "#ff4a6a", desc: "Swipe upward when the note reaches the line. Requires directional input." },
  { kind: "hold", icon: "▮", shortcut: "R", color: "#4aff7a", desc: "Hold down for a duration. Has both a head beat and a hold duration." },
];

const EVENT_TYPES = [
  { kind: "x", color: "#ff6b6b", label: "X Position", range: "-675 to +675", desc: "Horizontal position of the judgment line.", group: "core" as const },
  { kind: "y", color: "#51cf66", label: "Y Position", range: "-450 to +450", desc: "Vertical position of the judgment line.", group: "core" as const },
  { kind: "rotation", color: "#ffd43b", label: "Rotation", range: "0° to 360°+", desc: "Rotation angle in degrees. Supports multi-rotation.", group: "core" as const },
  { kind: "opacity", color: "#cc5de8", label: "Opacity", range: "0 to 255", desc: "Transparency. 255 = visible, 0 = invisible.", group: "core" as const },
  { kind: "speed", color: "#4dabf7", label: "Speed", range: "0.0+", desc: "Note fall speed multiplier. 0 = frozen.", group: "core" as const },
  { kind: "scale_x", color: "#ff922b", label: "Scale X", range: "0.0+", desc: "Horizontal scale of the line (RPE).", group: "rpe" as const },
  { kind: "scale_y", color: "#20c997", label: "Scale Y", range: "0.0+", desc: "Vertical scale of the line (RPE).", group: "rpe" as const },
  { kind: "color", color: "#e599f7", label: "Color", range: "RGB", desc: "RGB color tint of the judgment line (RPE).", group: "rpe" as const },
  { kind: "text", color: "#a9e34b", label: "Text", range: "String", desc: "Text displayed on the line (RPE).", group: "rpe" as const },
  { kind: "incline", color: "#74c0fc", label: "Incline", range: "Float", desc: "3D tilt effect on the line (RPE).", group: "rpe" as const },
  { kind: "gif", color: "#f06595", label: "GIF", range: "0.0–1.0", desc: "Animated texture playback control (RPE).", group: "rpe" as const },
];

const TOOLS = [
  { id: "select", icon: "◇", key: "V", color: "#a0aec0", desc: "Click to select notes/events. Drag to box-select. Ctrl+click to toggle." },
  { id: "place_tap", icon: "●", key: "Q", color: "#48b5ff", desc: "Click on the timeline or canvas to place a Tap note." },
  { id: "place_drag", icon: "◆", key: "W", color: "#ffd24a", desc: "Click to place a Drag note." },
  { id: "place_flick", icon: "▲", key: "E", color: "#ff4a6a", desc: "Click to place a Flick note." },
  { id: "place_hold", icon: "▮", key: "R", color: "#4aff7a", desc: "Click to start a Hold note, click again to set the end beat." },
  { id: "eraser", icon: "✕", key: "X", color: "#ff8a8a", desc: "Click to delete notes or events." },
  { id: "pattern", icon: "⊞", key: "Ctrl+G", color: "#da77f2", desc: "Generate note patterns from shapes (sine, zigzag, arc, etc.)." },
];

const HOTKEYS = [
  { cat: "Tools", keys: [
    { key: "V", action: "Select tool" }, { key: "Q", action: "Place Tap" }, { key: "W", action: "Place Drag" },
    { key: "E", action: "Place Flick" }, { key: "R", action: "Place Hold" }, { key: "X", action: "Eraser tool" },
    { key: "T", action: "Toggle Beat Sync" }, { key: "F", action: "Flip notes above/below" },
  ]},
  { cat: "Playback", keys: [
    { key: "Space", action: "Play / Pause" }, { key: "←  /  →", action: "Seek backward / forward" },
  ]},
  { cat: "File", keys: [
    { key: "Ctrl+N", action: "New Chart" }, { key: "Ctrl+O", action: "Import Chart" },
    { key: "Ctrl+S", action: "Save Project" }, { key: "Ctrl+K", action: "Command Palette" },
  ]},
  { cat: "Editing", keys: [
    { key: "Ctrl+Z", action: "Undo" }, { key: "Ctrl+Shift+Z", action: "Redo" },
    { key: "Ctrl+A", action: "Select all notes" }, { key: "Delete", action: "Delete selected" },
    { key: "Ctrl+C / X / V", action: "Copy / Cut / Paste" },
    { key: "↑  /  ↓", action: "Move notes in time" }, { key: "←  /  →", action: "Move notes left/right" },
  ]},
  { cat: "Panels", keys: [
    { key: "L", action: "Line Drawer" }, { key: "I", action: "Inspector" },
    { key: "K", action: "Keyframe Bar" }, { key: "Shift+K", action: "Curve Editor" },
    { key: "Alt+1 / 2 / 3", action: "Timeline / Lines / Effects" },
    { key: "Shift+F", action: "Fit All (reset zoom)" }, { key: "Ctrl+L", action: "LineStrip search" },
  ]},
  { cat: "Groups", keys: [
    { key: "Ctrl+G", action: "Toggle Pattern tool" }, { key: "Ctrl+Shift+G", action: "Create group" },
    { key: "G", action: "Enter group edit" }, { key: "Escape", action: "Exit group edit" },
  ]},
  { cat: "Modes", keys: [
    { key: "Shift+I", action: "Toggle Mark/Improv mode" }, { key: "Alt+R", action: "Toggle Record mode" },
    { key: "1 / 2 / 3", action: "Place colored bookmarks (in Mark mode)" },
  ]},
];

const PANELS = [
  { id: "Inspector", tier: "always" as const, desc: "Properties of selected notes, events, or lines." },
  { id: "Toolbar", tier: "always" as const, desc: "Note placement tools and eraser." },
  { id: "Timeline", tier: "quick" as const, desc: "Vertical beat grid — the main editing surface." },
  { id: "Lines", tier: "quick" as const, desc: "List of all judgment lines in the chart." },
  { id: "Effects", tier: "quick" as const, desc: "Shader post-processing effects editor." },
  { id: "Textures", tier: "on_demand" as const, desc: "Custom line textures and resource packs." },
  { id: "Groups", tier: "on_demand" as const, desc: "Create and manage Line/Note Groups." },
  { id: "BPM List", tier: "on_demand" as const, desc: "Manage tempo change points." },
  { id: "Chart Settings", tier: "on_demand" as const, desc: "Song name, composer, offset metadata." },
  { id: "Validation", tier: "on_demand" as const, desc: "Scan chart for errors and warnings." },
  { id: "Presets", tier: "on_demand" as const, desc: "Built-in and custom event presets." },
];

const SHADERS = [
  { name: "chromatic", desc: "RGB channel split" }, { name: "circleBlur", desc: "Circular dot blur" },
  { name: "fisheye", desc: "Lens distortion" }, { name: "glitch", desc: "Digital glitch effect" },
  { name: "grayscale", desc: "Grayscale conversion" }, { name: "noise", desc: "Noise/grain overlay" },
  { name: "pixel", desc: "Pixelation" }, { name: "radialBlur", desc: "Zoom blur from center" },
  { name: "shockwave", desc: "Expanding ripple" }, { name: "vignette", desc: "Darkened edges" },
];

const PRESETS = [
  { cat: "Movement", items: ["Slide in from left", "Slide in from right", "Bounce Y", "Off-screen fling"] },
  { cat: "Visibility", items: ["Fade in", "Fade out", "Strobe flash"] },
  { cat: "Rotation", items: ["Gentle sway", "Full spin (360°)"] },
  { cat: "Speed", items: ["Speed freeze", "Speed burst", "Freeze + unfreeze", "Slow motion"] },
  { cat: "Compound", items: ["Dual spin", "Ghost sweep", "Off-screen + spin return"] },
];

const FORMATS = [
  { name: "PhiChain (.json)", desc: "Native format — stores everything.", dir: "Read/Write" },
  { name: "RPE (.json/.pez)", desc: "Re:PhiEdit — industry standard for custom charts.", dir: "Import/Export" },
  { name: "PEC (.json)", desc: "Phigros Extended Chart — older format.", dir: "Import/Export" },
  { name: "Official (.json)", desc: "Original Phigros official format.", dir: "Import/Export" },
  { name: ".pez (ZIP)", desc: "Phira archive — bundles chart + audio + assets.", dir: "Export" },
];

// ════════════════════════════════════════════════════
// EASING FUNCTIONS (embedded from src/canvas/easings.ts)
// ════════════════════════════════════════════════════

const PI = Math.PI;
const c1 = 1.70158; const c2 = c1 * 1.525; const c3 = c1 + 1;
const c4 = (2 * PI) / 3; const c5 = (2 * PI) / 4.5;

const easingFns: Record<string, (t: number) => number> = {
  linear: t => t,
  ease_in_sine: t => 1 - Math.cos((t * PI) / 2),
  ease_out_sine: t => Math.sin((t * PI) / 2),
  ease_in_out_sine: t => -(Math.cos(PI * t) - 1) / 2,
  ease_in_quad: t => t * t,
  ease_out_quad: t => 1 - (1 - t) * (1 - t),
  ease_in_out_quad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  ease_in_cubic: t => t * t * t,
  ease_out_cubic: t => 1 - Math.pow(1 - t, 3),
  ease_in_out_cubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  ease_in_quart: t => t * t * t * t,
  ease_out_quart: t => 1 - Math.pow(1 - t, 4),
  ease_in_out_quart: t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  ease_in_quint: t => t * t * t * t * t,
  ease_out_quint: t => 1 - Math.pow(1 - t, 5),
  ease_in_out_quint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
  ease_in_expo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  ease_out_expo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  ease_in_out_expo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  ease_in_circ: t => 1 - Math.sqrt(1 - t * t),
  ease_out_circ: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
  ease_in_out_circ: t => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  ease_in_back: t => c3 * t * t * t - c1 * t * t,
  ease_out_back: t => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  ease_in_out_back: t => t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  ease_in_elastic: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4),
  ease_out_elastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  ease_in_out_elastic: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,
  ease_out_bounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  ease_in_bounce: t => 1 - easingFns.ease_out_bounce(1 - t),
  ease_in_out_bounce: t => t < 0.5 ? (1 - easingFns.ease_out_bounce(1 - 2 * t)) / 2 : (1 + easingFns.ease_out_bounce(2 * t - 1)) / 2,
};

const EASING_NAMES = Object.keys(easingFns);

const EASING_FAMILIES = [
  { name: "Linear", easings: ["linear"] },
  { name: "Sine", easings: ["ease_in_sine", "ease_out_sine", "ease_in_out_sine"] },
  { name: "Quad", easings: ["ease_in_quad", "ease_out_quad", "ease_in_out_quad"] },
  { name: "Cubic", easings: ["ease_in_cubic", "ease_out_cubic", "ease_in_out_cubic"] },
  { name: "Quart", easings: ["ease_in_quart", "ease_out_quart", "ease_in_out_quart"] },
  { name: "Quint", easings: ["ease_in_quint", "ease_out_quint", "ease_in_out_quint"] },
  { name: "Expo", easings: ["ease_in_expo", "ease_out_expo", "ease_in_out_expo"] },
  { name: "Circ", easings: ["ease_in_circ", "ease_out_circ", "ease_in_out_circ"] },
  { name: "Back", easings: ["ease_in_back", "ease_out_back", "ease_in_out_back"] },
  { name: "Elastic", easings: ["ease_in_elastic", "ease_out_elastic", "ease_in_out_elastic"] },
  { name: "Bounce", easings: ["ease_in_bounce", "ease_out_bounce", "ease_in_out_bounce"] },
];

// ════════════════════════════════════════════════════
// TAB DEFINITIONS
// ════════════════════════════════════════════════════

const TABS = [
  { id: "welcome", label: "Welcome", icon: "◎" },
  { id: "canvas", label: "The Canvas", icon: "⊞" },
  { id: "notes", label: "Notes", icon: "♪" },
  { id: "events", label: "Events", icon: "⟿" },
  { id: "easings", label: "Easings", icon: "∿" },
  { id: "tools", label: "Tools", icon: "⚒" },
  { id: "panels", label: "Panels", icon: "❑" },
  { id: "shortcuts", label: "Shortcuts", icon: "⌨" },
  { id: "advanced", label: "Advanced", icon: "⚙" },
  { id: "tips", label: "Tips", icon: "★" },
];

// ════════════════════════════════════════════════════
// ANIMATION HOOK
// ════════════════════════════════════════════════════

function useAnimationLoop(active: boolean): React.MutableRefObject<number> {
  const progressRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      // Normalized to seconds for flexibility
      progressRef.current = elapsed / 1000;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return progressRef;
}

// ════════════════════════════════════════════════════
// HELPER COMPONENTS
// ════════════════════════════════════════════════════

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      background: "var(--bg-active)", border: "1px solid var(--border-color)",
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 10,
      color: "var(--text-primary)", lineHeight: "18px", whiteSpace: "nowrap",
    }}>{children}</kbd>
  );
}

function GCard({ children, highlight, style: s }: { children: React.ReactNode; highlight?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-tertiary)", border: `1px solid ${highlight || "var(--border-color)"}`,
      borderRadius: 8, padding: "10px 12px", ...s,
    }}>{children}</div>
  );
}

function STitle({ children, color = "var(--accent-primary)" }: { children: React.ReactNode; color?: string }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
      color, margin: "18px 0 8px", paddingBottom: 5,
      borderBottom: `1px solid ${color}33`,
    }}>{children}</h3>
  );
}

function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: size, background: color, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />;
}

// ════════════════════════════════════════════════════
// EASING PREVIEW (STATIC SVG)
// ════════════════════════════════════════════════════

function EasingMini({ name, size = 52 }: { name: string; size?: number }) {
  const fn = easingFns[name];
  if (!fn) return null;
  const pad = 5, w = size - pad * 2;
  const pts: string[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const v = fn(t);
    pts.push(`${pad + t * w},${size - pad - v * w}`);
  }
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <rect x={pad} y={pad} width={w} height={w} fill="none" stroke="var(--border-color)" strokeWidth="0.5" rx="2" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ════════════════════════════════════════════════════
// ANIMATION: Coordinate System (Canvas tab)
// ════════════════════════════════════════════════════

function CanvasCoordAnimation({ active }: { active: boolean }) {
  const svgRef = useRef<SVGGElement>(null);
  const labelXRef = useRef<SVGTextElement>(null);
  const labelYRef = useRef<SVGTextElement>(null);
  const trailRef = useRef<SVGGElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 6) / 6; // 6s loop
      const x = Math.sin(2 * PI * t) * 80;
      const y = Math.sin(4 * PI * t) * 50;
      const cx = 150 + x, cy = 100 + y;

      if (svgRef.current) svgRef.current.setAttribute("transform", `translate(${cx}, ${cy})`);
      if (labelXRef.current) labelXRef.current.textContent = `X: ${Math.round(x / 80 * 675)}`;
      if (labelYRef.current) labelYRef.current.textContent = `Y: ${Math.round(-y / 50 * 450)}`;

      // Trail dots
      if (trailRef.current) {
        const children = trailRef.current.children;
        for (let i = 0; i < 4; i++) {
          const tt = ((timeRef.current - (i + 1) * 0.12) % 6) / 6;
          const tx = 150 + Math.sin(2 * PI * tt) * 80;
          const ty = 100 + Math.sin(4 * PI * tt) * 50;
          if (children[i]) {
            children[i].setAttribute("cx", String(tx));
            children[i].setAttribute("cy", String(ty));
          }
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <svg width="100%" height="200" viewBox="0 0 300 200" style={{ display: "block", margin: "0 auto" }}>
      {/* Background */}
      <rect x="30" y="10" width="240" height="180" fill="var(--bg-primary)" stroke="var(--border-color)" strokeWidth="1" rx="4" />
      {/* Axes */}
      <line x1="150" y1="10" x2="150" y2="190" stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="30" y1="100" x2="270" y2="100" stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
      {/* Axis labels */}
      <text x="150" y="8" textAnchor="middle" fill="#51cf66" fontSize="8">+450</text>
      <text x="150" y="198" textAnchor="middle" fill="#ff6b6b" fontSize="8">-450</text>
      <text x="274" y="103" textAnchor="start" fill="#51cf66" fontSize="8">+675</text>
      <text x="26" y="103" textAnchor="end" fill="#ff6b6b" fontSize="8">-675</text>
      <text x="160" y="96" fill="#555" fontSize="7">(0, 0)</text>
      {/* Trail */}
      <g ref={trailRef}>
        {[0.15, 0.1, 0.06, 0.03].map((op, i) => (
          <circle key={i} cx="150" cy="100" r="3" fill="var(--accent-primary)" opacity={op} />
        ))}
      </g>
      {/* Moving judgment line group */}
      <g ref={svgRef}>
        <line x1="-25" y1="0" x2="25" y2="0" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="0" r="2.5" fill="var(--accent-primary)" />
      </g>
      {/* Live coordinate labels */}
      <rect x="105" y="172" width="90" height="18" rx="4" fill="var(--bg-active)" opacity="0.85" />
      <text ref={labelXRef} x="128" y="184" textAnchor="middle" fill="#ff6b6b" fontSize="9" fontFamily="monospace">X: 0</text>
      <text ref={labelYRef} x="172" y="184" textAnchor="middle" fill="#51cf66" fontSize="9" fontFamily="monospace">Y: 0</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════
// ANIMATION: Above / Below (Canvas tab)
// ════════════════════════════════════════════════════

function AboveBelowAnimation({ active }: { active: boolean }) {
  const aboveRef = useRef<SVGRectElement>(null);
  const belowRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<SVGCircleElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 3) / 3; // 3s loop
      const progress = Math.min(t / 0.7, 1); // hit at 70%
      const lineY = 60;
      const aboveY = lineY - 45 + progress * 45;
      const belowY = lineY + 45 - progress * 45;

      if (aboveRef.current) aboveRef.current.setAttribute("y", String(aboveY - 4));
      if (belowRef.current) belowRef.current.setAttribute("y", String(belowY - 4));

      // Hit flash
      if (flashRef.current) {
        const hitPhase = t > 0.7 ? (t - 0.7) / 0.15 : 0;
        const flashOpacity = hitPhase > 0 && hitPhase < 1 ? 1 - hitPhase : 0;
        const flashR = 3 + hitPhase * 12;
        flashRef.current.setAttribute("r", String(flashR));
        flashRef.current.setAttribute("opacity", String(flashOpacity));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <svg width="100%" height="120" viewBox="0 0 240 120" style={{ display: "block" }}>
      {/* Judgment line */}
      <line x1="50" y1="60" x2="190" y2="60" stroke="var(--accent-primary)" strokeWidth="2" />
      {/* Above note (falls down) */}
      <rect ref={aboveRef} x="95" y="15" width="20" height="8" rx="2" fill="#48b5ff" />
      <text x="75" y="20" fill="var(--text-muted)" fontSize="8">above</text>
      {/* Below note (rises up) */}
      <rect ref={belowRef} x="125" y="105" width="20" height="8" rx="2" fill="#48b5ff" />
      <text x="155" y="112" fill="var(--text-muted)" fontSize="8">below</text>
      {/* Hit flash */}
      <circle ref={flashRef} cx="120" cy="60" r="3" fill="white" opacity="0" />
    </svg>
  );
}

// ════════════════════════════════════════════════════
// ANIMATION: Note Falling (Notes tab)
// ════════════════════════════════════════════════════

function NoteFallingAnimation({ active }: { active: boolean }) {
  const noteRefs = useRef<(SVGGElement | null)[]>([]);
  const flashRefs = useRef<(SVGCircleElement | null)[]>([]);
  const holdBarRef = useRef<SVGRectElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 3) / 3;
      const laneW = 55, startY = 10, lineY = 130;
      const progress = Math.min(t / 0.75, 1); // hit at 75%
      const y = startY + progress * (lineY - startY);

      for (let i = 0; i < 4; i++) {
        const el = noteRefs.current[i];
        if (el) el.setAttribute("transform", `translate(0, ${y})`);

        const fl = flashRefs.current[i];
        if (fl) {
          const hitPhase = t > 0.75 ? (t - 0.75) / 0.12 : 0;
          const op = hitPhase > 0 && hitPhase < 1 ? 1 - hitPhase : 0;
          fl.setAttribute("r", String(3 + hitPhase * 10));
          fl.setAttribute("opacity", String(op));
        }
      }
      // Hold note bar stretches
      if (holdBarRef.current) {
        const holdH = Math.max(0, progress * 40);
        holdBarRef.current.setAttribute("height", String(holdH));
        holdBarRef.current.setAttribute("y", String(y - holdH));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  const laneW = 55, lineY = 130;
  return (
    <svg width="100%" height="160" viewBox="0 0 240 160" style={{ display: "block", margin: "0 auto" }}>
      {/* Lane dividers */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={10 + i * laneW} y1="0" x2={10 + i * laneW} y2="160" stroke="var(--border-color)" strokeWidth="0.5" />
      ))}
      {/* Judgment lines per lane */}
      {NOTE_TYPES.map((n, i) => (
        <g key={n.kind}>
          <line x1={10 + i * laneW + 4} y1={lineY} x2={10 + (i + 1) * laneW - 4} y2={lineY} stroke={n.color} strokeWidth="2" opacity="0.5" />
          {/* Lane label */}
          <text x={10 + i * laneW + laneW / 2} y="155" textAnchor="middle" fill={n.color} fontSize="9" fontWeight="bold">{n.kind.toUpperCase()}</text>
          {/* Hit flash */}
          <circle ref={el => { flashRefs.current[i] = el; }} cx={10 + i * laneW + laneW / 2} cy={lineY} r="3" fill="white" opacity="0" />
        </g>
      ))}
      {/* Hold bar (stretching) */}
      <rect ref={holdBarRef} x={10 + 3 * laneW + laneW / 2 - 5} y={lineY} width="10" height="0" rx="2" fill="#4aff7a" opacity="0.4" />
      {/* Moving notes */}
      {NOTE_TYPES.map((n, i) => (
        <g key={n.kind} ref={el => { noteRefs.current[i] = el; }}>
          {n.kind === "tap" && <circle cx={10 + i * laneW + laneW / 2} cy={0} r="6" fill={n.color} />}
          {n.kind === "drag" && <rect x={10 + i * laneW + laneW / 2 - 6} y={-4} width="12" height="8" rx="2" fill={n.color} />}
          {n.kind === "flick" && <polygon points={`${10 + i * laneW + laneW / 2},${-6} ${10 + i * laneW + laneW / 2 - 7},${5} ${10 + i * laneW + laneW / 2 + 7},${5}`} fill={n.color} />}
          {n.kind === "hold" && <rect x={10 + i * laneW + laneW / 2 - 6} y={-4} width="12" height="8" rx="2" fill={n.color} />}
        </g>
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════
// ANIMATION: Event Transition Demo (Events tab)
// ════════════════════════════════════════════════════

function EventTransitionAnimation({ active }: { active: boolean }) {
  const lineRef = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const [channel, setChannel] = useState<"x" | "y" | "rotation">("x");
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const rawT = (timeRef.current % 3) / 3;
      // Ping-pong: 0→1→0
      const t = rawT < 0.5 ? rawT * 2 : 2 - rawT * 2;
      const eased = easingFns.ease_in_out_sine(t);

      const cx = 120, cy = 70;
      let tx = cx, ty = cy, rot = 0;
      if (channel === "x") tx = cx - 60 + eased * 120;
      else if (channel === "y") ty = cy - 35 + eased * 70;
      else rot = eased * 180;

      if (lineRef.current) lineRef.current.setAttribute("transform", `translate(${tx}, ${ty}) rotate(${rot})`);

      // Curve tracking dot
      if (dotRef.current) {
        const dx = 20 + t * 80;
        const dy = 140 - eased * 30;
        dotRef.current.setAttribute("cx", String(dx));
        dotRef.current.setAttribute("cy", String(dy));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, channel, timeRef]);

  // Easing curve polyline for inset
  const curvePts: string[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const v = easingFns.ease_in_out_sine(t);
    curvePts.push(`${20 + t * 80},${140 - v * 30}`);
  }

  const channelColor = channel === "x" ? "#ff6b6b" : channel === "y" ? "#51cf66" : "#ffd43b";

  return (
    <div>
      {/* Channel toggle buttons */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "center" }}>
        {(["x", "y", "rotation"] as const).map(ch => (
          <button key={ch} onClick={() => setChannel(ch)} style={{
            padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            border: `1px solid ${channel === ch ? channelColor : "var(--border-color)"}`,
            background: channel === ch ? channelColor + "22" : "transparent",
            color: channel === ch ? channelColor : "var(--text-secondary)",
            cursor: "pointer",
          }}>{ch === "x" ? "X Position" : ch === "y" ? "Y Position" : "Rotation"}</button>
        ))}
      </div>
      <svg width="100%" height="160" viewBox="0 0 240 160" style={{ display: "block" }}>
        {/* Preview area */}
        <rect x="15" y="10" width="210" height="100" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
        {/* Center crosshairs */}
        <line x1="120" y1="10" x2="120" y2="110" stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="15" y1="60" x2="225" y2="60" stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Moving line */}
        <g ref={lineRef}>
          <line x1="-22" y1="0" x2="22" y2="0" stroke={channelColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="2" fill={channelColor} />
        </g>
        {/* Mini easing curve inset */}
        <rect x="15" y="115" width="90" height="40" fill="var(--bg-active)" rx="3" opacity="0.6" />
        <polyline points={curvePts.join(" ")} fill="none" stroke={channelColor} strokeWidth="1" opacity="0.6" />
        <circle ref={dotRef} cx="20" cy="140" r="3" fill={channelColor} />
        <text x="58" y="152" textAnchor="middle" fill="var(--text-muted)" fontSize="7">ease_in_out_sine</text>
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════
// ANIMATION: Constant vs Transition (Events tab)
// ════════════════════════════════════════════════════

function ConstantVsTransition({ active }: { active: boolean }) {
  const constLineRef = useRef<SVGLineElement>(null);
  const transLineRef = useRef<SVGGElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 2.5) / 2.5;
      // Constant: snap at 50%
      const constX = t < 0.5 ? 40 : 100;
      if (constLineRef.current) constLineRef.current.setAttribute("x1", String(constX - 18));
      if (constLineRef.current) constLineRef.current.setAttribute("x2", String(constX + 18));

      // Transition: smooth ease
      const transT = Math.min(t / 0.8, 1);
      const eased = easingFns.ease_in_out_cubic(transT);
      const transX = 40 + eased * 60;
      if (transLineRef.current) transLineRef.current.setAttribute("transform", `translate(${transX}, 40)`);

      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* Constant */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 4, fontWeight: 600 }}>Constant</div>
        <svg width="100%" height="80" viewBox="0 0 140 80" style={{ display: "block" }}>
          <rect x="5" y="5" width="130" height="70" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
          <line ref={constLineRef} x1="22" y1="40" x2="58" y2="40" stroke="#cc5de8" strokeWidth="2.5" strokeLinecap="round" />
          <text x="70" y="70" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Snaps instantly</text>
        </svg>
      </div>
      {/* Transition */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 4, fontWeight: 600 }}>Transition</div>
        <svg width="100%" height="80" viewBox="0 0 140 80" style={{ display: "block" }}>
          <rect x="5" y="5" width="130" height="70" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
          <g ref={transLineRef}>
            <line x1="-18" y1="0" x2="18" y2="0" stroke="#51cf66" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="0" cy="0" r="2" fill="#51cf66" />
          </g>
          <text x="70" y="70" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Slides smoothly</text>
        </svg>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// INTERACTIVE: Easing Curve Explorer (Easings tab)
// ════════════════════════════════════════════════════

function EasingExplorer({ active }: { active: boolean }) {
  const [selected, setSelected] = useState("ease_out_cubic");
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const barRef = useRef<SVGRectElement>(null);
  const timeRef = useAnimationLoop(active);

  const filteredEasings = familyFilter
    ? EASING_FAMILIES.find(f => f.name === familyFilter)?.easings ?? EASING_NAMES
    : EASING_NAMES;

  // Animated dot + elevator bar
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 2) / 2;
      const fn = easingFns[selected] ?? easingFns.linear;
      const v = fn(t);

      const pad = 20, gw = 200, gh = 140;
      const dx = pad + t * gw;
      const dy = pad + gh - v * gh;
      if (dotRef.current) {
        dotRef.current.setAttribute("cx", String(dx));
        dotRef.current.setAttribute("cy", String(Math.max(pad - 15, Math.min(pad + gh + 15, dy))));
      }
      // Elevator bar (clamped)
      const barH = Math.max(0, Math.min(gh, v * gh));
      if (barRef.current) {
        barRef.current.setAttribute("y", String(pad + gh - barH));
        barRef.current.setAttribute("height", String(barH));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, selected, timeRef]);

  // Curve polyline
  const fn = easingFns[selected] ?? easingFns.linear;
  const pad = 20, gw = 200, gh = 140;
  const pts: string[] = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const v = fn(t);
    pts.push(`${pad + t * gw},${pad + gh - v * gh}`);
  }

  return (
    <div>
      {/* Family filter row */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setFamilyFilter(null)} style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
          border: `1px solid ${!familyFilter ? "var(--accent-primary)" : "var(--border-color)"}`,
          background: !familyFilter ? "var(--accent-primary)22" : "transparent",
          color: !familyFilter ? "var(--accent-primary)" : "var(--text-muted)", cursor: "pointer",
        }}>All</button>
        {EASING_FAMILIES.map(f => (
          <button key={f.name} onClick={() => setFamilyFilter(f.name === familyFilter ? null : f.name)} style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 9,
            border: `1px solid ${familyFilter === f.name ? "var(--accent-primary)" : "var(--border-color)"}`,
            background: familyFilter === f.name ? "var(--accent-primary)22" : "transparent",
            color: familyFilter === f.name ? "var(--accent-primary)" : "var(--text-muted)", cursor: "pointer",
          }}>{f.name}</button>
        ))}
      </div>

      {/* Main explorer */}
      <div style={{ display: "flex", gap: 10 }}>
        <svg width="240" height="180" viewBox="0 0 240 180" style={{ flexShrink: 0 }}>
          <rect x={pad} y={pad} width={gw} height={gh} fill="var(--bg-primary)" stroke="var(--border-color)" rx="3" />
          {/* Reference diagonal */}
          <line x1={pad} y1={pad + gh} x2={pad + gw} y2={pad} stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
          {/* Curve */}
          <polyline points={pts.join(" ")} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinejoin="round" />
          {/* Tracking dot */}
          <circle ref={dotRef} cx={pad} cy={pad + gh} r="4" fill="var(--accent-primary)" />
          {/* Elevator bar */}
          <rect ref={barRef} x={pad + gw + 8} y={pad + gh} width="8" height="0" rx="2" fill="var(--accent-primary)" opacity="0.6" />
          <rect x={pad + gw + 8} y={pad} width="8" height={gh} rx="2" fill="none" stroke="var(--border-color)" strokeWidth="0.5" />
          {/* Label */}
          <text x={pad + gw / 2} y={pad + gh + 16} textAnchor="middle" fill="var(--text-secondary)" fontSize="9" fontFamily="monospace">{selected}</text>
        </svg>

        {/* Easing description */}
        <div style={{ flex: 1, padding: "4px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 4 }}>{selected}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {selected.includes("in_out") ? "Slow start and slow end — smooth both ways." :
             selected.includes("_in_") || selected.startsWith("ease_in") ? "Slow start, fast end — builds momentum." :
             selected.includes("_out_") || selected.startsWith("ease_out") ? "Fast start, slow end — decelerates." :
             "Constant speed, no acceleration."}
            {selected.includes("back") && " Overshoots the target, then returns."}
            {selected.includes("elastic") && " Spring-like oscillation around the target."}
            {selected.includes("bounce") && " Bounces off the target value."}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
            Tip: <strong>In</strong> = slow start, <strong>Out</strong> = slow end, <strong>InOut</strong> = slow both
          </div>
        </div>
      </div>

      {/* Grid of all easings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 4, marginTop: 10, maxHeight: 200, overflowY: "auto" }}>
        {filteredEasings.map(name => (
          <div key={name} onClick={() => setSelected(name)} style={{
            padding: 4, borderRadius: 6, cursor: "pointer", textAlign: "center",
            background: selected === name ? "var(--bg-active)" : "transparent",
            border: `1px solid ${selected === name ? "var(--accent-primary)" : "var(--border-color)"}`,
            transition: "border-color 0.15s",
          }}>
            <EasingMini name={name} size={48} />
            <div style={{ fontSize: 7, color: "var(--text-muted)", marginTop: 1, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.2 }}>
              {name.replace(/ease_/g, "").replace(/_/g, " ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// TAB CONTENT COMPONENTS
// ════════════════════════════════════════════════════

function WelcomeTab() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent-primary)", letterSpacing: -0.5 }}>
          Welcome to PhiChain
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.6 }}>
          A chart editor for the rhythm game Phigros. Create charts with moving judgment lines,
          falling notes, and dramatic animations.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { icon: "━", color: "#6c8aff", title: "Judgment Lines", desc: "Lines move, rotate, and fade across the screen. Notes fall toward them." },
          { icon: "♪", color: "#48b5ff", title: "Notes", desc: "4 note types (Tap, Drag, Flick, Hold) that players interact with." },
          { icon: "∿", color: "#51cf66", title: "Events", desc: "Animations that control line position, rotation, opacity, and speed over time." },
        ].map(c => (
          <GCard key={c.title} highlight={c.color + "33"}>
            <div style={{ fontSize: 22, color: c.color, textAlign: "center", marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.color, textAlign: "center" }}>{c.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
          </GCard>
        ))}
      </div>

      <GCard>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text-primary)" }}>Quick Start:</strong> Press <Kbd>Ctrl+N</Kbd> to create a new chart,
          or <Kbd>Ctrl+O</Kbd> to import an existing RPE chart. Then use the toolbar to place notes
          and the keyframe bar to animate lines. Press <Kbd>Space</Kbd> to preview your work.
        </div>
      </GCard>

      <div style={{ textAlign: "center", marginTop: 16, color: "var(--text-muted)", fontSize: 10 }}>
        Navigate the tabs on the left to learn each concept, or click <strong>Next</strong> below.
      </div>
    </div>
  );
}

function CanvasTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Coordinate System</STitle>
      <GCard>
        <CanvasCoordAnimation active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
          The canvas is <strong style={{ color: "var(--text-primary)" }}>1350 x 900</strong> units.
          Origin (0, 0) is at the center. X ranges from <span style={{ color: "#ff6b6b" }}>-675</span> to <span style={{ color: "#51cf66" }}>+675</span>,
          Y from <span style={{ color: "#ff6b6b" }}>-450</span> to <span style={{ color: "#51cf66" }}>+450</span>.
        </div>
      </GCard>

      <STitle>Above & Below</STitle>
      <GCard>
        <AboveBelowAnimation active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
          Notes can fall from <strong style={{ color: "var(--text-primary)" }}>above</strong> or
          rise from <strong style={{ color: "var(--text-primary)" }}>below</strong> the judgment line.
          Press <Kbd>F</Kbd> to flip selected notes between sides.
        </div>
      </GCard>

      <STitle>Beat System</STitle>
      <GCard>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Time is measured in <strong style={{ color: "var(--text-primary)" }}>beats</strong>, stored as{" "}
          <code style={{ color: "var(--accent-primary)" }}>[whole, numerator, denominator]</code> tuples.
          <br />
          Example: <code style={{ color: "#ffd43b" }}>[2, 3, 4]</code> = beat 2 + 3/4 = <strong>2.75</strong>.
          <br />
          The <strong style={{ color: "var(--text-primary)" }}>density</strong> setting (1-32) controls how finely
          the beat grid subdivides. Density 4 = quarter-beat snapping.
        </div>
      </GCard>
    </div>
  );
}

function NotesTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Note Types</STitle>
      <GCard style={{ marginBottom: 10 }}>
        <NoteFallingAnimation active={active} />
      </GCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {NOTE_TYPES.map(n => (
          <GCard key={n.kind} highlight={n.color + "44"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20, color: n.color }}>{n.icon}</span>
              <div>
                <span style={{ fontWeight: 700, fontSize: 12, color: n.color, textTransform: "uppercase" }}>{n.kind}</span>
                <span style={{ marginLeft: 6 }}><Kbd>{n.shortcut}</Kbd></span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>{n.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Key Note Properties</STitle>
      <GCard>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "3px 10px", fontSize: 10, lineHeight: 1.7 }}>
          {[
            ["beat", "When to hit — stored as [whole, num, denom]"],
            ["x", "Position on the line (-675 to +675)"],
            ["above", "Falls from above (true) or below (false)"],
            ["speed", "Fall speed multiplier (default 1.0)"],
            ["hold_beat", "Duration for Hold notes"],
            ["fake", "Displays but doesn't count for combo"],
          ].map(([prop, desc]) => (
            <div key={prop} style={{ display: "contents" }}>
              <code style={{ color: "var(--accent-primary)", fontFamily: "monospace" }}>{prop}</code>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </GCard>
    </div>
  );
}

function EventsTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>How Events Work</STitle>
      <GCard style={{ marginBottom: 8 }}>
        <EventTransitionAnimation active={active} />
      </GCard>

      <STitle>Constant vs Transition</STitle>
      <GCard style={{ marginBottom: 8 }}>
        <ConstantVsTransition active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text-primary)" }}>Constant</strong> events hold a fixed value.{" "}
          <strong style={{ color: "var(--text-primary)" }}>Transition</strong> events smoothly interpolate
          from start to end using an easing curve.
        </div>
      </GCard>

      <STitle>Core Events (5)</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {EVENT_TYPES.filter(e => e.group === "core").map(ev => (
          <GCard key={ev.kind} highlight={ev.color + "33"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 28, borderRadius: 3, background: ev.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: ev.color, fontSize: 11 }}>{ev.label}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 8 }}>{ev.range}</span>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>{ev.desc}</div>
              </div>
            </div>
          </GCard>
        ))}
      </div>

      <STitle color="#ff922b">Extended RPE Events (6)</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {EVENT_TYPES.filter(e => e.group === "rpe").map(ev => (
          <GCard key={ev.kind} highlight={ev.color + "22"}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ColorDot color={ev.color} />
              <span style={{ fontWeight: 600, color: ev.color, fontSize: 10 }}>{ev.label}</span>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{ev.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Event Layers</STitle>
      <GCard>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          RPE charts support up to <strong style={{ color: "var(--text-primary)" }}>5 additive event layers</strong> per line.
          Values from all layers are summed for the final result. Layer selector: <strong>-1</strong> = flat (default), <strong>0–4</strong> = specific layer.
        </div>
      </GCard>
    </div>
  );
}

function EasingsTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Easing Curve Explorer</STitle>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
        Easing curves control the acceleration of transitions. Click any curve below to see it animate.
        There are <strong style={{ color: "var(--text-primary)" }}>33 built-in curves</strong> across 11 families.
      </div>
      <EasingExplorer active={active} />
    </div>
  );
}

function ToolsTab() {
  return (
    <div>
      <STitle>Editor Tools</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {TOOLS.map(t => (
          <GCard key={t.id} highlight={t.color + "33"}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, color: t.color,
                background: t.color + "15", border: `1px solid ${t.color}33`, flexShrink: 0,
              }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: t.color, fontSize: 11, textTransform: "capitalize" }}>
                  {t.id.replace(/_/g, " ").replace("place ", "")}
                </span>
                <span style={{ marginLeft: 6 }}><Kbd>{t.key}</Kbd></span>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>{t.desc}</div>
              </div>
            </div>
          </GCard>
        ))}
      </div>

      <STitle>Beat Sync Mode</STitle>
      <GCard highlight="#ffd43b33">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Kbd>T</Kbd>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            When <strong style={{ color: "#ffd43b" }}>Beat Sync</strong> is enabled, notes are placed at the current
            playhead beat instead of where you click vertically. Great for placing notes while playing.
          </div>
        </div>
      </GCard>

      <STitle>Typical Workflow</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: "8px 10px", marginTop: 4 }}>
        {[
          ["1", "Select a note tool (Q/W/E/R) or use the toolbar"],
          ["2", "Click on the timeline or canvas to place notes at beat positions"],
          ["3", "Use Select (V) to adjust, then animate lines with events in the keyframe bar"],
        ].map(([n, desc]) => (
          <div key={n} style={{ display: "contents" }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "var(--accent-primary)",
              color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center",
              justifyContent: "center",
            }}>{n}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, paddingTop: 2 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelsTab() {
  const tierConfig = [
    { tier: "always" as const, label: "Always Visible", color: "#4aff7a", desc: "Core panels that are always accessible." },
    { tier: "quick" as const, label: "Quick Access", color: "#ffd43b", desc: "Toggle with Alt+1/2/3 in the bottom drawer." },
    { tier: "on_demand" as const, label: "On Demand", color: "#888", desc: "Open via Command Palette (Ctrl+K) or menus." },
  ];

  return (
    <div>
      <STitle>Panel Tier System</STitle>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
        Panels are organized into 3 tiers based on how often you need them.
      </div>
      {tierConfig.map(tc => (
        <div key={tc.tier} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ColorDot color={tc.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: tc.color }}>{tc.label}</span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{tc.desc}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 16 }}>
            {PANELS.filter(p => p.tier === tc.tier).map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: 100 }}>{p.id}</span>
                <span style={{ color: "var(--text-secondary)" }}>{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShortcutsTab() {
  return (
    <div>
      <STitle>Keyboard Shortcuts</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
        {HOTKEYS.map(cat => (
          <div key={cat.cat}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, paddingBottom: 3, borderBottom: "1px solid var(--border-color)" }}>
              {cat.cat}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {cat.keys.map(k => (
                <div key={k.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, padding: "2px 0" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{k.action}</span>
                  <Kbd>{k.key}</Kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancedTab() {
  return (
    <div>
      <STitle>Record Mode</STitle>
      <GCard highlight="#4aff7a33">
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <Kbd>Alt+R</Kbd> — Record X/Y/Rotation keyframes by moving lines during playback.
          Channels (X, Y, Rotation) are toggleable. Recorded keyframes can be simplified
          with the Ramer-Douglas-Peucker algorithm before committing as events.
        </div>
      </GCard>

      <STitle>Mark / Improvisation Mode</STitle>
      <GCard highlight="#da77f233">
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <Kbd>Shift+I</Kbd> — Place colored bookmarks during playback by pressing Q/W/E/R (note types)
          or 1/2/3 (colored markers). Convert bookmarks to real notes afterwards.
          Built-in latency compensation (-40ms default).
        </div>
      </GCard>

      <STitle>Event Presets</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {PRESETS.map(p => (
          <GCard key={p.cat}>
            <div style={{ fontWeight: 600, fontSize: 10, color: "var(--accent-primary)", marginBottom: 3 }}>{p.cat}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{p.items.join(", ")}</div>
          </GCard>
        ))}
      </div>

      <STitle>Shader Effects</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {SHADERS.map(s => (
          <GCard key={s.name}>
            <code style={{ fontSize: 9, color: "var(--accent-primary)" }}>{s.name}</code>
            <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{s.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Import / Export Formats</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {FORMATS.map(f => (
          <GCard key={f.name}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 10, color: "var(--text-primary)" }}>{f.name}</span>
              <span style={{ fontSize: 8, color: "var(--accent-primary)", background: "var(--accent-primary)15", padding: "1px 6px", borderRadius: 3 }}>{f.dir}</span>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 2 }}>{f.desc}</div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

function TipsTab() {
  const tips = [
    { color: "#48b5ff", title: "Start simple", desc: "Begin with one line at the center. Add notes first, then animate with events." },
    { color: "#ffd43b", title: "Use the grid", desc: "Set Density to match the song's rhythm (4 = quarter-beat, 8 = eighth-note, 16 = sixteenth)." },
    { color: "#4aff7a", title: "Preview often", desc: "Press Space to play. Use 0.5x speed for tricky sections. The game preview shows exactly what players see." },
    { color: "#ff4a6a", title: "Multiple lines", desc: "Real Phigros charts use many independently moving lines. Start with 2-3, then add more for complexity." },
    { color: "#cc5de8", title: "Undo is your friend", desc: "Ctrl+Z gives you 200 undo steps. Experiment freely!" },
    { color: "#4dabf7", title: "Speed events for drama", desc: "Set speed to 0 before a music drop (freeze notes), then snap back to 1 for impact." },
    { color: "#ff922b", title: "Invisible lines are powerful", desc: "Set opacity to 0 — notes still fall, but the line is invisible. Used in almost every hard chart." },
    { color: "#51cf66", title: "Command Palette", desc: "Press Ctrl+K to access any action instantly. Search for presets, generators, settings, and more." },
    { color: "#a9e34b", title: "Learn easing curves", desc: "The difference between a good and great chart is in the easing. ease_out gives smooth landings, ease_in_out gives gentle motion." },
    { color: "#6c8aff", title: "Happy charting!", desc: "Join the Phigros custom chart community, share your work, and play other people's charts for inspiration." },
  ];

  return (
    <div>
      <STitle>Tips & Best Practices</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tips.map((tip, i) => (
          <GCard key={i} style={{ borderLeft: `3px solid ${tip.color}`, paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: tip.color, marginBottom: 2 }}>{tip.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>{tip.desc}</div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════

interface EditorGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditorGuideModal({ open, onClose }: EditorGuideModalProps) {
  const [activeTab, setActiveTab] = useState("welcome");
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  // Reset scroll on tab change
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  // Reset to welcome on open
  useEffect(() => {
    if (open) setActiveTab("welcome");
  }, [open]);

  const tabIndex = TABS.findIndex(t => t.id === activeTab);
  const isLastTab = tabIndex === TABS.length - 1;

  const goNext = useCallback(() => {
    if (isLastTab) { onClose(); return; }
    setActiveTab(TABS[tabIndex + 1].id);
  }, [tabIndex, isLastTab, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(4px)",
      }}
    >
      <div style={{
        width: 760, maxWidth: "92vw", maxHeight: "82vh",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "guideScaleIn 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderBottom: "1px solid var(--border-color)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--accent-primary)" }}>Editor Guide</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
              {TABS[tabIndex]?.label}
            </span>
          </div>
          <button onClick={onClose} style={{
            cursor: "pointer", color: "var(--text-muted)", fontSize: 16,
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, backgroundColor: "var(--bg-active)", border: "none",
          }}>✕</button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{
            width: 160, flexShrink: 0,
            background: "var(--bg-primary)",
            borderRight: "1px solid var(--border-color)",
            overflowY: "auto", padding: "6px 0",
          }}>
            {TABS.map((tab, i) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 14px", border: "none",
                borderLeft: activeTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                background: activeTab === tab.id ? "var(--bg-active)" : "transparent",
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", fontSize: 11, fontWeight: activeTab === tab.id ? 600 : 400,
                textAlign: "left", transition: "background 0.1s",
              }}>
                <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {i <= tabIndex && i !== tabIndex && (
                  <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 9 }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {activeTab === "welcome" && <WelcomeTab />}
            {activeTab === "canvas" && <CanvasTab active={activeTab === "canvas"} />}
            {activeTab === "notes" && <NotesTab active={activeTab === "notes"} />}
            {activeTab === "events" && <EventsTab active={activeTab === "events"} />}
            {activeTab === "easings" && <EasingsTab active={activeTab === "easings"} />}
            {activeTab === "tools" && <ToolsTab />}
            {activeTab === "panels" && <PanelsTab />}
            {activeTab === "shortcuts" && <ShortcutsTab />}
            {activeTab === "advanced" && <AdvancedTab />}
            {activeTab === "tips" && <TipsTab />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 18px", borderTop: "1px solid var(--border-color)", flexShrink: 0,
        }}>
          {/* Pagination dots */}
          <div style={{ display: "flex", gap: 5 }}>
            {TABS.map((tab, i) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: 7, height: 7, borderRadius: 7, border: "none", cursor: "pointer", padding: 0,
                background: i === tabIndex ? "var(--accent-primary)" : i < tabIndex ? "var(--accent-primary)" : "var(--border-color)",
                opacity: i === tabIndex ? 1 : i < tabIndex ? 0.4 : 0.3,
                transition: "background 0.2s",
              }} title={tab.label} />
            ))}
          </div>
          {/* Next / Done */}
          <button onClick={goNext} style={{
            padding: "5px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: "none", cursor: "pointer",
            background: "var(--accent-primary)", color: "#fff",
            transition: "opacity 0.15s",
          }}>
            {isLastTab ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

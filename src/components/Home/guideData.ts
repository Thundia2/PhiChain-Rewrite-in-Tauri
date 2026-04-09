// ============================================================
// Editor Guide — Data Constants & Easing Functions
//
// Pure data definitions used by the interactive editor guide:
// note types, event types, tools, hotkeys, panels, shaders,
// presets, formats, tabs, and embedded easing math for
// animation previews.
// ============================================================

// ---- Note & Event Data ----

export const NOTE_TYPES = [
  { kind: "tap", icon: "\u25CF", shortcut: "Q", color: "#48b5ff", desc: "Tap the screen when the note reaches the judgment line. The most common note type." },
  { kind: "drag", icon: "\u25C6", shortcut: "W", color: "#ffd24a", desc: "Slide through \u2014 no need to lift your finger. Doesn't break combo if held." },
  { kind: "flick", icon: "\u25B2", shortcut: "E", color: "#ff4a6a", desc: "Swipe upward when the note reaches the line. Requires directional input." },
  { kind: "hold", icon: "\u25AE", shortcut: "R", color: "#4aff7a", desc: "Hold down for a duration. Has both a head beat and a hold duration." },
];

export const EVENT_TYPES = [
  { kind: "x", color: "#ff6b6b", label: "X Position", range: "-675 to +675", desc: "Horizontal position of the judgment line.", group: "core" as const },
  { kind: "y", color: "#51cf66", label: "Y Position", range: "-450 to +450", desc: "Vertical position of the judgment line.", group: "core" as const },
  { kind: "rotation", color: "#ffd43b", label: "Rotation", range: "0\u00B0 to 360\u00B0+", desc: "Rotation angle in degrees. Supports multi-rotation.", group: "core" as const },
  { kind: "opacity", color: "#cc5de8", label: "Opacity", range: "0 to 255", desc: "Transparency. 255 = visible, 0 = invisible.", group: "core" as const },
  { kind: "speed", color: "#4dabf7", label: "Speed", range: "0.0+", desc: "Note fall speed multiplier. 0 = frozen.", group: "core" as const },
  { kind: "scale_x", color: "#ff922b", label: "Scale X", range: "0.0+", desc: "Horizontal scale of the line (RPE).", group: "rpe" as const },
  { kind: "scale_y", color: "#20c997", label: "Scale Y", range: "0.0+", desc: "Vertical scale of the line (RPE).", group: "rpe" as const },
  { kind: "color", color: "#e599f7", label: "Color", range: "RGB", desc: "RGB color tint of the judgment line (RPE).", group: "rpe" as const },
  { kind: "text", color: "#a9e34b", label: "Text", range: "String", desc: "Text displayed on the line (RPE).", group: "rpe" as const },
  { kind: "incline", color: "#74c0fc", label: "Incline", range: "Float", desc: "3D tilt effect on the line (RPE).", group: "rpe" as const },
  { kind: "gif", color: "#f06595", label: "GIF", range: "0.0\u20131.0", desc: "Animated texture playback control (RPE).", group: "rpe" as const },
];

export const TOOLS = [
  { id: "select", icon: "\u25C7", key: "V", color: "#a0aec0", desc: "Click to select notes/events. Drag to box-select. Ctrl+click to toggle." },
  { id: "place_tap", icon: "\u25CF", key: "Q", color: "#48b5ff", desc: "Click on the timeline or canvas to place a Tap note." },
  { id: "place_drag", icon: "\u25C6", key: "W", color: "#ffd24a", desc: "Click to place a Drag note." },
  { id: "place_flick", icon: "\u25B2", key: "E", color: "#ff4a6a", desc: "Click to place a Flick note." },
  { id: "place_hold", icon: "\u25AE", key: "R", color: "#4aff7a", desc: "Click to start a Hold note, click again to set the end beat." },
  { id: "eraser", icon: "\u2715", key: "X", color: "#ff8a8a", desc: "Click to delete notes or events." },
  { id: "pattern", icon: "\u229E", key: "Ctrl+G", color: "#da77f2", desc: "Generate note patterns from shapes (sine, zigzag, arc, etc.)." },
];

export const HOTKEYS = [
  { cat: "Tools", keys: [
    { key: "V", action: "Select tool" }, { key: "Q", action: "Place Tap" }, { key: "W", action: "Place Drag" },
    { key: "E", action: "Place Flick" }, { key: "R", action: "Place Hold" }, { key: "X", action: "Eraser tool" },
    { key: "T", action: "Toggle Beat Sync" }, { key: "F", action: "Flip notes above/below" },
  ]},
  { cat: "Playback", keys: [
    { key: "Space", action: "Play / Pause" }, { key: "\u2190  /  \u2192", action: "Seek backward / forward" },
  ]},
  { cat: "File", keys: [
    { key: "Ctrl+N", action: "New Chart" }, { key: "Ctrl+O", action: "Import Chart" },
    { key: "Ctrl+S", action: "Save Project" }, { key: "Ctrl+K", action: "Command Palette" },
  ]},
  { cat: "Editing", keys: [
    { key: "Ctrl+Z", action: "Undo" }, { key: "Ctrl+Shift+Z", action: "Redo" },
    { key: "Ctrl+A", action: "Select all notes" }, { key: "Delete", action: "Delete selected" },
    { key: "Ctrl+C / X / V", action: "Copy / Cut / Paste" },
    { key: "\u2191  /  \u2193", action: "Move notes in time" }, { key: "\u2190  /  \u2192", action: "Move notes left/right" },
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

export const PANELS = [
  { id: "Inspector", tier: "always" as const, desc: "Properties of selected notes, events, or lines." },
  { id: "Toolbar", tier: "always" as const, desc: "Note placement tools and eraser." },
  { id: "Timeline", tier: "quick" as const, desc: "Vertical beat grid \u2014 the main editing surface." },
  { id: "Lines", tier: "quick" as const, desc: "List of all judgment lines in the chart." },
  { id: "Effects", tier: "quick" as const, desc: "Shader post-processing effects editor." },
  { id: "Textures", tier: "on_demand" as const, desc: "Custom line textures and resource packs." },
  { id: "Groups", tier: "on_demand" as const, desc: "Create and manage Line/Note Groups." },
  { id: "BPM List", tier: "on_demand" as const, desc: "Manage tempo change points." },
  { id: "Chart Settings", tier: "on_demand" as const, desc: "Song name, composer, offset metadata." },
  { id: "Validation", tier: "on_demand" as const, desc: "Scan chart for errors and warnings." },
  { id: "Presets", tier: "on_demand" as const, desc: "Built-in and custom event presets." },
];

export const SHADERS = [
  { name: "chromatic", desc: "RGB channel split" }, { name: "circleBlur", desc: "Circular dot blur" },
  { name: "fisheye", desc: "Lens distortion" }, { name: "glitch", desc: "Digital glitch effect" },
  { name: "grayscale", desc: "Grayscale conversion" }, { name: "noise", desc: "Noise/grain overlay" },
  { name: "pixel", desc: "Pixelation" }, { name: "radialBlur", desc: "Zoom blur from center" },
  { name: "shockwave", desc: "Expanding ripple" }, { name: "vignette", desc: "Darkened edges" },
];

export const PRESETS = [
  { cat: "Movement", items: ["Slide in from left", "Slide in from right", "Bounce Y", "Off-screen fling"] },
  { cat: "Visibility", items: ["Fade in", "Fade out", "Strobe flash"] },
  { cat: "Rotation", items: ["Gentle sway", "Full spin (360\u00B0)"] },
  { cat: "Speed", items: ["Speed freeze", "Speed burst", "Freeze + unfreeze", "Slow motion"] },
  { cat: "Compound", items: ["Dual spin", "Ghost sweep", "Off-screen + spin return"] },
];

export const FORMATS = [
  { name: "PhiChain (.json)", desc: "Native format \u2014 stores everything.", dir: "Read/Write" },
  { name: "RPE (.json/.pez)", desc: "Re:PhiEdit \u2014 industry standard for custom charts.", dir: "Import/Export" },
  { name: "PEC (.json)", desc: "Phigros Extended Chart \u2014 older format.", dir: "Import/Export" },
  { name: "Official (.json)", desc: "Original Phigros official format.", dir: "Import/Export" },
  { name: ".pez (ZIP)", desc: "Phira archive \u2014 bundles chart + audio + assets.", dir: "Export" },
];

export const TABS = [
  { id: "welcome", label: "Welcome", icon: "\u25CE" },
  { id: "canvas", label: "The Canvas", icon: "\u229E" },
  { id: "notes", label: "Notes", icon: "\u266A" },
  { id: "events", label: "Events", icon: "\u27BF" },
  { id: "easings", label: "Easings", icon: "\u223F" },
  { id: "tools", label: "Tools", icon: "\u2692" },
  { id: "panels", label: "Panels", icon: "\u274D" },
  { id: "shortcuts", label: "Shortcuts", icon: "\u2328" },
  { id: "advanced", label: "Advanced", icon: "\u2699" },
  { id: "tips", label: "Tips", icon: "\u2605" },
];

// ---- Easing Functions (embedded for animation previews) ----

const PI = Math.PI;
const c1 = 1.70158; const c2 = c1 * 1.525; const c3 = c1 + 1;
const c4 = (2 * PI) / 3; const c5 = (2 * PI) / 4.5;

export const easingFns: Record<string, (t: number) => number> = {
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

export const EASING_NAMES = Object.keys(easingFns);

export const EASING_FAMILIES = [
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

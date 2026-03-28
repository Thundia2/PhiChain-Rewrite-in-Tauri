// ============================================================
// Visual Easing Picker
//
// Popover with curve thumbnails grouped by family, plus
// favorites and recents rows. Replaces flat <select> dropdowns.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

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

/** Tiny canvas that draws an easing curve thumbnail */
function EasingThumb({ easing, size = 24 }: { easing: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    ctx.setLineDash([]);

    // Draw easing curve using CSS approximation
    ctx.strokeStyle = "var(--accent-primary, #6366f1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= W; i++) {
      const t = i / W;
      const v = evaluateEasing(easing, t);
      const y = H - v * H;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }, [easing, size]);

  return <canvas ref={canvasRef} width={size} height={size}
    style={{ width: size, height: size }} />;
}

/** Simple easing evaluation for preview only (not used for chart data) */
function evaluateEasing(name: string, t: number): number {
  switch (name) {
    case "linear": return t;
    case "ease_in_sine": return 1 - Math.cos((t * Math.PI) / 2);
    case "ease_out_sine": return Math.sin((t * Math.PI) / 2);
    case "ease_in_out_sine": return -(Math.cos(Math.PI * t) - 1) / 2;
    case "ease_in_quad": return t * t;
    case "ease_out_quad": return 1 - (1 - t) * (1 - t);
    case "ease_in_out_quad": return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "ease_in_cubic": return t ** 3;
    case "ease_out_cubic": return 1 - (1 - t) ** 3;
    case "ease_in_out_cubic": return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    case "ease_in_quart": return t ** 4;
    case "ease_out_quart": return 1 - (1 - t) ** 4;
    case "ease_in_out_quart": return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
    case "ease_in_quint": return t ** 5;
    case "ease_out_quint": return 1 - (1 - t) ** 5;
    case "ease_in_out_quint": return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
    case "ease_in_expo": return t === 0 ? 0 : 2 ** (10 * t - 10);
    case "ease_out_expo": return t === 1 ? 1 : 1 - 2 ** (-10 * t);
    case "ease_in_out_expo": return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
    case "ease_in_circ": return 1 - Math.sqrt(1 - t ** 2);
    case "ease_out_circ": return Math.sqrt(1 - (t - 1) ** 2);
    case "ease_in_out_circ": return t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;
    case "ease_in_back": { const c1 = 1.70158; return (c1 + 1) * t ** 3 - c1 * t ** 2; }
    case "ease_out_back": { const c1 = 1.70158; return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
    case "ease_in_out_back": { const c2 = 1.70158 * 1.525; return t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; }
    default: return t; // elastic/bounce are complex — just show linear for preview
  }
}

export function EasingPicker({
  value,
  onChange,
  label = "Easing",
}: {
  value: string;
  onChange: (easing: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recentEasings = useSettingsStore((s) => s.recentEasings);
  const favoriteEasings = useSettingsStore((s) => s.favoriteEasings);
  const recordEasingUse = useSettingsStore((s) => s.recordEasingUse);
  const toggleFavoriteEasing = useSettingsStore((s) => s.toggleFavoriteEasing);

  const handleSelect = useCallback((easing: string) => {
    onChange(easing);
    recordEasingUse(easing);
    setOpen(false);
  }, [onChange, recordEasingUse]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const displayName = value.replace(/_/g, " ");

  return (
    <div style={{ position: "relative" }}>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 6px", borderRadius: 4,
            border: "1px solid var(--border-color)",
            background: "var(--bg-primary)", color: "var(--text-primary)",
            cursor: "pointer", fontSize: 11, fontFamily: "inherit",
            flex: 1, textAlign: "left",
          }}
        >
          <EasingThumb easing={value} size={16} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 9 }}>▾</span>
        </button>
      </label>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 10001,
            background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
            borderRadius: 8, padding: 8, marginTop: 4,
            width: 260, maxHeight: 350, overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {/* Favorites */}
          {favoriteEasings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                Favorites
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {favoriteEasings.map((e) => (
                  <EasingCell key={e} easing={e} selected={e === value}
                    onSelect={handleSelect} onToggleFav={toggleFavoriteEasing} isFav />
                ))}
              </div>
            </div>
          )}

          {/* Recents */}
          {recentEasings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                Recent
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {recentEasings.slice(0, 5).map((e) => (
                  <EasingCell key={e} easing={e} selected={e === value}
                    onSelect={handleSelect} onToggleFav={toggleFavoriteEasing}
                    isFav={favoriteEasings.includes(e)} />
                ))}
              </div>
            </div>
          )}

          {/* All by family */}
          {EASING_FAMILIES.map((family) => (
            <div key={family.name} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>
                {family.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {family.easings.map((e) => (
                  <EasingCell key={e} easing={e} selected={e === value}
                    onSelect={handleSelect} onToggleFav={toggleFavoriteEasing}
                    isFav={favoriteEasings.includes(e)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EasingCell({
  easing, selected, onSelect, onToggleFav, isFav,
}: {
  easing: string; selected: boolean;
  onSelect: (e: string) => void;
  onToggleFav: (e: string) => void;
  isFav: boolean;
}) {
  const shortName = easing.replace("ease_", "").replace(/_/g, " ");
  return (
    <button
      onClick={() => onSelect(easing)}
      onContextMenu={(e) => { e.preventDefault(); onToggleFav(easing); }}
      title={`${easing.replace(/_/g, " ")}${isFav ? " ★" : ""}\nRight-click to ${isFav ? "remove from" : "add to"} favorites`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
        padding: 3, borderRadius: 4,
        border: selected ? "1px solid var(--accent-primary)" : "1px solid transparent",
        background: selected ? "var(--accent-primary)20" : "transparent",
        cursor: "pointer", width: 56, fontSize: 8,
        color: "var(--text-muted)", fontFamily: "inherit",
      }}
    >
      <EasingThumb easing={easing} size={28} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 52 }}>
        {shortName}
      </span>
    </button>
  );
}

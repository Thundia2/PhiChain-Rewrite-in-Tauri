// ============================================================
// Easing Step — Step 1 of Favorites Wizard
// Grid of all easing types with curve preview thumbnails
// ============================================================

import { useRef, useEffect } from "react";
import { useFavoritesStore } from "../../../stores/favoritesStore";

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

/** Simple easing evaluator for preview thumbnails */
function evalEasing(name: string, t: number): number {
  // Simplified — covers the basic shapes for preview
  const PI = Math.PI;
  switch (name) {
    case "linear": return t;
    case "ease_in_sine": return 1 - Math.cos((t * PI) / 2);
    case "ease_out_sine": return Math.sin((t * PI) / 2);
    case "ease_in_out_sine": return -(Math.cos(PI * t) - 1) / 2;
    case "ease_in_quad": return t * t;
    case "ease_out_quad": return 1 - (1 - t) * (1 - t);
    case "ease_in_out_quad": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "ease_in_cubic": return t * t * t;
    case "ease_out_cubic": return 1 - Math.pow(1 - t, 3);
    case "ease_in_out_cubic": return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "ease_in_quart": return t * t * t * t;
    case "ease_out_quart": return 1 - Math.pow(1 - t, 4);
    case "ease_in_out_quart": return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    case "ease_in_quint": return t * t * t * t * t;
    case "ease_out_quint": return 1 - Math.pow(1 - t, 5);
    case "ease_in_out_quint": return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    case "ease_in_expo": return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    case "ease_out_expo": return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "ease_in_out_expo": return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case "ease_in_circ": return 1 - Math.sqrt(1 - Math.pow(t, 2));
    case "ease_out_circ": return Math.sqrt(1 - Math.pow(t - 1, 2));
    case "ease_in_out_circ": return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    case "ease_in_back": { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; }
    case "ease_out_back": { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    case "ease_in_out_back": { const c = 1.70158 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; }
    case "ease_in_elastic": return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * PI) / 3));
    case "ease_out_elastic": return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1;
    case "ease_in_out_elastic": return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * PI) / 4.5))) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * PI) / 4.5))) / 2 + 1;
    case "ease_in_bounce": return 1 - evalEasing("ease_out_bounce", 1 - t);
    case "ease_out_bounce": {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    case "ease_in_out_bounce": return t < 0.5 ? (1 - evalEasing("ease_out_bounce", 1 - 2 * t)) / 2 : (1 + evalEasing("ease_out_bounce", 2 * t - 1)) / 2;
    default: return t;
  }
}

function EasingThumb({ easing, size = 40, selected }: { easing: string; size?: number; selected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const pad = 4;

    ctx.clearRect(0, 0, W, H);

    // Diagonal guide
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(pad, H - pad);
    ctx.lineTo(W - pad, pad);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    ctx.strokeStyle = selected ? "#6c8aff" : "#888";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= W - 2 * pad; i++) {
      const t = i / (W - 2 * pad);
      const v = evalEasing(easing, t);
      const x = pad + i;
      const y = H - pad - v * (H - 2 * pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [easing, size, selected]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} />;
}

function formatEasingName(name: string): string {
  return name
    .replace("ease_", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EasingStepGrid() {
  const favoriteEasings = useFavoritesStore((s) => s.favoriteEasings);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavoriteEasing);

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
        Select your favorite easings. They'll appear at the top of easing pickers for quick access.
      </div>

      {EASING_FAMILIES.map((family) => (
        <div key={family.name} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              padding: "4px 0",
            }}
          >
            {family.name}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {family.easings.map((easing) => {
              const selected = favoriteEasings.includes(easing);
              return (
                <button
                  key={easing}
                  onClick={() => toggleFavorite(easing)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    padding: 4,
                    borderRadius: 6,
                    border: selected
                      ? "1px solid var(--accent-primary)"
                      : "1px solid var(--border-color)",
                    background: selected
                      ? "rgba(108,138,255,0.08)"
                      : "var(--bg-primary)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  <EasingThumb easing={easing} size={40} selected={selected} />
                  <span
                    style={{
                      fontSize: 8,
                      color: selected ? "var(--accent-primary)" : "var(--text-muted)",
                      whiteSpace: "nowrap",
                      maxWidth: 52,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {formatEasingName(easing)}
                  </span>
                  {selected && (
                    <span style={{ fontSize: 10, color: "var(--accent-primary)" }}>★</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

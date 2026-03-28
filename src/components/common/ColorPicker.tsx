// ============================================================
// Color Picker — HSL wheel + RGB sliders + hex input + swatches
//
// Reusable popup for color events and note tint properties.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { ActionButton } from "./UIKit";

interface ColorPickerProps {
  value: [number, number, number];
  onChange: (rgb: [number, number, number]) => void;
  onClose: () => void;
}

const DEFAULT_SWATCHES: [number, number, number][] = [
  [255, 255, 255],
  [255, 0, 0],
  [0, 100, 255],
  [0, 255, 0],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
  [255, 150, 0],
  [0, 0, 0],
];

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  const [r, g, b] = value;
  const [hexInput, setHexInput] = useState(rgbToHex(r, g, b));
  const [hsl, setHsl] = useState(() => rgbToHsl(r, g, b));
  const wheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const slCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sync hex input when value changes externally
  useEffect(() => {
    setHexInput(rgbToHex(value[0], value[1], value[2]));
    setHsl(rgbToHsl(value[0], value[1], value[2]));
  }, [value]);

  // Draw hue ring
  useEffect(() => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 180;
    const cx = size / 2, cy = size / 2;
    const outerR = size / 2 - 2, innerR = outerR - 18;

    ctx.clearRect(0, 0, size, size);
    for (let deg = 0; deg < 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      const rad2 = ((deg + 2) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, rad, rad2);
      ctx.arc(cx, cy, innerR, rad2, rad, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.fill();
    }

    // Hue indicator
    const hueRad = ((hsl[0] - 90) * Math.PI) / 180;
    const indicR = (outerR + innerR) / 2;
    const ix = cx + Math.cos(hueRad) * indicR;
    const iy = cy + Math.sin(hueRad) * indicR;
    ctx.beginPath();
    ctx.arc(ix, iy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [hsl[0]]);

  // Draw saturation/lightness square
  useEffect(() => {
    const canvas = slCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 120;
    const imgData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = x / (size - 1);
        const l = 1 - y / (size - 1);
        const [cr, cg, cb] = hslToRgb(hsl[0], s, l);
        const idx = (y * size + x) * 4;
        imgData.data[idx] = cr;
        imgData.data[idx + 1] = cg;
        imgData.data[idx + 2] = cb;
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Indicator
    const ix = hsl[1] * (size - 1);
    const iy = (1 - hsl[2]) * (size - 1);
    ctx.beginPath();
    ctx.arc(ix, iy, 5, 0, Math.PI * 2);
    ctx.strokeStyle = hsl[2] > 0.5 ? "#000" : "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [hsl]);

  const handleWheelClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - 90;
    const y = e.clientY - rect.top - 90;
    const dist = Math.hypot(x, y);
    if (dist < 55 || dist > 88) return; // not on the ring

    let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;

    const newHsl: [number, number, number] = [angle, hsl[1], hsl[2]];
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl[0], newHsl[1], newHsl[2]);
    onChange(newRgb);
  }, [hsl, onChange]);

  const handleSLClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = slCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(119, e.clientX - rect.left));
    const y = Math.max(0, Math.min(119, e.clientY - rect.top));
    const s = x / 119;
    const l = 1 - y / 119;

    const newHsl: [number, number, number] = [hsl[0], s, l];
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl[0], newHsl[1], newHsl[2]);
    onChange(newRgb);
  }, [hsl, onChange]);

  const handleRGBChange = (channel: 0 | 1 | 2, val: number) => {
    const newRgb: [number, number, number] = [...value];
    newRgb[channel] = Math.max(0, Math.min(255, val));
    onChange(newRgb);
  };

  const handleHexSubmit = () => {
    const rgb = hexToRgb(hexInput);
    if (rgb) onChange(rgb);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 16,
          width: 280,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hue wheel + SL square */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <canvas
            ref={wheelCanvasRef}
            width={180}
            height={180}
            style={{ width: 180, height: 180, cursor: "crosshair" }}
            onClick={handleWheelClick}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <canvas
              ref={slCanvasRef}
              width={120}
              height={120}
              style={{ width: 80, height: 80, borderRadius: 4, cursor: "crosshair" }}
              onClick={handleSLClick}
            />
            {/* Preview swatch */}
            <div style={{
              width: 80, height: 32, borderRadius: 6,
              backgroundColor: `rgb(${r}, ${g}, ${b})`,
              border: "1px solid var(--border-color)",
            }} />
          </div>
        </div>

        {/* RGB sliders */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {(["R", "G", "B"] as const).map((ch, i) => (
            <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", width: 12, fontWeight: 600 }}>{ch}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={value[i]}
                onChange={(e) => handleRGBChange(i as 0 | 1 | 2, parseInt(e.target.value))}
                style={{ flex: 1, accentColor: ch === "R" ? "#ff6b6b" : ch === "G" ? "#51cf66" : "#4dabf7" }}
              />
              <input
                type="number"
                min={0}
                max={255}
                value={value[i]}
                onChange={(e) => handleRGBChange(i as 0 | 1 | 2, parseInt(e.target.value) || 0)}
                style={{
                  width: 42,
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 4,
                  fontSize: 10,
                  padding: "2px 4px",
                  textAlign: "center",
                }}
              />
            </div>
          ))}
        </div>

        {/* Hex input */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Hex</span>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={handleHexSubmit}
            onKeyDown={(e) => { if (e.key === "Enter") handleHexSubmit(); }}
            style={{
              flex: 1,
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              fontSize: 11,
              padding: "3px 6px",
              fontFamily: "monospace",
            }}
          />
        </div>

        {/* Swatches */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>Swatches</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DEFAULT_SWATCHES.map((swatch, i) => (
              <div
                key={i}
                onClick={() => onChange(swatch)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  backgroundColor: `rgb(${swatch[0]}, ${swatch[1]}, ${swatch[2]})`,
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
    </div>
  );
}

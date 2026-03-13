// ============================================================
// Effects Editor — Manages prpr/Phira shader effects and video backgrounds
//
// Provides UI for:
//   - Adding/removing shader effects with built-in shader selector
//   - Editing effect start/end beats and uniform variables
//   - Adding/removing video backgrounds
//   - Importing/exporting extra.json
// ============================================================

import { useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import type { ShaderEffect, VideoBackground, ExtraConfig } from "../../types/extra";
import type { Beat } from "../../types/chart";
import { beatToFloat, floatToBeat } from "../../types/chart";
import { SHADER_DEFAULTS } from "../../canvas/shaders";

const BUILTIN_SHADERS = [
  "chromatic", "circleBlur", "fisheye", "glitch", "grayscale",
  "noise", "pixel", "radialBlur", "shockwave", "vignette",
];

export function EffectsEditor() {
  const extraConfig = useChartStore((s) => s.extraConfig);
  const setExtraConfig = useChartStore((s) => s.setExtraConfig);
  const [activeTab, setActiveTab] = useState<"effects" | "videos">("effects");

  const effects = extraConfig.effects ?? [];
  const videos = extraConfig.videos ?? [];

  const updateConfig = (changes: Partial<ExtraConfig>) => {
    setExtraConfig({ ...extraConfig, ...changes });
  };

  // ---- Effect management ----
  const addEffect = () => {
    const newEffect: ShaderEffect = {
      start: [0, 0, 1],
      end: [4, 0, 1],
      shader: "chromatic",
      global: false,
      vars: {},
    };
    updateConfig({ effects: [...effects, newEffect] });
  };

  const removeEffect = (index: number) => {
    updateConfig({ effects: effects.filter((_, i) => i !== index) });
  };

  const updateEffect = (index: number, changes: Partial<ShaderEffect>) => {
    const updated = effects.map((e, i) => i === index ? { ...e, ...changes } : e);
    updateConfig({ effects: updated });
  };

  // ---- Video management ----
  const addVideo = () => {
    const newVideo: VideoBackground = {
      path: "bga.mp4",
      time: [0, 0, 1],
      scale: "cropCenter",
      alpha: 1.0,
      dim: 0.3,
    };
    updateConfig({ videos: [...videos, newVideo] });
  };

  const removeVideo = (index: number) => {
    updateConfig({ videos: videos.filter((_, i) => i !== index) });
  };

  const updateVideo = (index: number, changes: Partial<VideoBackground>) => {
    const updated = videos.map((v, i) => i === index ? { ...v, ...changes } : v);
    updateConfig({ videos: updated });
  };

  return (
    <div className="h-full overflow-y-auto" style={{ padding: "8px", fontSize: "12px" }}>
      {/* Tab selector */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <button
          onClick={() => setActiveTab("effects")}
          style={{
            padding: "4px 12px",
            fontSize: "11px",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: activeTab === "effects" ? "var(--accent)" : "var(--bg-secondary)",
            color: activeTab === "effects" ? "#fff" : "var(--text)",
            cursor: "pointer",
          }}
        >
          Shader Effects ({effects.length})
        </button>
        <button
          onClick={() => setActiveTab("videos")}
          style={{
            padding: "4px 12px",
            fontSize: "11px",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: activeTab === "videos" ? "var(--accent)" : "var(--bg-secondary)",
            color: activeTab === "videos" ? "#fff" : "var(--text)",
            cursor: "pointer",
          }}
        >
          Video Backgrounds ({videos.length})
        </button>
      </div>

      {activeTab === "effects" && (
        <div>
          <button
            onClick={addEffect}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              marginBottom: "8px",
            }}
          >
            + Add Shader Effect
          </button>

          {effects.map((effect, i) => (
            <EffectCard
              key={i}
              effect={effect}
              index={i}
              onUpdate={(changes) => updateEffect(i, changes)}
              onRemove={() => removeEffect(i)}
            />
          ))}

          {effects.length === 0 && (
            <div style={{ color: "var(--text-muted)", padding: "16px 0", textAlign: "center" }}>
              No shader effects. Click "+ Add Shader Effect" to create one.
            </div>
          )}
        </div>
      )}

      {activeTab === "videos" && (
        <div>
          <button
            onClick={addVideo}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              marginBottom: "8px",
            }}
          >
            + Add Video Background
          </button>

          {videos.map((video, i) => (
            <VideoCard
              key={i}
              video={video}
              index={i}
              onUpdate={(changes) => updateVideo(i, changes)}
              onRemove={() => removeVideo(i)}
            />
          ))}

          {videos.length === 0 && (
            <div style={{ color: "var(--text-muted)", padding: "16px 0", textAlign: "center" }}>
              No video backgrounds. Click "+ Add Video Background" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Effect Card ----

function EffectCard({
  effect,
  index,
  onUpdate,
  onRemove,
}: {
  effect: ShaderEffect;
  index: number;
  onUpdate: (changes: Partial<ShaderEffect>) => void;
  onRemove: () => void;
}) {
  const defaults = SHADER_DEFAULTS[effect.shader] ?? {};
  const varNames = Object.keys(defaults);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "8px",
        marginBottom: "6px",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontWeight: "bold", fontSize: "11px" }}>Effect #{index + 1}</span>
        <button
          onClick={onRemove}
          style={{
            padding: "2px 6px",
            fontSize: "10px",
            background: "#e74c3c",
            color: "#fff",
            border: "none",
            borderRadius: "2px",
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </div>

      {/* Shader selector */}
      <div style={{ marginBottom: "4px" }}>
        <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Shader</label>
        <select
          value={effect.shader}
          onChange={(e) => onUpdate({ shader: e.target.value, vars: {} })}
          style={{
            display: "block",
            width: "100%",
            padding: "2px 4px",
            fontSize: "11px",
            background: "var(--bg-primary)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "2px",
          }}
        >
          {BUILTIN_SHADERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Start/End beats */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
        <BeatInput label="Start" value={effect.start} onChange={(v) => onUpdate({ start: v })} />
        <BeatInput label="End" value={effect.end} onChange={(v) => onUpdate({ end: v })} />
      </div>

      {/* Global toggle */}
      <div style={{ marginBottom: "4px" }}>
        <label style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            type="checkbox"
            checked={effect.global ?? false}
            onChange={(e) => onUpdate({ global: e.target.checked })}
          />
          Global (affects UI elements)
        </label>
      </div>

      {/* Shader variables */}
      {varNames.length > 0 && (
        <div style={{ marginTop: "4px" }}>
          <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Variables</label>
          {varNames.map((name) => {
            const defaultVal = defaults[name];
            const currentVal = effect.vars?.[name];
            const numVal = typeof currentVal === "number" ? currentVal :
                           typeof defaultVal === "number" ? defaultVal :
                           Array.isArray(defaultVal) ? 0 : 0;

            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", minWidth: "80px" }}>{name}</span>
                <input
                  type="number"
                  step="0.01"
                  value={numVal}
                  onChange={(e) => {
                    const newVars = { ...(effect.vars ?? {}), [name]: parseFloat(e.target.value) || 0 };
                    onUpdate({ vars: newVars });
                  }}
                  style={{
                    flex: 1,
                    padding: "1px 4px",
                    fontSize: "11px",
                    background: "var(--bg-primary)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "2px",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Video Card ----

function VideoCard({
  video,
  index,
  onUpdate,
  onRemove,
}: {
  video: VideoBackground;
  index: number;
  onUpdate: (changes: Partial<VideoBackground>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "8px",
        marginBottom: "6px",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontWeight: "bold", fontSize: "11px" }}>Video #{index + 1}</span>
        <button
          onClick={onRemove}
          style={{
            padding: "2px 6px",
            fontSize: "10px",
            background: "#e74c3c",
            color: "#fff",
            border: "none",
            borderRadius: "2px",
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </div>

      <div style={{ marginBottom: "4px" }}>
        <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Path</label>
        <input
          type="text"
          value={video.path}
          onChange={(e) => onUpdate({ path: e.target.value })}
          style={{
            display: "block",
            width: "100%",
            padding: "2px 4px",
            fontSize: "11px",
            background: "var(--bg-primary)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "2px",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
        <BeatInput label="Time" value={video.time ?? [0, 0, 1]} onChange={(v) => onUpdate({ time: v })} />
        <div style={{ flex: 1 }}>
          <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Scale</label>
          <select
            value={video.scale ?? "cropCenter"}
            onChange={(e) => onUpdate({ scale: e.target.value as VideoBackground["scale"] })}
            style={{
              display: "block",
              width: "100%",
              padding: "2px 4px",
              fontSize: "11px",
              background: "var(--bg-primary)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "2px",
            }}
          >
            <option value="cropCenter">cropCenter</option>
            <option value="inside">inside</option>
            <option value="fit">fit</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Alpha</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={typeof video.alpha === "number" ? video.alpha : 1}
            onChange={(e) => onUpdate({ alpha: parseFloat(e.target.value) || 0 })}
            style={{
              display: "block",
              width: "100%",
              padding: "2px 4px",
              fontSize: "11px",
              background: "var(--bg-primary)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "2px",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>Dim</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={typeof video.dim === "number" ? video.dim : 0}
            onChange={(e) => onUpdate({ dim: parseFloat(e.target.value) || 0 })}
            style={{
              display: "block",
              width: "100%",
              padding: "2px 4px",
              fontSize: "11px",
              background: "var(--bg-primary)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "2px",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---- Beat Input ----

function BeatInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Beat;
  onChange: (beat: Beat) => void;
}) {
  const beatFloat = beatToFloat(value);

  return (
    <div style={{ flex: 1 }}>
      <label style={{ color: "var(--text-muted)", fontSize: "10px" }}>{label}</label>
      <input
        type="number"
        step="0.25"
        value={beatFloat}
        onChange={(e) => onChange(floatToBeat(parseFloat(e.target.value) || 0))}
        style={{
          display: "block",
          width: "100%",
          padding: "2px 4px",
          fontSize: "11px",
          background: "var(--bg-primary)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "2px",
        }}
      />
    </div>
  );
}

// ============================================================
// Shader Variable Animation Editor
//
// For each shader uniform variable, shows:
//   - Toggle between "constant" and "animated" mode
//   - Constant mode: simple number input
//   - Animated mode: mini keyframe strip with add/edit/remove
//     - Animation events: { startTime, endTime, start, end, easingType }
//     - Click to add keyframe at current beat
//     - Inline editing of keyframe values
//     - Easing picker per keyframe segment
// ============================================================

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAudioStore } from "../../stores/audioStore";
import { useChartStore } from "../../stores/chartStore";
import type { AnimationEvent, AnimatedVariable } from "../../types/extra";
import type { Beat } from "../../types/chart";
import { beatToFloat, floatToBeat } from "../../types/chart";
import { SHADER_DEFAULTS } from "../../canvas/shaders";
import { BpmList } from "../../utils/bpmList";
import { safeParseNumber } from "../common/FormFields";
import { ActionButton, INPUT_STYLE, SELECT_STYLE } from "../common/UIKit";
import { RPE_EASING_MAP } from "../../utils/rpeImport";

// ---- Types ----

interface ShaderVarAnimEditorProps {
  /** Shader name (e.g. "chromatic", "glitch") */
  shaderName: string;
  /** Current vars record from the ShaderEffect */
  vars: Record<string, AnimatedVariable> | undefined;
  /** Callback to update the entire vars object */
  onUpdateVars: (vars: Record<string, AnimatedVariable>) => void;
}

// ============================================================
// Main Component
// ============================================================

export function ShaderVarAnimEditor({
  shaderName,
  vars,
  onUpdateVars,
}: ShaderVarAnimEditorProps) {
  const defaults = SHADER_DEFAULTS[shaderName] ?? {};
  const varNames = Object.keys(defaults);
  const currentVars = vars ?? {};

  if (varNames.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 10, padding: "4px 0" }}>
        No configurable variables for this shader.
      </div>
    );
  }

  const updateVar = (name: string, value: AnimatedVariable) => {
    onUpdateVars({ ...currentVars, [name]: value });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        marginBottom: 2,
      }}>
        Variables
      </div>
      {varNames.map((name) => {
        const defaultVal = defaults[name];
        // Skip vec4/array defaults (like vignette.color) -- constant only
        if (Array.isArray(defaultVal)) return null;
        const currentVal = currentVars[name];

        return (
          <VarRow
            key={name}
            name={name}
            defaultValue={typeof defaultVal === "number" ? defaultVal : 0}
            value={currentVal}
            onChange={(v) => updateVar(name, v)}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Single Variable Row
// ============================================================

function VarRow({
  name,
  defaultValue,
  value,
  onChange,
}: {
  name: string;
  defaultValue: number;
  value: AnimatedVariable | undefined;
  onChange: (v: AnimatedVariable) => void;
}) {
  const isAnimated = Array.isArray(value);
  const constantValue = typeof value === "number" ? value : defaultValue;
  const events: AnimationEvent[] = isAnimated ? value : [];

  const [expanded, setExpanded] = useState(false);

  const toggleAnimated = () => {
    if (isAnimated) {
      // Switch to constant: use the start value of the first event, or default
      const firstStart = events.length > 0 && typeof events[0].start === "number"
        ? events[0].start as number
        : defaultValue;
      onChange(firstStart);
    } else {
      // Switch to animated: create one event spanning beats 0-4 with the constant value
      const ev: AnimationEvent = {
        startTime: [0, 0, 1],
        endTime: [4, 0, 1],
        easingType: 1,
        start: constantValue,
        end: constantValue,
      };
      onChange([ev]);
    }
  };

  return (
    <div style={{
      backgroundColor: "rgba(255,255,255,0.02)",
      borderRadius: 6,
      border: "1px solid rgba(255,255,255,0.05)",
      overflow: "hidden",
      marginBottom: 1,
    }}>
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 6px",
        minHeight: 26,
      }}>
        {/* Variable name */}
        <span style={{
          fontSize: 10,
          color: "var(--text-muted)",
          minWidth: 70,
          fontFamily: "monospace",
        }}>
          {name}
        </span>

        {/* Animated toggle */}
        <button
          onClick={toggleAnimated}
          title={isAnimated ? "Switch to constant" : "Switch to animated"}
          style={{
            fontSize: 8,
            padding: "1px 5px",
            borderRadius: 3,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            backgroundColor: isAnimated ? "var(--accent-primary)" : "var(--bg-active)",
            color: isAnimated ? "#fff" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
        >
          {isAnimated ? "ANIM" : "CONST"}
        </button>

        {/* Constant value input */}
        {!isAnimated && (
          <input
            type="number"
            step="0.01"
            value={constantValue}
            onChange={(e) => {
              const n = safeParseNumber(e.target.value);
              if (n !== null) onChange(n);
            }}
            style={{
              ...INPUT_STYLE,
              flex: 1,
              maxWidth: 80,
            }}
          />
        )}

        {/* Animated: show event count and expand toggle */}
        {isAnimated && (
          <>
            <span style={{ fontSize: 9, color: "var(--text-muted)", flex: 1 }}>
              {events.length} keyframe{events.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                fontSize: 8,
                padding: "1px 4px",
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                backgroundColor: "var(--bg-active)",
                color: "var(--text-muted)",
                fontFamily: "inherit",
              }}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </>
        )}
      </div>

      {/* Animated: mini keyframe strip */}
      {isAnimated && (
        <MiniKeyframeStrip
          events={events}
          onChange={(newEvents) => onChange(newEvents)}
        />
      )}

      {/* Expanded: full keyframe editor */}
      {isAnimated && expanded && (
        <KeyframeEditor
          events={events}
          onChange={(newEvents) => onChange(newEvents)}
        />
      )}
    </div>
  );
}

// ============================================================
// Mini Keyframe Strip (canvas-based)
// ============================================================

const STRIP_HEIGHT = 20;

function MiniKeyframeStrip({
  events,
  onChange,
}: {
  events: AnimationEvent[];
  onChange: (events: AnimationEvent[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTime = useAudioStore((s) => s.currentTime);
  const bpmListRaw = useChartStore((s) => s.chart.bpm_list);

  const bpmCalc = useMemo(() => new BpmList(bpmListRaw), [bpmListRaw]);
  const currentBeat = bpmCalc.beatAtFloat(currentTime);

  // Compute beat range from events
  const { minBeat, maxBeat } = useMemo(() => {
    if (events.length === 0) return { minBeat: 0, maxBeat: 4 };
    let mn = Infinity, mx = -Infinity;
    for (const ev of events) {
      const s = beatToFloat(ev.startTime);
      const e = beatToFloat(ev.endTime);
      if (s < mn) mn = s;
      if (e > mx) mx = e;
    }
    // Add padding
    return { minBeat: Math.max(0, mn - 1), maxBeat: mx + 1 };
  }, [events]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = STRIP_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const beatRange = maxBeat - minBeat;
    if (beatRange <= 0) return;
    const pxPerBeat = w / beatRange;

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, w, h);

    // Value range for vertical positioning
    let valMin = Infinity, valMax = -Infinity;
    for (const ev of events) {
      const s = typeof ev.start === "number" ? ev.start : 0;
      const e = typeof ev.end === "number" ? ev.end : 0;
      if (s < valMin) valMin = s;
      if (s > valMax) valMax = s;
      if (e < valMin) valMin = e;
      if (e > valMax) valMax = e;
    }
    if (valMin === valMax) { valMin -= 1; valMax += 1; }
    const valRange = valMax - valMin;

    // Draw event segments
    for (const ev of events) {
      const sx = (beatToFloat(ev.startTime) - minBeat) * pxPerBeat;
      const ex = (beatToFloat(ev.endTime) - minBeat) * pxPerBeat;
      const sv = typeof ev.start === "number" ? ev.start : 0;
      const evVal = typeof ev.end === "number" ? ev.end : 0;
      const sy = h - ((sv - valMin) / valRange) * (h - 4) - 2;
      const ey = h - ((evVal - valMin) / valRange) * (h - 4) - 2;

      // Line segment
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--accent-primary").trim() || "#6c8aff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Start dot
      ctx.fillStyle = "#61afef";
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // End dot
      ctx.fillStyle = "#98c379";
      ctx.beginPath();
      ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Playhead
    const phX = (currentBeat - minBeat) * pxPerBeat;
    if (phX >= 0 && phX <= w) {
      ctx.strokeStyle = "rgba(224, 108, 117, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();
    }
  }, [events, currentBeat, minBeat, maxBeat]);

  // Click to add keyframe at current beat position
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const w = canvas.clientWidth;
      const beatRange = maxBeat - minBeat;
      if (beatRange <= 0) return;

      const clickBeat = minBeat + (mx / w) * beatRange;

      // Check if we're clicking near an existing keyframe -- if so, don't add
      for (const ev of events) {
        const sb = beatToFloat(ev.startTime);
        const eb = beatToFloat(ev.endTime);
        if (Math.abs(clickBeat - sb) < beatRange * 0.02 ||
            Math.abs(clickBeat - eb) < beatRange * 0.02) {
          return;
        }
      }

      // Find the value at this beat by interpolating the closest event
      let insertValue = 0;
      for (const ev of events) {
        const sb = beatToFloat(ev.startTime);
        const eb = beatToFloat(ev.endTime);
        if (clickBeat >= sb && clickBeat <= eb) {
          const t = (eb - sb) > 0 ? (clickBeat - sb) / (eb - sb) : 0;
          const sv = typeof ev.start === "number" ? ev.start : 0;
          const evEnd = typeof ev.end === "number" ? ev.end : 0;
          insertValue = sv + (evEnd - sv) * t;
          break;
        }
        if (typeof ev.end === "number" && clickBeat > eb) {
          insertValue = ev.end;
        }
      }

      // Create a new point: a short event at this beat
      const beatTuple = floatToBeat(Math.max(0, clickBeat));
      const endBeatTuple = floatToBeat(Math.max(0, clickBeat + 1));

      const newEvent: AnimationEvent = {
        startTime: beatTuple,
        endTime: endBeatTuple,
        easingType: 1,
        start: Math.round(insertValue * 100) / 100,
        end: Math.round(insertValue * 100) / 100,
      };

      // Insert sorted by startTime
      const updated = [...events, newEvent].sort(
        (a, b) => beatToFloat(a.startTime) - beatToFloat(b.startTime),
      );
      onChange(updated);
    },
    [events, onChange, minBeat, maxBeat],
  );

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      title="Click to add keyframe"
      style={{
        display: "block",
        width: "100%",
        height: STRIP_HEIGHT,
        cursor: "crosshair",
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    />
  );
}

// ============================================================
// Full Keyframe Editor (expanded view)
// ============================================================

function KeyframeEditor({
  events,
  onChange,
}: {
  events: AnimationEvent[];
  onChange: (events: AnimationEvent[]) => void;
}) {
  const currentTime = useAudioStore((s) => s.currentTime);
  const bpmListRaw = useChartStore((s) => s.chart.bpm_list);
  const bpmCalc = useMemo(() => new BpmList(bpmListRaw), [bpmListRaw]);
  const currentBeat = bpmCalc.beatAtFloat(currentTime);

  const addAtCurrentBeat = useCallback(() => {
    // Find what value to use at the current beat
    let val = 0;
    for (const ev of events) {
      const sb = beatToFloat(ev.startTime);
      const eb = beatToFloat(ev.endTime);
      if (currentBeat >= sb && currentBeat <= eb && typeof ev.start === "number" && typeof ev.end === "number") {
        const t = (eb - sb) > 0 ? (currentBeat - sb) / (eb - sb) : 0;
        val = ev.start + (ev.end - ev.start) * t;
        break;
      }
      if (typeof ev.end === "number" && currentBeat > eb) {
        val = ev.end;
      }
    }

    const beatTuple: Beat = floatToBeat(Math.max(0, currentBeat));
    const endBeatTuple: Beat = floatToBeat(Math.max(0, currentBeat + 1));

    const newEvent: AnimationEvent = {
      startTime: beatTuple,
      endTime: endBeatTuple,
      easingType: 1,
      start: Math.round(val * 100) / 100,
      end: Math.round(val * 100) / 100,
    };

    const updated = [...events, newEvent].sort(
      (a, b) => beatToFloat(a.startTime) - beatToFloat(b.startTime),
    );
    onChange(updated);
  }, [events, onChange, currentBeat]);

  const removeEvent = useCallback(
    (index: number) => {
      onChange(events.filter((_, i) => i !== index));
    },
    [events, onChange],
  );

  const updateEvent = useCallback(
    (index: number, changes: Partial<AnimationEvent>) => {
      const updated = events.map((ev, i) =>
        i === index ? { ...ev, ...changes } : ev,
      );
      onChange(updated.sort(
        (a, b) => beatToFloat(a.startTime) - beatToFloat(b.startTime),
      ));
    },
    [events, onChange],
  );

  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.04)",
      padding: "4px 6px",
      maxHeight: 200,
      overflowY: "auto",
    }}>
      {/* Add button */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <ActionButton variant="primary" onClick={addAtCurrentBeat}>
          + Add at beat {currentBeat.toFixed(2)}
        </ActionButton>
        <span style={{ fontSize: 8, color: "var(--text-muted)", alignSelf: "center" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Event list */}
      {events.map((ev, i) => (
        <KeyframeEventRow
          key={i}
          event={ev}
          index={i}
          onUpdate={(changes) => updateEvent(i, changes)}
          onRemove={() => removeEvent(i)}
        />
      ))}

      {events.length === 0 && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center", padding: 4 }}>
          No keyframes. Click "+ Add" to create one.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Single Keyframe Event Row
// ============================================================

function KeyframeEventRow({
  event,
  index,
  onUpdate,
  onRemove,
}: {
  event: AnimationEvent;
  index: number;
  onUpdate: (changes: Partial<AnimationEvent>) => void;
  onRemove: () => void;
}) {
  const startBeat = beatToFloat(event.startTime);
  const endBeat = beatToFloat(event.endTime);
  const startVal = typeof event.start === "number" ? event.start : 0;
  const endVal = typeof event.end === "number" ? event.end : 0;
  const easingNum = event.easingType ?? 1;
  const easingName = rpeEasingToName(easingNum);

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 3,
      padding: "2px 0",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      fontSize: 9,
    }}>
      {/* Index badge */}
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        color: "var(--text-muted)",
        minWidth: 14,
        textAlign: "center",
      }}>
        #{index + 1}
      </span>

      {/* Start beat */}
      <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 8 }}>B:</span>
        <input
          type="number"
          step="0.25"
          value={startBeat}
          onChange={(e) => {
            const n = safeParseNumber(e.target.value);
            if (n !== null) onUpdate({ startTime: floatToBeat(Math.max(0, n)) });
          }}
          style={{ ...INPUT_STYLE, width: 45 }}
        />
      </label>

      {/* End beat */}
      <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 8 }}>-</span>
        <input
          type="number"
          step="0.25"
          value={endBeat}
          onChange={(e) => {
            const n = safeParseNumber(e.target.value);
            if (n !== null) onUpdate({ endTime: floatToBeat(Math.max(0, n)) });
          }}
          style={{ ...INPUT_STYLE, width: 45 }}
        />
      </label>

      {/* Start value */}
      <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ color: "#61afef", fontSize: 8 }}>S:</span>
        <input
          type="number"
          step="0.01"
          value={startVal}
          onChange={(e) => {
            const n = safeParseNumber(e.target.value);
            if (n !== null) onUpdate({ start: n });
          }}
          style={{ ...INPUT_STYLE, width: 50 }}
        />
      </label>

      {/* End value */}
      <label style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ color: "#98c379", fontSize: 8 }}>E:</span>
        <input
          type="number"
          step="0.01"
          value={endVal}
          onChange={(e) => {
            const n = safeParseNumber(e.target.value);
            if (n !== null) onUpdate({ end: n });
          }}
          style={{ ...INPUT_STYLE, width: 50 }}
        />
      </label>

      {/* Easing */}
      <select
        value={easingNum}
        onChange={(e) => {
          const num = parseInt(e.target.value);
          if (!isNaN(num)) onUpdate({ easingType: num });
        }}
        style={{ ...SELECT_STYLE, width: 80, fontSize: 8 }}
        title={`Easing: ${easingName}`}
      >
        {RPE_EASING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Remove button */}
      <button
        onClick={onRemove}
        title="Remove keyframe"
        style={{
          fontSize: 9,
          padding: "1px 4px",
          borderRadius: 3,
          border: "none",
          cursor: "pointer",
          backgroundColor: "rgba(224,108,117,0.2)",
          color: "#e06c75",
          fontFamily: "inherit",
          fontWeight: 600,
          marginLeft: "auto",
        }}
      >
        X
      </button>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

/** RPE easing type number to human-readable name */
function rpeEasingToName(num: number): string {
  const easing = RPE_EASING_MAP[num];
  if (!easing) return `RPE #${num}`;
  if (typeof easing === "string") return easing.replace(/_/g, " ");
  return `RPE #${num}`;
}

/** Dropdown options for RPE easing types */
const RPE_EASING_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Linear" },
  { value: 2, label: "Ease out sine" },
  { value: 3, label: "Ease in sine" },
  { value: 4, label: "Ease out quad" },
  { value: 5, label: "Ease in quad" },
  { value: 6, label: "Ease in/out sine" },
  { value: 7, label: "Ease in/out quad" },
  { value: 8, label: "Ease out cubic" },
  { value: 9, label: "Ease in cubic" },
  { value: 10, label: "Ease out quart" },
  { value: 11, label: "Ease in quart" },
  { value: 12, label: "Ease in/out cubic" },
  { value: 13, label: "Ease in/out quart" },
  { value: 14, label: "Ease out quint" },
  { value: 15, label: "Ease in quint" },
  { value: 16, label: "Ease out expo" },
  { value: 17, label: "Ease in expo" },
  { value: 18, label: "Ease out circ" },
  { value: 19, label: "Ease in circ" },
  { value: 20, label: "Ease out back" },
  { value: 21, label: "Ease in back" },
  { value: 22, label: "Ease in/out circ" },
  { value: 23, label: "Ease in/out back" },
  { value: 24, label: "Ease out elastic" },
  { value: 25, label: "Ease in elastic" },
  { value: 26, label: "Ease out bounce" },
  { value: 27, label: "Ease in bounce" },
  { value: 28, label: "Ease in/out elastic" },
  { value: 29, label: "Ease in/out bounce" },
];

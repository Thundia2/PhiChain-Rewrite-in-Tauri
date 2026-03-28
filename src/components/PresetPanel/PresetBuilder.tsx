// ============================================================
// Compound Preset Builder
//
// A dialog for creating custom multi-channel event presets.
// Users can select channels, add keyframes on a visual strip,
// set values and easings, then save to customPresets.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { EventPreset, EventTemplate } from "../../types/preset";
import type { LineEventKind, EasingType } from "../../types/chart";
import { floatToBeat } from "../../types/chart";
import { EASING_OPTIONS } from "../common/FormFields";

// ============================================================
// Types
// ============================================================

interface Keyframe {
  /** Unique id within the channel */
  id: string;
  /** Beat offset from the preset start */
  beatOffset: number;
  /** Value at this keyframe */
  value: number;
  /** Whether to use $CURRENT instead of a fixed value */
  useCurrent: boolean;
  /** Easing to the next keyframe */
  easing: EasingType;
}

interface ChannelState {
  kind: LineEventKind;
  enabled: boolean;
  keyframes: Keyframe[];
}

const ALL_CHANNELS: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];

const CHANNEL_LABELS: Record<LineEventKind, string> = {
  x: "X Position",
  y: "Y Position",
  rotation: "Rotation",
  opacity: "Opacity",
  speed: "Speed",
};

const CHANNEL_DEFAULTS: Record<LineEventKind, number> = {
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 255,
  speed: 1,
};

const CHANNEL_COLORS: Record<LineEventKind, string> = {
  x: "#4fc3f7",
  y: "#81c784",
  rotation: "#ffb74d",
  opacity: "#ce93d8",
  speed: "#ef5350",
};

function generateKeyframeId(): string {
  return `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================
// Keyframe Strip: visual representation of keyframes on a channel
// ============================================================

function KeyframeStrip({
  channel,
  totalBeats,
  onAddKeyframe,
  onSelectKeyframe,
  selectedKeyframeId,
}: {
  channel: ChannelState;
  totalBeats: number;
  onAddKeyframe: (kind: LineEventKind, beatOffset: number) => void;
  onSelectKeyframe: (kind: LineEventKind, id: string | null) => void;
  selectedKeyframeId: string | null;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  const handleStripClick = (e: React.MouseEvent) => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const beatOffset = (x / rect.width) * totalBeats;
    // Only add if not clicking on an existing keyframe
    if ((e.target as HTMLElement).dataset.keyframe) return;
    onAddKeyframe(channel.kind, Math.max(0, beatOffset));
  };

  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-2 mb-1"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: CHANNEL_COLORS[channel.kind] }}
        />
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {CHANNEL_LABELS[channel.kind]}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          ({channel.keyframes.length} keyframes)
        </span>
      </div>
      <div
        ref={stripRef}
        className="relative h-6 rounded cursor-crosshair"
        style={{
          backgroundColor: "var(--bg-active)",
          border: "1px solid var(--border-primary)",
        }}
        onClick={handleStripClick}
      >
        {/* Beat grid lines */}
        {Array.from({ length: Math.ceil(totalBeats) }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(i / totalBeats) * 100}%`,
              width: 1,
              backgroundColor: "var(--border-primary)",
              opacity: 0.5,
            }}
          />
        ))}

        {/* Segments between keyframes */}
        {channel.keyframes
          .sort((a, b) => a.beatOffset - b.beatOffset)
          .map((kf, idx, arr) => {
            if (idx >= arr.length - 1) return null;
            const next = arr[idx + 1];
            const left = (kf.beatOffset / totalBeats) * 100;
            const width = ((next.beatOffset - kf.beatOffset) / totalBeats) * 100;
            return (
              <div
                key={`seg-${kf.id}`}
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  height: 2,
                  backgroundColor: CHANNEL_COLORS[channel.kind],
                  opacity: 0.5,
                }}
              />
            );
          })}

        {/* Keyframe dots */}
        {channel.keyframes.map((kf) => {
          const left = (kf.beatOffset / totalBeats) * 100;
          const isSelected = selectedKeyframeId === kf.id;
          return (
            <div
              key={kf.id}
              data-keyframe="true"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-pointer"
              style={{
                left: `${left}%`,
                width: isSelected ? 10 : 8,
                height: isSelected ? 10 : 8,
                backgroundColor: CHANNEL_COLORS[channel.kind],
                border: isSelected ? "2px solid white" : "1px solid rgba(255,255,255,0.5)",
                zIndex: isSelected ? 2 : 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectKeyframe(channel.kind, isSelected ? null : kf.id);
              }}
              title={`Beat ${kf.beatOffset.toFixed(2)}, Value ${kf.useCurrent ? "$CURRENT" : kf.value}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Keyframe Editor: shows details for a selected keyframe
// ============================================================

function KeyframeEditor({
  keyframe,
  kind,
  onUpdate,
  onDelete,
}: {
  keyframe: Keyframe;
  kind: LineEventKind;
  onUpdate: (changes: Partial<Keyframe>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="rounded p-2 space-y-2"
      style={{ backgroundColor: "var(--bg-active)", border: "1px solid var(--border-primary)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: CHANNEL_COLORS[kind] }}>
          Keyframe Details
        </span>
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ color: "var(--text-muted)" }}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      {/* Beat offset */}
      <label className="flex items-center gap-2 text-xs">
        <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          Beat
        </span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          type="number"
          step="0.25"
          min="0"
          value={keyframe.beatOffset}
          onChange={(e) => onUpdate({ beatOffset: Math.max(0, parseFloat(e.target.value) || 0) })}
        />
      </label>

      {/* Value */}
      <label className="flex items-center gap-2 text-xs">
        <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          Value
        </span>
        {keyframe.useCurrent ? (
          <span className="flex-1 px-1 py-0.5 text-xs italic" style={{ color: "var(--text-muted)" }}>
            $CURRENT
          </span>
        ) : (
          <input
            className="flex-1 px-1 py-0.5 rounded text-xs"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
            type="number"
            step="0.1"
            value={keyframe.value}
            onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
          />
        )}
        <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <input
            type="checkbox"
            checked={keyframe.useCurrent}
            onChange={(e) => onUpdate({ useCurrent: e.target.checked })}
          />
          $CUR
        </label>
      </label>

      {/* Easing */}
      <label className="flex items-center gap-2 text-xs">
        <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
          Easing
        </span>
        <select
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          value={typeof keyframe.easing === "string" ? keyframe.easing : "linear"}
          onChange={(e) => onUpdate({ easing: e.target.value as EasingType })}
        >
          {EASING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ============================================================
// Build EventPreset from channel states
// ============================================================

function buildPreset(
  name: string,
  description: string,
  channels: ChannelState[],
): EventPreset {
  const template: EventTemplate[] = [];
  const usedKinds = new Set<LineEventKind>();

  for (const channel of channels) {
    if (!channel.enabled || channel.keyframes.length < 2) continue;

    const sorted = [...channel.keyframes].sort((a, b) => a.beatOffset - b.beatOffset);

    for (let i = 0; i < sorted.length - 1; i++) {
      const kf = sorted[i];
      const next = sorted[i + 1];

      const startBeatOffset = floatToBeat(kf.beatOffset);
      const endBeatOffset = floatToBeat(next.beatOffset);
      const startValue: number | "$CURRENT" = kf.useCurrent ? "$CURRENT" : kf.value;
      const endValue: number | "$CURRENT" = next.useCurrent ? "$CURRENT" : next.value;

      template.push({
        kind: channel.kind,
        startBeatOffset,
        endBeatOffset,
        startValue,
        endValue,
        easing: kf.easing,
      });

      usedKinds.add(channel.kind);
    }
  }

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description,
    template,
    channels: Array.from(usedKinds),
    builtin: false,
    tags: ["custom"],
  };
}

// ============================================================
// Main PresetBuilder Component
// ============================================================

export function PresetBuilder({ onClose }: { onClose: () => void }) {
  const addCustomPreset = useSettingsStore((s) => s.addCustomPreset);

  const [name, setName] = useState("My Preset");
  const [description, setDescription] = useState("");
  const [totalBeats, setTotalBeats] = useState(4);
  const [channelStates, setChannelStates] = useState<ChannelState[]>(
    ALL_CHANNELS.map((kind) => ({
      kind,
      enabled: false,
      keyframes: [],
    })),
  );
  const [selectedChannel, setSelectedChannel] = useState<LineEventKind | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  const toggleChannel = (kind: LineEventKind) => {
    setChannelStates((prev) =>
      prev.map((ch) => {
        if (ch.kind !== kind) return ch;
        const enabled = !ch.enabled;
        return {
          ...ch,
          enabled,
          // Initialize with two default keyframes when enabling
          keyframes: enabled && ch.keyframes.length === 0
            ? [
                {
                  id: generateKeyframeId(),
                  beatOffset: 0,
                  value: CHANNEL_DEFAULTS[kind],
                  useCurrent: false,
                  easing: "linear",
                },
                {
                  id: generateKeyframeId(),
                  beatOffset: totalBeats,
                  value: CHANNEL_DEFAULTS[kind],
                  useCurrent: false,
                  easing: "linear",
                },
              ]
            : ch.keyframes,
        };
      }),
    );
  };

  const addKeyframe = useCallback(
    (kind: LineEventKind, beatOffset: number) => {
      setChannelStates((prev) =>
        prev.map((ch) => {
          if (ch.kind !== kind) return ch;
          const newKf: Keyframe = {
            id: generateKeyframeId(),
            beatOffset: Math.round(beatOffset * 4) / 4, // snap to quarter beats
            value: CHANNEL_DEFAULTS[kind],
            useCurrent: false,
            easing: "linear",
          };
          return { ...ch, keyframes: [...ch.keyframes, newKf] };
        }),
      );
    },
    [],
  );

  const selectKeyframe = useCallback(
    (kind: LineEventKind, id: string | null) => {
      setSelectedChannel(id ? kind : null);
      setSelectedKeyframeId(id);
    },
    [],
  );

  const updateKeyframe = useCallback(
    (kind: LineEventKind, id: string, changes: Partial<Keyframe>) => {
      setChannelStates((prev) =>
        prev.map((ch) => {
          if (ch.kind !== kind) return ch;
          return {
            ...ch,
            keyframes: ch.keyframes.map((kf) =>
              kf.id === id ? { ...kf, ...changes } : kf,
            ),
          };
        }),
      );
    },
    [],
  );

  const deleteKeyframe = useCallback(
    (kind: LineEventKind, id: string) => {
      setChannelStates((prev) =>
        prev.map((ch) => {
          if (ch.kind !== kind) return ch;
          return {
            ...ch,
            keyframes: ch.keyframes.filter((kf) => kf.id !== id),
          };
        }),
      );
      setSelectedKeyframeId(null);
      setSelectedChannel(null);
    },
    [],
  );

  const handleSave = () => {
    const preset = buildPreset(name, description, channelStates);
    if (preset.template.length === 0) return; // Nothing to save
    addCustomPreset(preset);
    onClose();
  };

  const selectedKf =
    selectedChannel && selectedKeyframeId
      ? channelStates
          .find((ch) => ch.kind === selectedChannel)
          ?.keyframes.find((kf) => kf.id === selectedKeyframeId)
      : null;

  const enabledChannelCount = channelStates.filter((ch) => ch.enabled).length;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg p-4 w-[520px] max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Preset Builder
        </h3>

        {/* Name and description */}
        <div className="space-y-2 mb-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              Name
            </span>
            <input
              className="flex-1 px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              Desc
            </span>
            <input
              className="flex-1 px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              Duration
            </span>
            <input
              className="flex-1 px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
              type="number"
              step="1"
              min="1"
              max="32"
              value={totalBeats}
              onChange={(e) => setTotalBeats(Math.max(1, parseInt(e.target.value) || 4))}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>beats</span>
          </label>
        </div>

        {/* Channel selector */}
        <div className="mb-3">
          <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
            Channels
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_CHANNELS.map((kind) => {
              const ch = channelStates.find((c) => c.kind === kind);
              const isEnabled = ch?.enabled ?? false;
              return (
                <button
                  key={kind}
                  className="px-2 py-0.5 rounded text-xs transition-colors"
                  style={{
                    backgroundColor: isEnabled ? CHANNEL_COLORS[kind] : "var(--bg-active)",
                    color: isEnabled ? "white" : "var(--text-secondary)",
                    border: isEnabled ? "none" : "1px solid var(--border-primary)",
                  }}
                  onClick={() => toggleChannel(kind)}
                >
                  {CHANNEL_LABELS[kind]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Keyframe strips for enabled channels */}
        {enabledChannelCount > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              Keyframes (click strip to add)
            </div>
            {channelStates
              .filter((ch) => ch.enabled)
              .map((ch) => (
                <KeyframeStrip
                  key={ch.kind}
                  channel={ch}
                  totalBeats={totalBeats}
                  onAddKeyframe={addKeyframe}
                  onSelectKeyframe={selectKeyframe}
                  selectedKeyframeId={
                    selectedChannel === ch.kind ? selectedKeyframeId : null
                  }
                />
              ))}
          </div>
        )}

        {/* Selected keyframe editor */}
        {selectedKf && selectedChannel && (
          <div className="mb-3">
            <KeyframeEditor
              keyframe={selectedKf}
              kind={selectedChannel}
              onUpdate={(changes) =>
                updateKeyframe(selectedChannel, selectedKf.id, changes)
              }
              onDelete={() => deleteKeyframe(selectedChannel, selectedKf.id)}
            />
          </div>
        )}

        {/* Summary */}
        {enabledChannelCount > 0 && (
          <div
            className="text-xs p-2 mb-3 rounded"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-muted)" }}
          >
            Preset will generate{" "}
            {channelStates.reduce(
              (sum, ch) => sum + (ch.enabled ? Math.max(0, ch.keyframes.length - 1) : 0),
              0,
            )}{" "}
            event(s) across {enabledChannelCount} channel(s) over {totalBeats} beat(s).
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--bg-active)", color: "var(--text-secondary)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 rounded text-xs"
            style={{ backgroundColor: "var(--accent-primary)", color: "white" }}
            onClick={handleSave}
            disabled={enabledChannelCount === 0 || !name.trim()}
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Batch Offset Editor — Leader/follower stagger system
//
// Select a leader line, configure beat offsets for followers,
// then apply staggered copies of the leader's latest event.
// ============================================================

import { useState, useMemo } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import { createStaggeredEvents, generateEvenOffsets } from "../../../utils/batchEventOffset";
import type { LineEventKind } from "../../../types/chart";

const CHANNEL_OPTIONS: { kind: LineEventKind; label: string; color: string }[] = [
  { kind: "x", label: "X", color: "var(--event-x, #ff6b6b)" },
  { kind: "y", label: "Y", color: "var(--event-y, #51cf66)" },
  { kind: "rotation", label: "Rotation", color: "var(--event-rotation, #ffd43b)" },
  { kind: "opacity", label: "Opacity", color: "var(--event-opacity, #cc5de8)" },
  { kind: "speed", label: "Speed", color: "var(--event-speed, #4dabf7)" },
];

export function BatchOffsetEditor() {
  const multiSelectedLineIndices = useEditorStore((s) => s.multiSelectedLineIndices);
  const chart = useChartStore((s) => s.chart);
  const batchMutate = useChartStore((s) => s.batchMultiLineMutations);

  const [leaderIndex, setLeaderIndex] = useState<number | null>(
    multiSelectedLineIndices.length > 0 ? multiSelectedLineIndices[0] : null,
  );
  const [channel, setChannel] = useState<LineEventKind>("x");
  const [offsets, setOffsets] = useState<Record<number, number>>({});
  const [spacing, setSpacing] = useState(0.5);

  const followers = useMemo(
    () => multiSelectedLineIndices.filter((i) => i !== leaderIndex),
    [multiSelectedLineIndices, leaderIndex],
  );

  const handleAutoStagger = () => {
    const evenOffsets = generateEvenOffsets(followers.length, spacing);
    const newOffsets: Record<number, number> = {};
    followers.forEach((lineIdx, i) => {
      newOffsets[lineIdx] = evenOffsets[i] ?? 0;
    });
    setOffsets(newOffsets);
  };

  const handleApply = () => {
    if (leaderIndex === null || !chart) return;

    const followerConfigs = followers.map((lineIdx) => ({
      lineIndex: lineIdx,
      beatOffset: offsets[lineIdx] ?? 0,
    }));

    const mutations = createStaggeredEvents(leaderIndex, followerConfigs, channel, chart);
    if (mutations && mutations.length > 0) {
      batchMutate(mutations);
    }
  };

  if (multiSelectedLineIndices.length < 2) {
    return (
      <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
        Select 2 or more lines to use batch offset editing
      </div>
    );
  }

  return (
    <div>
      {/* Leader selector */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", padding: "4px 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Leader Line
        </div>
        <select
          value={leaderIndex ?? ""}
          onChange={(e) => setLeaderIndex(Number(e.target.value))}
          style={{
            width: "100%",
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 11,
            border: "0.5px solid var(--border-color)",
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            outline: "none",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {multiSelectedLineIndices.map((idx) => (
            <option key={idx} value={idx}>
              Line {idx} — {chart?.lines[idx]?.name || `Line ${idx}`}
            </option>
          ))}
        </select>
      </div>

      {/* Channel selector */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", padding: "4px 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Event Channel
        </div>
        <div style={{ display: "flex", gap: 3, padding: "2px 6px" }}>
          {CHANNEL_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              onClick={() => setChannel(opt.kind)}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                border: channel === opt.kind
                  ? `1px solid ${opt.color}`
                  : "1px solid var(--border-color)",
                background: channel === opt.kind
                  ? `${opt.color}18`
                  : "var(--bg-primary)",
                color: channel === opt.kind ? opt.color : "var(--text-muted)",
                transition: "all 0.12s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Follower list with offsets */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Followers ({followers.length})
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value) || 0.5)}
              step={0.25}
              min={0.1}
              style={{
                width: 48,
                padding: "2px 4px",
                borderRadius: 4,
                fontSize: 10,
                border: "0.5px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: "center",
              }}
            />
            <button
              onClick={handleAutoStagger}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 9,
                border: "1px solid var(--border-color)",
                background: "var(--bg-active)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Auto
            </button>
          </div>
        </div>

        {followers.map((lineIdx) => (
          <div
            key={lineIdx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              borderRadius: 5,
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              marginBottom: 3,
              marginLeft: 6,
              marginRight: 6,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--accent-primary)", flex: 1 }}>
              Line {lineIdx}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
              {chart?.lines[lineIdx]?.name || ""}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>+</span>
            <input
              type="number"
              value={offsets[lineIdx] ?? 0}
              onChange={(e) =>
                setOffsets((prev) => ({ ...prev, [lineIdx]: Number(e.target.value) || 0 }))
              }
              step={0.25}
              style={{
                width: 52,
                padding: "2px 4px",
                borderRadius: 4,
                fontSize: 10,
                border: "0.5px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: "center",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>beats</span>
          </div>
        ))}
      </div>

      {/* Apply button */}
      <div style={{ padding: "6px 6px" }}>
        <button
          onClick={handleApply}
          disabled={leaderIndex === null || followers.length === 0}
          style={{
            width: "100%",
            padding: "7px 16px",
            borderRadius: 6,
            border: "none",
            background: leaderIndex !== null ? "var(--accent-primary)" : "var(--bg-active)",
            color: leaderIndex !== null ? "#fff" : "var(--text-muted)",
            cursor: leaderIndex !== null ? "pointer" : "default",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          Apply Stagger
        </button>
      </div>
    </div>
  );
}

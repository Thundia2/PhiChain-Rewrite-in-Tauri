import { useChartStore } from "../../stores/chartStore";
import type { Beat, BpmPoint } from "../../types/chart";
import { beatToFloat } from "../../types/chart";
import { Card, ActionButton, INPUT_STYLE } from "../common/UIKit";
import { safeParseNumber } from "../common/FormFields";

export function BpmListPanel() {
  const bpmList = useChartStore((s) => s.chart.bpm_list);
  const setBpmList = useChartStore((s) => s.setBpmList);

  const addBpm = () => {
    const lastBpm = bpmList[bpmList.length - 1];
    const wholeBeat = lastBpm
      ? Math.floor(beatToFloat(lastBpm.beat)) + 4
      : 0;
    const newEntry: BpmPoint = {
      beat: [wholeBeat, 0, 1],
      bpm: lastBpm?.bpm ?? 120,
    };
    setBpmList([...bpmList, newEntry]);
  };

  const removeBpm = (index: number) => {
    if (bpmList.length <= 1) return; // Must keep at least one
    setBpmList(bpmList.filter((_, i) => i !== index));
  };

  const editBpm = (index: number, changes: Partial<BpmPoint>) => {
    const newList = bpmList.map((entry, i) =>
      i === index ? { ...entry, ...changes } : entry
    );
    setBpmList(newList);
  };

  const editBeat = (index: number, beat: Beat) => {
    editBpm(index, { beat });
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(42, 42, 53, 0.55)",
        }}
      >
        <ActionButton variant="primary" onClick={addBpm} title="Add BPM point">
          + Add BPM Point
        </ActionButton>
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
          {bpmList.length} point{bpmList.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* BPM entries */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "8px 12px" }}>
        <Card>
          {bpmList.map((entry, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "8px 10px",
                borderBottom:
                  idx < bpmList.length - 1
                    ? "1px solid rgba(42, 42, 53, 0.55)"
                    : "none",
              }}
            >
              <span
                style={{
                  width: 16,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 10,
                }}
              >
                {idx}
              </span>

              {/* Beat inputs */}
              <input
                style={{
                  ...INPUT_STYLE,
                  width: 36,
                  textAlign: "center",
                }}
                type="number"
                value={entry.beat[0]}
                onChange={(e) =>
                  { const n = safeParseNumber(e.target.value); if (n !== null) editBeat(idx, [Math.trunc(n), entry.beat[1], entry.beat[2]]); }
                }
                title="Whole beats"
              />
              <input
                style={{
                  ...INPUT_STYLE,
                  width: 28,
                  textAlign: "center",
                }}
                type="number"
                min={0}
                value={entry.beat[1]}
                onChange={(e) =>
                  { const n = safeParseNumber(e.target.value); if (n !== null) editBeat(idx, [entry.beat[0], Math.trunc(n), entry.beat[2]]); }
                }
                title="Numerator"
              />
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>/</span>
              <input
                style={{
                  ...INPUT_STYLE,
                  width: 28,
                  textAlign: "center",
                }}
                type="number"
                min={1}
                value={entry.beat[2]}
                onChange={(e) =>
                  editBeat(idx, [
                    entry.beat[0],
                    entry.beat[1],
                    Math.max(1, parseInt(e.target.value) || 1),
                  ])
                }
                title="Denominator"
              />

              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>@</span>

              {/* BPM input */}
              <input
                style={{
                  ...INPUT_STYLE,
                  width: 60,
                }}
                type="number"
                step="0.1"
                min={1}
                value={entry.bpm}
                onChange={(e) => editBpm(idx, { bpm: parseFloat(e.target.value) || 120 })}
                title="BPM"
              />

              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>bpm</span>

              {/* Remove button */}
              <button
                style={{
                  marginLeft: "auto",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color: bpmList.length <= 1 ? "var(--text-muted)" : "var(--error)",
                  cursor: bpmList.length <= 1 ? "default" : "pointer",
                  fontSize: 11,
                  opacity: bpmList.length <= 1 ? 0.4 : 1,
                  fontFamily: "inherit",
                }}
                onClick={() => removeBpm(idx)}
                disabled={bpmList.length <= 1}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

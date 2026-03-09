import { useChartStore } from "../../stores/chartStore";
import type { Beat, BpmPoint } from "../../types/chart";
import { beatToFloat } from "../../types/chart";

export function BpmListPanel() {
  const bpmList = useChartStore((s) => s.chart.bpm_list);
  const setBpmList = useChartStore((s) => s.setBpmList);

  const addBpm = () => {
    const lastBpm = bpmList[bpmList.length - 1];
    const newBeat: Beat = lastBpm
      ? [beatToFloat(lastBpm.beat) + 4, 0, 1] as unknown as Beat
      : [0, 0, 1];
    // Ensure proper beat format
    const wholeBeat = Math.floor(beatToFloat(newBeat));
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

  const inputStyle = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div
        className="flex gap-1 p-1 border-b"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
          onClick={addBpm}
          title="Add BPM point"
        >
          + Add
        </button>
      </div>

      {/* BPM entries */}
      <div className="flex-1 overflow-y-auto">
        {bpmList.map((entry, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 px-2 py-1.5 border-b"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>
              {idx}
            </span>

            {/* Beat inputs */}
            <input
              className="w-8 px-0.5 py-0.5 rounded text-xs text-center"
              style={inputStyle}
              type="number"
              value={entry.beat[0]}
              onChange={(e) =>
                editBeat(idx, [parseInt(e.target.value) || 0, entry.beat[1], entry.beat[2]])
              }
              title="Whole beats"
            />
            <input
              className="w-6 px-0.5 py-0.5 rounded text-xs text-center"
              style={inputStyle}
              type="number"
              min={0}
              value={entry.beat[1]}
              onChange={(e) =>
                editBeat(idx, [entry.beat[0], parseInt(e.target.value) || 0, entry.beat[2]])
              }
              title="Numerator"
            />
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <input
              className="w-6 px-0.5 py-0.5 rounded text-xs text-center"
              style={inputStyle}
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

            <span style={{ color: "var(--text-muted)" }}>@</span>

            {/* BPM input */}
            <input
              className="w-14 px-0.5 py-0.5 rounded text-xs"
              style={inputStyle}
              type="number"
              step="0.1"
              min={1}
              value={entry.bpm}
              onChange={(e) => editBpm(idx, { bpm: parseFloat(e.target.value) || 120 })}
              title="BPM"
            />

            <span className="text-xs" style={{ color: "var(--text-muted)" }}>bpm</span>

            {/* Remove button (disabled for first entry if it's the only one) */}
            <button
              className="ml-auto px-1 rounded hover:bg-red-900/30"
              style={{ color: "var(--text-muted)" }}
              onClick={() => removeBpm(idx)}
              disabled={bpmList.length <= 1}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

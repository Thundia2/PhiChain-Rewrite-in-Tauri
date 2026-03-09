import { useChartStore } from "../../stores/chartStore";

export function ChartSettings() {
  const offset = useChartStore((s) => s.chart.offset);
  const meta = useChartStore((s) => s.meta);
  const setOffset = useChartStore((s) => s.setOffset);
  const setMeta = useChartStore((s) => s.setMeta);

  const inputStyle = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
  };

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
        Chart
      </div>

      {/* Offset */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Offset (s)</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.001"
          value={offset}
          onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
        />
      </label>

      <div
        className="border-t mt-1 pt-2 font-medium"
        style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
      >
        Metadata
      </div>

      {/* Song name */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Name</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          value={meta.name}
          onChange={(e) => setMeta({ name: e.target.value })}
        />
      </label>

      {/* Level */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Level</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          value={meta.level}
          onChange={(e) => setMeta({ level: e.target.value })}
        />
      </label>

      {/* Composer */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Composer</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          value={meta.composer}
          onChange={(e) => setMeta({ composer: e.target.value })}
        />
      </label>

      {/* Charter */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Charter</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          value={meta.charter}
          onChange={(e) => setMeta({ charter: e.target.value })}
        />
      </label>

      {/* Illustrator */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Illustrator</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          value={meta.illustrator}
          onChange={(e) => setMeta({ illustrator: e.target.value })}
        />
      </label>
    </div>
  );
}

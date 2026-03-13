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

      {/* ---- Phira Extended Fields ---- */}
      <div
        className="border-t mt-1 pt-2 font-medium"
        style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
      >
        Phira / info.yml
      </div>

      {/* Preview Start */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Preview start</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.1"
          placeholder="0"
          value={meta.preview_start ?? ""}
          onChange={(e) => setMeta({ preview_start: e.target.value ? parseFloat(e.target.value) : undefined })}
        />
      </label>

      {/* Preview End */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Preview end</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.1"
          placeholder="auto (+15s)"
          value={meta.preview_end ?? ""}
          onChange={(e) => setMeta({ preview_end: e.target.value ? parseFloat(e.target.value) : undefined })}
        />
      </label>

      {/* Aspect Ratio */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Aspect ratio</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.01"
          placeholder="1.778 (16:9)"
          value={meta.aspect_ratio ?? ""}
          onChange={(e) => setMeta({ aspect_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
        />
      </label>

      {/* Background Dim */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>BG dim</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.05"
          min="0"
          max="1"
          placeholder="0.6"
          value={meta.background_dim ?? ""}
          onChange={(e) => setMeta({ background_dim: e.target.value ? parseFloat(e.target.value) : undefined })}
        />
      </label>

      {/* Line Length */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Line length</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          step="0.5"
          placeholder="6.0"
          value={meta.line_length ?? ""}
          onChange={(e) => setMeta({ line_length: e.target.value ? parseFloat(e.target.value) : undefined })}
        />
      </label>

      {/* Tip */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Tip</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          placeholder="Loading screen tip"
          value={meta.tip ?? ""}
          onChange={(e) => setMeta({ tip: e.target.value || undefined })}
        />
      </label>

      {/* Tags */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Tags</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          placeholder="tag1, tag2, ..."
          value={(meta.tags ?? []).join(", ")}
          onChange={(e) => {
            const raw = e.target.value;
            const tags = raw ? raw.split(",").map(t => t.trim()).filter(Boolean) : undefined;
            setMeta({ tags });
          }}
        />
      </label>

      {/* Intro */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Intro</span>
        <input
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="text"
          placeholder="Chart introduction"
          value={meta.intro ?? ""}
          onChange={(e) => setMeta({ intro: e.target.value || undefined })}
        />
      </label>

      {/* Hold Partial Cover */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Hold cover</span>
        <select
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          value={meta.hold_partial_cover == null ? "" : meta.hold_partial_cover ? "tail" : "head"}
          onChange={(e) => {
            if (e.target.value === "") setMeta({ hold_partial_cover: undefined });
            else setMeta({ hold_partial_cover: e.target.value === "tail" });
          }}
        >
          <option value="">Default (head)</option>
          <option value="head">Head</option>
          <option value="tail">Tail</option>
        </select>
      </label>
    </div>
  );
}

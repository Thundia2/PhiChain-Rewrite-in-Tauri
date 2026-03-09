import { useEditorStore } from "../../stores/editorStore";
import type { NoteSideFilter } from "../../types/editor";

const DENSITY_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export function TimelineSettings() {
  const zoom = useEditorStore((s) => s.timelineZoom);
  const density = useEditorStore((s) => s.density);
  const lanes = useEditorStore((s) => s.lanes);
  const noteSideFilter = useEditorStore((s) => s.noteSideFilter);
  const showSpectrogram = useEditorStore((s) => s.showSpectrogram);
  const spectrogramOpacity = useEditorStore((s) => s.spectrogramOpacity);
  const setTimelineZoom = useEditorStore((s) => s.setTimelineZoom);
  const setDensity = useEditorStore((s) => s.setDensity);
  const setLanes = useEditorStore((s) => s.setLanes);
  const setNoteSideFilter = useEditorStore((s) => s.setNoteSideFilter);
  const setShowSpectrogram = useEditorStore((s) => s.setShowSpectrogram);
  const setSpectrogramOpacity = useEditorStore((s) => s.setSpectrogramOpacity);

  const inputStyle = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
  };

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* Zoom */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Zoom</span>
        <input
          type="range"
          className="flex-1"
          min={0.1}
          max={5}
          step={0.1}
          value={zoom}
          onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
        />
        <span className="w-10 text-right" style={{ color: "var(--text-secondary)" }}>
          {zoom.toFixed(1)}x
        </span>
      </label>

      {/* Density */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Density</span>
        <select
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          value={density}
          onChange={(e) => setDensity(parseInt(e.target.value))}
        >
          {DENSITY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              1/{d}
            </option>
          ))}
        </select>
      </label>

      {/* Lanes */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Lanes</span>
        <input
          className="w-14 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          type="number"
          min={1}
          max={32}
          value={lanes}
          onChange={(e) => setLanes(parseInt(e.target.value) || 9)}
        />
      </label>

      {/* Note side filter */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Side</span>
        <select
          className="flex-1 px-1 py-0.5 rounded text-xs"
          style={inputStyle}
          value={noteSideFilter}
          onChange={(e) => setNoteSideFilter(e.target.value as NoteSideFilter)}
        >
          <option value="all">All</option>
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
      </label>

      {/* Spectrogram */}
      <label className="flex items-center gap-2">
        <span className="w-20" style={{ color: "var(--text-muted)" }}>Spectrogram</span>
        <input
          type="checkbox"
          checked={showSpectrogram}
          onChange={(e) => setShowSpectrogram(e.target.checked)}
        />
      </label>

      {showSpectrogram && (
        <label className="flex items-center gap-2">
          <span className="w-20" style={{ color: "var(--text-muted)" }}>Opacity</span>
          <input
            type="range"
            className="flex-1"
            min={0}
            max={1}
            step={0.05}
            value={spectrogramOpacity}
            onChange={(e) => setSpectrogramOpacity(parseFloat(e.target.value))}
          />
          <span className="w-10 text-right" style={{ color: "var(--text-secondary)" }}>
            {Math.round(spectrogramOpacity * 100)}%
          </span>
        </label>
      )}
    </div>
  );
}

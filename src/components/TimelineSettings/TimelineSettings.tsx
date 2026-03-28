import { useEditorStore } from "../../stores/editorStore";
import type { NoteSideFilter } from "../../types/editor";
import { Card, CardRow, SectionHeader, Toggle, INPUT_STYLE, SELECT_STYLE } from "../common/UIKit";

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

  return (
    <div style={{ padding: 8 }}>
      <SectionHeader color="var(--accent-primary)">View</SectionHeader>
      <Card>
        <CardRow label="Zoom">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={zoom}
              onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
              style={{ accentColor: "var(--accent-primary)", width: 90 }}
            />
            <span style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 30, textAlign: "right" }}>
              {zoom.toFixed(1)}x
            </span>
          </div>
        </CardRow>
        <CardRow label="Density">
          <select
            style={{ ...SELECT_STYLE }}
            value={density}
            onChange={(e) => setDensity(parseInt(e.target.value))}
          >
            {DENSITY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                1/{d}
              </option>
            ))}
          </select>
        </CardRow>
        <CardRow label="Lanes">
          <input
            style={{ ...INPUT_STYLE, width: 50 }}
            type="number"
            min={1}
            max={32}
            value={lanes}
            onChange={(e) => setLanes(parseInt(e.target.value) || 9)}
          />
        </CardRow>
        <CardRow label="Side filter" last>
          <select
            style={{ ...SELECT_STYLE }}
            value={noteSideFilter}
            onChange={(e) => setNoteSideFilter(e.target.value as NoteSideFilter)}
          >
            <option value="all">All</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </CardRow>
      </Card>

      <SectionHeader color="var(--accent-primary)">Spectrogram</SectionHeader>
      <Card>
        <CardRow label="Show" last={!showSpectrogram}>
          <Toggle checked={showSpectrogram} onChange={(v) => setShowSpectrogram(v)} />
        </CardRow>
        {showSpectrogram && (
          <CardRow label="Opacity" last>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={spectrogramOpacity}
                onChange={(e) => setSpectrogramOpacity(parseFloat(e.target.value))}
                style={{ accentColor: "var(--accent-primary)", width: 90 }}
              />
              <span style={{ fontSize: 10, color: "var(--text-secondary)", minWidth: 30, textAlign: "right" }}>
                {Math.round(spectrogramOpacity * 100)}%
              </span>
            </div>
          </CardRow>
        )}
      </Card>
    </div>
  );
}

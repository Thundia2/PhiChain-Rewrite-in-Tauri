// ============================================================
// DevTools Panel — Developer utilities
//
// Raw JSON view of selected line, chart statistics overview,
// and an event evaluator. Toggle with Ctrl+Shift+D.
// ============================================================

import { useState, useMemo } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useChartStore } from "../../stores/chartStore";
import { beatToFloat } from "../../types/chart";
import { BpmList } from "../../utils/bpmList";
import { evaluateEasing } from "../../canvas/easings";

type DevTab = "json" | "stats" | "evaluator";

function JsonTab() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const chart = useChartStore((s) => s.chart);

  const jsonText = useMemo(() => {
    if (selectedLineIndex === null) return "// Select a line to view its JSON";
    const line = chart.lines[selectedLineIndex];
    if (!line) return "// Line not found";
    return JSON.stringify(line, null, 2);
  }, [selectedLineIndex, chart]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {selectedLineIndex !== null
          ? `Line #${selectedLineIndex} — ${chart.lines[selectedLineIndex]?.name ?? "?"}`
          : "No line selected"}
      </div>
      <pre
        className="flex-1 overflow-auto p-2 text-xs font-mono"
        style={{
          color: "var(--text-secondary)",
          backgroundColor: "var(--bg-primary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {jsonText}
      </pre>
    </div>
  );
}

function StatsTab() {
  const chart = useChartStore((s) => s.chart);

  const stats = useMemo(() => {
    let totalNotes = 0;
    let totalEvents = 0;
    let maxBeat = 0;

    for (const line of chart.lines) {
      totalNotes += line.notes.length;
      totalEvents += line.events.length;
      for (const n of line.notes) {
        const b = beatToFloat(n.beat);
        maxBeat = Math.max(maxBeat, n.hold_beat ? b + beatToFloat(n.hold_beat) : b);
      }
      for (const ev of line.events) {
        maxBeat = Math.max(maxBeat, beatToFloat(ev.end_beat));
      }
    }

    return {
      lines: chart.lines.length,
      totalNotes,
      totalEvents,
      bpmPoints: chart.bpm_list.length,
      offset: chart.offset,
      maxBeat: maxBeat.toFixed(2),
      format: chart.format,
    };
  }, [chart]);

  return (
    <div className="p-2 text-xs">
      <table className="w-full">
        <tbody>
          {Object.entries(stats).map(([key, val]) => (
            <tr key={key}>
              <td className="py-0.5 pr-3" style={{ color: "var(--text-muted)" }}>
                {key}
              </td>
              <td className="py-0.5 font-mono" style={{ color: "var(--text-primary)" }}>
                {String(val)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvaluatorTab() {
  const [beatInput, setBeatInput] = useState("0");
  const chart = useChartStore((s) => s.chart);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);

  const result = useMemo(() => {
    const beatVal = parseFloat(beatInput);
    if (isNaN(beatVal) || selectedLineIndex === null) return null;

    const line = chart.lines[selectedLineIndex];
    if (!line) return null;

    const bl = new BpmList(chart.bpm_list);
    const time = bl.timeAtFloat(beatVal);
    const bpm = bl.bpmAtTime(time);

    // Find event values at this beat for each kind
    const values: Record<string, number | string> = {};
    const kinds = ["x", "y", "rotation", "opacity", "speed"] as const;

    for (const kind of kinds) {
      const events = line.events.filter((e) => e.kind === kind);
      let found = false;
      for (const ev of events) {
        const start = beatToFloat(ev.start_beat);
        const end = beatToFloat(ev.end_beat);
        if (beatVal >= start && beatVal <= end) {
          if ("constant" in ev.value) {
            values[kind] = ev.value.constant;
          } else if ("transition" in ev.value) {
            const t = end > start ? (beatVal - start) / (end - start) : 0;
            const { start: s, end: e, easing } = ev.value.transition;
            const easedT = evaluateEasing(easing, t);
            values[kind] = +(s + (e - s) * easedT).toFixed(3);
          }
          found = true;
          break;
        }
      }
      if (!found) values[kind] = "N/A";
    }

    return { time: time.toFixed(3), bpm: bpm.toFixed(1), ...values };
  }, [beatInput, chart, selectedLineIndex]);

  return (
    <div className="p-2 flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <span style={{ color: "var(--text-muted)" }}>Beat:</span>
        <input
          type="number"
          step="0.25"
          value={beatInput}
          onChange={(e) => setBeatInput(e.target.value)}
          className="w-20 px-1 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
        />
      </label>
      {selectedLineIndex === null && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Select a line to evaluate events
        </div>
      )}
      {result && (
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(result).map(([key, val]) => (
              <tr key={key}>
                <td className="py-0.5 pr-3" style={{ color: "var(--text-muted)" }}>
                  {key}
                </td>
                <td className="py-0.5 font-mono" style={{ color: "var(--text-primary)" }}>
                  {String(val)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DevToolsPanel() {
  const devToolsOpen = useEditorStore((s) => s.devToolsOpen);
  const toggleDevTools = useEditorStore((s) => s.toggleDevTools);
  const [activeTab, setActiveTab] = useState<DevTab>("json");

  if (!devToolsOpen) return null;

  const tabs: Array<{ id: DevTab; label: string }> = [
    { id: "json", label: "JSON" },
    { id: "stats", label: "Stats" },
    { id: "evaluator", label: "Evaluator" },
  ];

  return (
    <div
      className="fixed bottom-7 right-0 z-50 flex flex-col"
      style={{
        width: "360px",
        height: "320px",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px 0 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center px-3 py-1.5 gap-2 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "8px 0 0 0",
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          DevTools
        </span>

        {/* Tab buttons */}
        <div className="flex gap-1 ml-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className="px-2 py-0.5 rounded text-xs"
              style={{
                backgroundColor:
                  activeTab === tab.id ? "var(--accent-primary)" : "transparent",
                color:
                  activeTab === tab.id ? "#fff" : "var(--text-muted)",
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button
          className="text-xs px-1 hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          onClick={toggleDevTools}
        >
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "json" && <JsonTab />}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "evaluator" && <EvaluatorTab />}
      </div>
    </div>
  );
}

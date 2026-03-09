// ============================================================
// Line Event Editor — Main container component
//
// The top-level component for the line_event_editor tab.
// Composes EventEditorToolbar, EventCanvas, KeyframeStrip,
// EventPreview, and EventInspector into a unified layout.
// ============================================================

import { useChartStore } from "../../stores/chartStore";
import { EventEditorToolbar } from "./EventEditorToolbar";
import { EventCanvas } from "./EventCanvas";
import { KeyframeStrip } from "./KeyframeStrip";
import { EventPreview } from "./EventPreview";
import { EventInspector } from "./EventInspector";
import { QuickActionBar } from "../QuickActionBar/QuickActionBar";

interface LineEventEditorProps {
  lineIndex: number;
}

export function LineEventEditor({ lineIndex }: LineEventEditorProps) {
  const line = useChartStore((s) => s.chart.lines[lineIndex]);

  if (!line) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Line {lineIndex} not found. It may have been deleted.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Transport bar for playback controls */}
      <QuickActionBar />

      {/* Event editor toolbar (property selector, toggles) */}
      <EventEditorToolbar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Event Canvas + Keyframe Strip */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Event Canvas (drag/rotate line) — takes most space */}
          <div className="flex-1 min-h-0">
            <EventCanvas lineIndex={lineIndex} />
          </div>

          {/* Keyframe Strip (beat axis with event diamonds) */}
          <KeyframeStrip lineIndex={lineIndex} />
        </div>

        {/* Right sidebar: Inspector + Preview */}
        <div
          className="flex flex-col border-l"
          style={{
            borderColor: "var(--border-primary)",
            width: "240px",
            minWidth: "200px",
          }}
        >
          {/* Event Inspector (numeric editing) */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <EventInspector lineIndex={lineIndex} />
          </div>

          {/* Event Preview (game preview) */}
          <div
            className="border-t"
            style={{
              borderColor: "var(--border-primary)",
              height: "200px",
              minHeight: "150px",
            }}
          >
            <EventPreview lineIndex={lineIndex} />
          </div>
        </div>
      </div>
    </div>
  );
}

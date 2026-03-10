// ============================================================
// Event Inspector — Sidebar for the Line Event Editor
//
// Shows numeric values for all event properties at the current
// beat. Allows editing event values, adding new events, and
// adjusting opacity/speed numerically.
// ============================================================

import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { evaluateLineEventsWithLayers } from "../../canvas/events";
import { Field, SelectField, BeatField, EASING_OPTIONS } from "../common/FormFields";
import { beatToFloat, floatToBeat } from "../../types/chart";
import type { LineEvent, LineEventKind, Beat, EasingType } from "../../types/chart";

const EVENT_COLORS: Record<LineEventKind, string> = {
  x: "#ff6b6b",
  y: "#51cf66",
  rotation: "#ffd43b",
  opacity: "#cc5de8",
  speed: "#4dabf7",
};

const KIND_LABELS: Record<LineEventKind, string> = {
  x: "X Position",
  y: "Y Position",
  rotation: "Rotation",
  opacity: "Opacity",
  speed: "Speed",
};

interface EventInspectorProps {
  lineIndex: number;
}

/**
 * Find the event of a given kind that is active at the given beat.
 */
function findActiveEvent(
  events: LineEvent[],
  kind: LineEventKind,
  beat: number,
): { event: LineEvent; index: number } | null {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== kind) continue;
    const start = beatToFloat(e.start_beat);
    const end = beatToFloat(e.end_beat);
    if (beat >= start && beat <= end) return { event: e, index: i };
  }
  return null;
}

export function EventInspector({ lineIndex }: EventInspectorProps) {
  const chart = useChartStore((s) => s.chart);
  const editEvent = useChartStore((s) => s.editEvent);
  const addEvent = useChartStore((s) => s.addEvent);
  const currentBeat = useEditorStore((s) => s.eventEditorCurrentBeat);
  const activeProperty = useEditorStore((s) => s.eventEditorActiveProperty);

  const line = chart.lines[lineIndex];
  if (!line) {
    return (
      <div className="p-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Line not found
      </div>
    );
  }

  // Evaluate all properties at current beat
  const state = evaluateLineEventsWithLayers(line.events, line.event_layers, currentBeat);

  // Find the active event for the selected property
  const activeEventInfo = findActiveEvent(line.events, activeProperty, currentBeat);

  const rotDeg = (state.rotation * 180) / Math.PI;
  const opacityVal = Math.round(state.opacity * 255);

  return (
    <div className="flex flex-col h-full overflow-y-auto text-xs">
      {/* Current Beat */}
      <div className="p-2 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          Beat {currentBeat.toFixed(2)}
        </div>
      </div>

      {/* Evaluated Values */}
      <div className="p-2 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <div className="font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
          Current Values
        </div>
        {([
          { kind: "x" as const, label: "X", value: state.x.toFixed(1) },
          { kind: "y" as const, label: "Y", value: state.y.toFixed(1) },
          { kind: "rotation" as const, label: "Rot", value: `${rotDeg.toFixed(1)}°` },
          { kind: "opacity" as const, label: "Opa", value: String(opacityVal) },
          { kind: "speed" as const, label: "Spd", value: state.speed.toFixed(2) },
        ]).map(({ kind, label, value }) => (
          <div
            key={kind}
            className="flex items-center gap-2 py-0.5 px-1 rounded cursor-pointer"
            style={{
              backgroundColor: activeProperty === kind ? "var(--bg-active)" : "transparent",
            }}
            onClick={() => useEditorStore.getState().setEventEditorActiveProperty(kind)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: EVENT_COLORS[kind] }}
            />
            <span className="w-8" style={{ color: "var(--text-muted)" }}>{label}</span>
            <span style={{ color: "var(--text-primary)" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Active Event Details */}
      <div className="p-2 border-b" style={{ borderColor: "var(--border-primary)" }}>
        <div className="font-medium mb-1.5" style={{ color: EVENT_COLORS[activeProperty] }}>
          {KIND_LABELS[activeProperty]}
        </div>

        {activeEventInfo ? (
          <ActiveEventEditor
            event={activeEventInfo.event}
            eventIndex={activeEventInfo.index}
            lineIndex={lineIndex}
          />
        ) : (
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            No event at this beat
          </div>
        )}
      </div>

      {/* Add Event Buttons */}
      <div className="p-2 flex flex-col gap-1">
        <button
          className="w-full px-2 py-1 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          onClick={() => {
            const snappedBeat = floatToBeat(currentBeat);
            const farBeat: Beat = [1000, 0, 1];
            const defaultValue = activeProperty === "opacity" ? 255 : activeProperty === "speed" ? 1 : 0;
            addEvent(lineIndex, {
              kind: activeProperty,
              start_beat: snappedBeat,
              end_beat: farBeat,
              value: { constant: defaultValue },
            });
          }}
        >
          + Add Constant
        </button>
        <button
          className="w-full px-2 py-1 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
          onClick={() => {
            const startBeat = floatToBeat(currentBeat);
            const endBeat = floatToBeat(currentBeat + 4); // 4 beats long
            const defaultValue = activeProperty === "opacity" ? 255 : activeProperty === "speed" ? 1 : 0;
            addEvent(lineIndex, {
              kind: activeProperty,
              start_beat: startBeat,
              end_beat: endBeat,
              value: {
                transition: { start: defaultValue, end: defaultValue, easing: "linear" },
              },
            });
          }}
        >
          + Add Transition
        </button>
      </div>
    </div>
  );
}

/** Editor for the currently active event */
function ActiveEventEditor({
  event,
  eventIndex,
  lineIndex,
}: {
  event: LineEvent;
  eventIndex: number;
  lineIndex: number;
}) {
  const editEvent = useChartStore((s) => s.editEvent);
  const isTransition = "transition" in event.value;
  const startVal = isTransition ? event.value.transition.start : event.value.constant;
  const endVal = isTransition ? event.value.transition.end : event.value.constant;

  return (
    <div className="flex flex-col gap-1.5">
      <BeatField
        label="Start"
        beat={event.start_beat}
        onChange={(b) => editEvent(lineIndex, eventIndex, { start_beat: b })}
      />
      <BeatField
        label="End"
        beat={event.end_beat}
        onChange={(b) => editEvent(lineIndex, eventIndex, { end_beat: b })}
      />
      <SelectField
        label="Type"
        value={isTransition ? "transition" : "constant"}
        options={[
          { value: "transition", label: "Transition" },
          { value: "constant", label: "Constant" },
        ]}
        onChange={(v) => {
          if (v === "constant") {
            editEvent(lineIndex, eventIndex, { value: { constant: startVal } });
          } else {
            editEvent(lineIndex, eventIndex, {
              value: { transition: { start: startVal, end: endVal, easing: "linear" } },
            });
          }
        }}
      />
      {isTransition ? (
        <>
          <Field
            label="Start val"
            value={startVal}
            onChange={(v) =>
              editEvent(lineIndex, eventIndex, {
                value: {
                  transition: {
                    start: parseFloat(v) || 0,
                    end: event.value.transition.end,
                    easing: event.value.transition.easing,
                  },
                },
              })
            }
            step="0.1"
          />
          <Field
            label="End val"
            value={endVal}
            onChange={(v) =>
              editEvent(lineIndex, eventIndex, {
                value: {
                  transition: {
                    start: event.value.transition.start,
                    end: parseFloat(v) || 0,
                    easing: event.value.transition.easing,
                  },
                },
              })
            }
            step="0.1"
          />
          <SelectField
            label="Easing"
            value={typeof event.value.transition.easing === "string" ? event.value.transition.easing : "linear"}
            options={EASING_OPTIONS}
            onChange={(v) =>
              editEvent(lineIndex, eventIndex, {
                value: {
                  transition: {
                    start: event.value.transition.start,
                    end: event.value.transition.end,
                    easing: v as EasingType,
                  },
                },
              })
            }
          />
        </>
      ) : (
        <Field
          label="Value"
          value={startVal}
          onChange={(v) =>
            editEvent(lineIndex, eventIndex, { value: { constant: parseFloat(v) || 0 } })
          }
          step="0.1"
        />
      )}
    </div>
  );
}

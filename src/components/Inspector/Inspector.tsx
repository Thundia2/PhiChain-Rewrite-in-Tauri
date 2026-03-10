import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import type { Note, LineEvent, Beat, NoteKind, EasingType } from "../../types/chart";
import { beatToFloat, floatToBeat } from "../../types/chart";
import { Field, SelectField, BeatField, EASING_OPTIONS } from "../common/FormFields";

const NOTE_KIND_OPTIONS = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

function getEasingName(easing: EasingType): string {
  if (typeof easing === "string") return easing;
  if ("custom" in easing) return `bezier(${easing.custom.join(",")})`;
  if ("steps" in easing) return `steps(${easing.steps})`;
  if ("elastic" in easing) return `elastic(${easing.elastic})`;
  return "unknown";
}

function NoteInspector({ note, lineIndex, noteIndex }: { note: Note; lineIndex: number; noteIndex: number }) {
  const editNote = useChartStore((s) => s.editNote);

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Note #{noteIndex}
      </div>
      <SelectField
        label="Kind"
        value={note.kind}
        options={NOTE_KIND_OPTIONS}
        onChange={(v) => editNote(lineIndex, noteIndex, { kind: v as NoteKind })}
      />
      <BeatField
        label="Beat"
        beat={note.beat}
        onChange={(b) => editNote(lineIndex, noteIndex, { beat: b })}
      />
      <Field
        label="X"
        value={note.x}
        onChange={(v) => editNote(lineIndex, noteIndex, { x: parseFloat(v) || 0 })}
        step="1"
      />
      <Field
        label="Speed"
        value={note.speed}
        onChange={(v) => editNote(lineIndex, noteIndex, { speed: parseFloat(v) || 1 })}
        step="0.1"
      />
      <SelectField
        label="Side"
        value={note.above ? "above" : "below"}
        options={[
          { value: "above", label: "Above" },
          { value: "below", label: "Below" },
        ]}
        onChange={(v) => editNote(lineIndex, noteIndex, { above: v === "above" })}
      />
      {note.kind === "hold" && note.hold_beat && (
        <BeatField
          label="Hold"
          beat={note.hold_beat}
          onChange={(b) => editNote(lineIndex, noteIndex, { hold_beat: b })}
        />
      )}
      <div className="mt-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>RPE Properties</div>
      <Field
        label="Size"
        value={note.size ?? 1}
        onChange={(v) => {
          const val = parseFloat(v);
          editNote(lineIndex, noteIndex, { size: val === 1 ? undefined : val || 1 });
        }}
        step="0.1"
      />
      <Field
        label="Alpha"
        value={note.alpha ?? 255}
        onChange={(v) => {
          const val = parseInt(v);
          editNote(lineIndex, noteIndex, { alpha: val === 255 ? undefined : Math.max(0, Math.min(255, val || 255)) });
        }}
        step="1"
      />
      <Field
        label="Vis. Time"
        value={note.visible_time ?? 999999}
        onChange={(v) => {
          const val = parseFloat(v);
          editNote(lineIndex, noteIndex, { visible_time: val === 999999 ? undefined : val || 999999 });
        }}
        step="0.5"
      />
      <SelectField
        label="Fake"
        value={note.fake ? "true" : "false"}
        options={[
          { value: "false", label: "No" },
          { value: "true", label: "Yes" },
        ]}
        onChange={(v) => editNote(lineIndex, noteIndex, { fake: v === "true" ? true : undefined })}
      />
    </div>
  );
}

function EventInspectorPanel({ event, lineIndex, eventIndex }: { event: LineEvent; lineIndex: number; eventIndex: number }) {
  const editEvent = useChartStore((s) => s.editEvent);

  const isTransition = "transition" in event.value;
  const startVal = isTransition ? event.value.transition.start : event.value.constant;
  const endVal = isTransition ? event.value.transition.end : event.value.constant;

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Event #{eventIndex} ({event.kind})
      </div>
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
          <Field
            label="Ease L"
            value={event.easing_left ?? 0}
            onChange={(v) => editEvent(lineIndex, eventIndex, { easing_left: parseFloat(v) || 0 })}
            step="0.05"
          />
          <Field
            label="Ease R"
            value={event.easing_right ?? 1}
            onChange={(v) => editEvent(lineIndex, eventIndex, { easing_right: parseFloat(v) || 1 })}
            step="0.05"
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

function LineInspector({ lineIndex }: { lineIndex: number }) {
  const line = useChartStore((s) => s.chart.lines[lineIndex]);
  const editLine = useChartStore((s) => s.editLine);

  if (!line) return null;

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Line #{lineIndex}
      </div>
      <Field
        label="Name"
        type="text"
        value={line.name}
        onChange={(v) => editLine(lineIndex, { name: v })}
      />
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {line.notes.length} notes, {line.events.length} events
        {line.event_layers && line.event_layers.length > 0 ? `, ${line.event_layers.length} layers` : ""}
      </div>
      <div className="mt-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>RPE Properties</div>
      <Field
        label="Z Order"
        value={line.z_order ?? 0}
        onChange={(v) => {
          const val = parseInt(v);
          editLine(lineIndex, { z_order: val === 0 ? undefined : val });
        }}
        step="1"
      />
      <SelectField
        label="Is Cover"
        value={line.is_cover === false ? "false" : "true"}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        onChange={(v) => editLine(lineIndex, { is_cover: v === "false" ? false : undefined })}
      />
      <Field
        label="BPM Factor"
        value={line.bpm_factor ?? 1}
        onChange={(v) => {
          const val = parseFloat(v);
          editLine(lineIndex, { bpm_factor: val === 1 ? undefined : val || 1 });
        }}
        step="0.1"
      />
      <Field
        label="Group"
        value={line.group ?? 0}
        onChange={(v) => {
          const val = parseInt(v);
          editLine(lineIndex, { group: val === 0 ? undefined : val });
        }}
        step="1"
      />
      <Field
        label="Texture"
        type="text"
        value={line.texture ?? ""}
        onChange={(v) => editLine(lineIndex, { texture: v || undefined })}
      />
      <SelectField
        label="Rot w/ Father"
        value={line.rotate_with_father === false ? "false" : "true"}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        onChange={(v) => editLine(lineIndex, { rotate_with_father: v === "false" ? false : undefined })}
      />
      <Field
        label="Father Idx"
        value={line.father_index ?? -1}
        onChange={(v) => {
          const val = parseInt(v);
          editLine(lineIndex, { father_index: val === -1 ? undefined : val });
        }}
        step="1"
      />
    </div>
  );
}

function MultiNoteInspector({ count, lineIndex, indices }: { count: number; lineIndex: number; indices: number[] }) {
  const editNotes = useChartStore((s) => s.editNotes);

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        {count} notes selected
      </div>
      <SelectField
        label="Kind"
        value=""
        options={[{ value: "", label: "(mixed)" }, ...NOTE_KIND_OPTIONS]}
        onChange={(v) => {
          if (v) editNotes(lineIndex, indices, { kind: v as NoteKind });
        }}
      />
      <SelectField
        label="Side"
        value=""
        options={[
          { value: "", label: "(mixed)" },
          { value: "above", label: "Above" },
          { value: "below", label: "Below" },
        ]}
        onChange={(v) => {
          if (v) editNotes(lineIndex, indices, { above: v === "above" });
        }}
      />
      <div className="mt-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>RPE Properties</div>
      <Field
        label="Size"
        type="text"
        value=""
        onChange={(v) => {
          const val = parseFloat(v);
          if (!isNaN(val)) editNotes(lineIndex, indices, { size: val === 1 ? undefined : val || 1 });
        }}
      />
      <Field
        label="Alpha"
        type="text"
        value=""
        onChange={(v) => {
          const val = parseInt(v);
          if (!isNaN(val)) editNotes(lineIndex, indices, { alpha: val === 255 ? undefined : Math.max(0, Math.min(255, val)) });
        }}
      />
      <Field
        label="Vis. Time"
        type="text"
        value=""
        onChange={(v) => {
          const val = parseFloat(v);
          if (!isNaN(val)) editNotes(lineIndex, indices, { visible_time: val === 999999 ? undefined : val || 999999 });
        }}
      />
      <SelectField
        label="Fake"
        value=""
        options={[
          { value: "", label: "(mixed)" },
          { value: "false", label: "No" },
          { value: "true", label: "Yes" },
        ]}
        onChange={(v) => {
          if (v) editNotes(lineIndex, indices, { fake: v === "true" ? true : undefined });
        }}
      />
    </div>
  );
}

export function Inspector() {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);
  const chart = useChartStore((s) => s.chart);

  if (selectedLineIndex === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          No line selected
        </span>
      </div>
    );
  }

  const line = chart.lines[selectedLineIndex];
  if (!line) return null;

  // Single note selected
  if (selectedNoteIndices.length === 1) {
    const note = line.notes[selectedNoteIndices[0]];
    if (note) {
      return (
        <div className="overflow-y-auto h-full">
          <NoteInspector
            note={note}
            lineIndex={selectedLineIndex}
            noteIndex={selectedNoteIndices[0]}
          />
        </div>
      );
    }
  }

  // Multiple notes selected
  if (selectedNoteIndices.length > 1) {
    return (
      <div className="overflow-y-auto h-full">
        <MultiNoteInspector
          count={selectedNoteIndices.length}
          lineIndex={selectedLineIndex}
          indices={selectedNoteIndices}
        />
      </div>
    );
  }

  // Single event selected
  if (selectedEventIndices.length === 1) {
    const event = line.events[selectedEventIndices[0]];
    if (event) {
      return (
        <div className="overflow-y-auto h-full">
          <EventInspectorPanel
            event={event}
            lineIndex={selectedLineIndex}
            eventIndex={selectedEventIndices[0]}
          />
        </div>
      );
    }
  }

  // Multiple events selected
  if (selectedEventIndices.length > 1) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {selectedEventIndices.length} events selected
        </span>
      </div>
    );
  }

  // Nothing selected — show line info
  return (
    <div className="overflow-y-auto h-full">
      <LineInspector lineIndex={selectedLineIndex} />
    </div>
  );
}

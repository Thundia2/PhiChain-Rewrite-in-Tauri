// ============================================================
// Floating Mini-Inspector
//
// Compact property popover that appears near the selection point
// on the canvas. Shows the most relevant fields for quick editing
// without opening the full sidebar inspector.
//
// Dismissal: Escape, click outside, tool change, playback start.
// ============================================================

import { useEffect, useRef } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { Field, SelectField, safeParseNumber } from "../common/FormFields";
import type { NoteKind, Line } from "../../types/chart";

const NOTE_KIND_OPTIONS = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

export function FloatingInspector() {
  const inspector = useEditorStore((s) => s.floatingInspector);
  const hide = useEditorStore((s) => s.hideFloatingInspector);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);
  const editNote = useChartStore((s) => s.editNote);
  const editNotes = useChartStore((s) => s.editNotes);
  const editEvent = useChartStore((s) => s.editEvent);
  const lines = useChartStore((s) => s.chart.lines);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on Escape
  useEffect(() => {
    if (!inspector) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [inspector, hide]);

  // Dismiss on click outside
  useEffect(() => {
    if (!inspector) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        hide();
      }
    };
    // Delay to avoid dismissing from the click that opened it
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [inspector, hide]);

  // Dismiss on playback start
  useEffect(() => {
    if (isPlaying) hide();
  }, [isPlaying, hide]);

  if (!inspector || selectedLineIndex === null) return null;

  const line = lines[selectedLineIndex];
  if (!line) return null;

  // Clamp position to screen bounds
  const x = Math.min(inspector.screenX, window.innerWidth - 220);
  const y = Math.min(inspector.screenY, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 10000,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        padding: 10,
        minWidth: 200,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {inspector.targetType === "note" && (
        <SingleNoteInspector
          line={line}
          lineIndex={selectedLineIndex}
          noteIndex={selectedNoteIndices[0]}
          editNote={editNote}
        />
      )}
      {inspector.targetType === "multi_note" && (
        <MultiNoteInspector
          noteCount={selectedNoteIndices.length}
          lineIndex={selectedLineIndex}
          noteIndices={selectedNoteIndices}
          editNotes={editNotes}
          line={line}
        />
      )}
      {inspector.targetType === "event" && (
        <SingleEventInspector
          line={line}
          lineIndex={selectedLineIndex}
          eventIndex={selectedEventIndices[0]}
          editEvent={editEvent}
        />
      )}
      {inspector.targetType === "multi_event" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {selectedEventIndices.length} events selected
        </div>
      )}
    </div>
  );
}

function SingleNoteInspector({
  line,
  lineIndex,
  noteIndex,
  editNote,
}: {
  line: Line;
  lineIndex: number;
  noteIndex: number;
  editNote: (lineIndex: number, noteIndex: number, changes: Record<string, unknown>) => void;
}) {
  const note = line.notes[noteIndex];
  if (!note) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--text-primary)", marginBottom: 2 }}>
        Note #{noteIndex}
      </div>
      <SelectField
        label="Kind"
        value={note.kind}
        options={NOTE_KIND_OPTIONS}
        onChange={(v) => {
          const changes: Record<string, unknown> = { kind: v as NoteKind };
          if (v === "hold" && !note.hold_beat) {
            changes.hold_beat = [1, 0, 1];
          }
          editNote(lineIndex, noteIndex, changes);
        }}
      />
      <Field
        label="X"
        value={note.x}
        onChange={(v) => {
          const n = safeParseNumber(v);
          if (n !== null) editNote(lineIndex, noteIndex, { x: Math.round(n) });
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", width: 40 }}>Side</span>
        <button
          onClick={() => editNote(lineIndex, noteIndex, { above: !note.above })}
          style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "none",
            background: note.above ? "#22c55e30" : "#ef444430",
            color: note.above ? "#4ade80" : "#f87171",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {note.above ? "Above" : "Below"}
        </button>
      </div>
    </div>
  );
}

function MultiNoteInspector({
  noteCount,
  lineIndex,
  noteIndices,
  editNotes,
  line,
}: {
  noteCount: number;
  lineIndex: number;
  noteIndices: number[];
  editNotes: (lineIndex: number, noteIndices: number[], changes: Record<string, unknown>) => void;
  line: Line;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--text-primary)" }}>
        {noteCount} notes selected
      </div>
      <SelectField
        label="Set Kind"
        value=""
        options={[{ value: "", label: "— Set all —" }, ...NOTE_KIND_OPTIONS]}
        onChange={(v) => {
          if (v) editNotes(lineIndex, noteIndices, { kind: v as NoteKind });
        }}
      />
      <button
        onClick={() => {
          const allAbove = noteIndices.every((i) => line.notes[i]?.above);
          editNotes(lineIndex, noteIndices, { above: !allAbove });
        }}
        style={{
          fontSize: 10, padding: "4px 8px", borderRadius: 3, border: "none",
          background: "var(--bg-active)", color: "var(--text-primary)",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Flip All Above/Below
      </button>
    </div>
  );
}

function SingleEventInspector({
  line,
  lineIndex,
  eventIndex,
  editEvent,
}: {
  line: Line;
  lineIndex: number;
  eventIndex: number;
  editEvent: (lineIndex: number, eventIndex: number, changes: Record<string, unknown>) => void;
}) {
  const event = line.events[eventIndex];
  if (!event) return null;

  // Extract typed transition/constant values for type-safe JSX access
  const transValue = event.value && "transition" in event.value ? event.value.transition : null;
  const constValue = event.value && "constant" in event.value ? event.value.constant : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--text-primary)", marginBottom: 2 }}>
        {event.kind} event
      </div>
      {transValue ? (
        <>
          <Field
            label="Start"
            value={transValue.start}
            onChange={(v) => {
              const n = safeParseNumber(v);
              if (n !== null) {
                editEvent(lineIndex, eventIndex, {
                  value: { transition: { ...transValue, start: n } },
                });
              }
            }}
            step="0.1"
          />
          <Field
            label="End"
            value={transValue.end}
            onChange={(v) => {
              const n = safeParseNumber(v);
              if (n !== null) {
                editEvent(lineIndex, eventIndex, {
                  value: { transition: { ...transValue, end: n } },
                });
              }
            }}
            step="0.1"
          />
        </>
      ) : (
        <Field
          label="Value"
          value={constValue ?? 0}
          onChange={(v) => {
            const n = safeParseNumber(v);
            if (n !== null) {
              editEvent(lineIndex, eventIndex, { value: { constant: n } });
            }
          }}
          step="0.1"
        />
      )}
    </div>
  );
}

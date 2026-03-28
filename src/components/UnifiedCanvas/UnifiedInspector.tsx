// ============================================================
// Unified Inspector — Collapsible right sidebar
//
// 210px wide, context-sensitive property panel for the unified editor.
// Shows: current evaluated values, line/note/event properties, layer selector.
// ============================================================

import { useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { BpmList } from "../../utils/bpmList";
import { evaluateLineEventsWithLayers } from "../../canvas/events";
import type { Note, LineEvent, NoteKind, EasingType, LineEventKind } from "../../types/chart";
import { Field, SelectField, BeatField, EASING_OPTIONS } from "../common/FormFields";
import { BatchNoteOps } from "../common/BatchNoteOps";
import { EVENT_COLORS } from "../../constants/eventColors";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { BOOKMARK_PRESETS } from "../../types/bookmark";
import type { BookmarkPreset } from "../../types/bookmark";

// ============================================================
// Constants
// ============================================================

const NOTE_KIND_OPTIONS = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

const VALUE_PROPS: { key: string; kind: LineEventKind; label: string }[] = [
  { key: "x", kind: "x", label: "X" },
  { key: "y", kind: "y", label: "Y" },
  { key: "rotation", kind: "rotation", label: "R" },
  { key: "opacity", kind: "opacity", label: "O" },
  { key: "speed", kind: "speed", label: "S" },
];

// ============================================================
// Sub-components (inline, matching mockup style)
// ============================================================

function SectionHeader({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: color || "var(--accent-primary)",
        marginBottom: 6,
        fontFamily: "inherit",
      }}
    >
      {children}
    </div>
  );
}

function NoteSection({ note, lineIndex, noteIndex }: { note: Note; lineIndex: number; noteIndex: number }) {
  const editNote = useChartStore((s) => s.editNote);

  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>Note #{noteIndex}</SectionHeader>
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
      <Field label="X" value={note.x} onChange={(v) => editNote(lineIndex, noteIndex, { x: parseFloat(v) })} step="1" />
      <Field label="Speed" value={note.speed} onChange={(v) => editNote(lineIndex, noteIndex, { speed: parseFloat(v) || 1 })} step="0.1" />
      <SelectField
        label="Side"
        value={note.above ? "above" : "below"}
        options={[{ value: "above", label: "Above" }, { value: "below", label: "Below" }]}
        onChange={(v) => editNote(lineIndex, noteIndex, { above: v === "above" })}
      />
      {note.kind === "hold" && note.hold_beat && (
        <BeatField label="Hold" beat={note.hold_beat} onChange={(b) => editNote(lineIndex, noteIndex, { hold_beat: b })} />
      )}
      <div style={{ height: 1, background: "var(--border-color)", margin: "8px 0" }} />
      <SectionHeader color="var(--text-muted)">RPE Properties</SectionHeader>
      <Field label="Size" value={note.size ?? 1} onChange={(v) => { const val = parseFloat(v); editNote(lineIndex, noteIndex, { size: val === 1 ? undefined : val || 1 }); }} step="0.1" />
      <Field label="Alpha" value={note.alpha ?? 255} onChange={(v) => { const val = parseInt(v); editNote(lineIndex, noteIndex, { alpha: val === 255 ? undefined : Math.max(0, Math.min(255, val || 255)) }); }} step="1" />
      <Field label="Vis. Time" value={note.visible_time ?? 999999} onChange={(v) => { const val = parseFloat(v); editNote(lineIndex, noteIndex, { visible_time: val === 999999 ? undefined : isNaN(val) ? 999999 : val }); }} step="0.5" />
      <SelectField
        label="Fake"
        value={note.fake ? "true" : "false"}
        options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]}
        onChange={(v) => editNote(lineIndex, noteIndex, { fake: v === "true" ? true : undefined })}
      />
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 10, color: "var(--text-muted)", cursor: "pointer" }}>
          Advanced Properties
        </summary>
        <div style={{ marginTop: 6 }}>
          <Field label="Y Offset" value={note.y_offset ?? 0} onChange={(v) => {
            const val = parseFloat(v);
            editNote(lineIndex, noteIndex, { y_offset: val === 0 ? undefined : isNaN(val) ? undefined : val });
          }} step="0.1" />
          <Field label="Judge Area" value={note.judge_area ?? 1} onChange={(v) => {
            const val = parseFloat(v);
            editNote(lineIndex, noteIndex, { judge_area: val === 1 ? undefined : isNaN(val) ? undefined : val });
          }} step="0.1" />
          <Field label="Hit Sound" value={note.hitsound ?? ""} type="text" onChange={(v) => {
            editNote(lineIndex, noteIndex, { hitsound: v || undefined });
          }} />
        </div>
      </details>
    </div>
  );
}

function MultiNoteSection({ count, lineIndex, indices }: { count: number; lineIndex: number; indices: number[] }) {
  const editNotes = useChartStore((s) => s.editNotes);

  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>{count} Notes Selected</SectionHeader>
      <SelectField label="Kind" value="" options={[{ value: "", label: "(mixed)" }, ...NOTE_KIND_OPTIONS]} onChange={(v) => { if (v) editNotes(lineIndex, indices, { kind: v as NoteKind }); }} />
      <SelectField label="Side" value="" options={[{ value: "", label: "(mixed)" }, { value: "above", label: "Above" }, { value: "below", label: "Below" }]} onChange={(v) => { if (v) editNotes(lineIndex, indices, { above: v === "above" }); }} />
    </div>
  );
}

function EventSection({ event, lineIndex, eventIndex }: { event: LineEvent; lineIndex: number; eventIndex: number }) {
  const editEvent = useChartStore((s) => s.editEvent);
  const isTransition = "transition" in event.value;
  const tv = isTransition ? (event.value as { transition: { start: number; end: number; easing: EasingType } }).transition : null;
  const cv = !isTransition ? (event.value as { constant: number }).constant : null;
  const startVal = tv ? tv.start : cv!;
  const endVal = tv ? tv.end : cv!;
  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>Event #{eventIndex} — {event.kind.toUpperCase()}</SectionHeader>
      <BeatField label="Start" beat={event.start_beat} onChange={(b) => editEvent(lineIndex, eventIndex, { start_beat: b })} />
      <BeatField label="End" beat={event.end_beat} onChange={(b) => editEvent(lineIndex, eventIndex, { end_beat: b })} />
      <SelectField
        label="Type"
        value={isTransition ? "transition" : "constant"}
        options={[{ value: "transition", label: "Transition" }, { value: "constant", label: "Constant" }]}
        onChange={(v) => {
          if (v === "constant") editEvent(lineIndex, eventIndex, { value: { constant: startVal } });
          else editEvent(lineIndex, eventIndex, { value: { transition: { start: startVal, end: endVal, easing: "linear" } } });
        }}
      />
      {isTransition && tv ? (
        <>
          <Field label="Start val" value={startVal} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { transition: { start: parseFloat(v), end: tv.end, easing: tv.easing } } })} step="0.1" />
          <Field label="End val" value={endVal} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { transition: { start: tv.start, end: parseFloat(v), easing: tv.easing } } })} step="0.1" />
          <SelectField
            label="Easing"
            value={typeof tv.easing === "string" ? tv.easing : "linear"}
            options={EASING_OPTIONS}
            onChange={(v) => editEvent(lineIndex, eventIndex, { value: { transition: { start: tv.start, end: tv.end, easing: v as EasingType } } })}
          />
          <Field label="Ease L" value={event.easing_left ?? 0} onChange={(v) => editEvent(lineIndex, eventIndex, { easing_left: parseFloat(v) })} step="0.05" />
          <Field label="Ease R" value={event.easing_right ?? 1} onChange={(v) => editEvent(lineIndex, eventIndex, { easing_right: parseFloat(v) || 1 })} step="0.05" />
        </>
      ) : (
        <Field label="Value" value={startVal} onChange={(v) => editEvent(lineIndex, eventIndex, { value: { constant: parseFloat(v) } })} step="0.1" />
      )}
    </div>
  );
}

function LineSection({ lineIndex }: { lineIndex: number }) {
  const line = useChartStore((s) => s.chart.lines[lineIndex]);
  const editLine = useChartStore((s) => s.editLine);

  if (!line) return null;

  const fields: [string, string | number][] = [
    ["Name", line.name || `Line ${lineIndex}`],
    ["z_order", String(line.z_order ?? 0)],
    ["is_cover", line.is_cover === false ? "false" : "true"],
    ["bpm_factor", String(line.bpm_factor ?? 1.0)],
    ["father", line.father_index != null ? String(line.father_index) : "none"],
    ["group", String(line.group ?? 0)],
  ];

  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>Line #{lineIndex}</SectionHeader>
      {fields.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
          <span style={{ width: 70, color: "#666", fontSize: 10 }}>{k}</span>
          <div
            style={{
              flex: 1,
              background: "var(--bg-tertiary, #1a1a22)",
              borderRadius: 5,
              padding: "2px 6px",
              color: "#bbb",
              fontSize: 10,
              border: "1px solid var(--border-color)",
            }}
          >
            {v}
          </div>
        </div>
      ))}
      <div style={{ height: 1, background: "var(--border-color)", margin: "8px 0" }} />
      <SectionHeader color="var(--text-muted)">Editable</SectionHeader>
      <Field label="Name" type="text" value={line.name} onChange={(v) => editLine(lineIndex, { name: v })} />
      <Field label="Z Order" value={line.z_order ?? 0} onChange={(v) => editLine(lineIndex, { z_order: parseInt(v) === 0 ? undefined : parseInt(v) })} step="1" />
      <Field label="BPM Fac." value={line.bpm_factor ?? 1} onChange={(v) => { const val = parseFloat(v); editLine(lineIndex, { bpm_factor: val === 1 ? undefined : val || 1 }); }} step="0.1" />
      <Field label="Father" value={line.father_index ?? -1} onChange={(v) => { const val = parseInt(v); editLine(lineIndex, { father_index: val === -1 ? undefined : val }); }} step="1" />
      <SelectField
        label="Attach UI"
        value={line.attach_ui ?? ""}
        options={[
          { value: "", label: "None" },
          { value: "pause", label: "Pause button" },
          { value: "combonumber", label: "Combo number" },
          { value: "combo", label: "Combo label" },
          { value: "score", label: "Score" },
          { value: "bar", label: "Progress bar" },
          { value: "name", label: "Song name" },
          { value: "level", label: "Level label" },
        ]}
        onChange={(v) => editLine(lineIndex, { attach_ui: v || undefined })}
      />
      <SelectField
        label="Is GIF"
        value={line.is_gif ? "true" : "false"}
        options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]}
        onChange={(v) => editLine(lineIndex, { is_gif: v === "true" ? true : undefined })}
      />
    </div>
  );
}

// ============================================================
// Bookmark Inspector Sections
// ============================================================

const PRESET_ENTRIES = Object.entries(BOOKMARK_PRESETS) as [BookmarkPreset, string][];

function PresetDots({ activePreset, onSelect }: { activePreset?: BookmarkPreset; onSelect: (p: BookmarkPreset) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
      {PRESET_ENTRIES.map(([preset, color]) => (
        <button
          key={preset}
          onClick={() => onSelect(preset)}
          title={preset}
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: activePreset === preset ? "2px solid #fff" : "2px solid transparent",
            background: color,
            cursor: "pointer",
            padding: 0,
            outline: "none",
          }}
        />
      ))}
    </div>
  );
}

function BookmarkSection({ bookmarkId }: { bookmarkId: string }) {
  const bookmark = useBookmarkStore((s) => s.bookmarks.find((b) => b.id === bookmarkId));
  if (!bookmark) return null;

  const store = useBookmarkStore.getState();

  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>Marker</SectionHeader>
      <PresetDots
        activePreset={bookmark.preset}
        onSelect={(p) => store.setBookmarkColor(bookmarkId, p)}
      />
      <BeatField
        label="Beat"
        beat={bookmark.beat}
        onChange={(v) => store.updateBookmark(bookmarkId, { beat: v })}
      />
      <Field
        label="X"
        value={bookmark.x}
        onChange={(v) => store.updateBookmark(bookmarkId, { x: parseInt(v) })}
        step="1"
      />
      <SelectField
        label="Side"
        value={bookmark.above ? "above" : "below"}
        options={[{ value: "above", label: "Above" }, { value: "below", label: "Below" }]}
        onChange={(v) => store.updateBookmark(bookmarkId, { above: v === "above" })}
      />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <button
          onClick={() => store.convertToNotes([bookmarkId])}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            fontSize: 9,
            fontWeight: 600,
            background: "var(--accent-primary)",
            color: "#fff",
            fontFamily: "inherit",
          }}
        >
          Convert to Note
        </button>
        <button
          onClick={() => store.removeBookmark(bookmarkId)}
          style={{
            padding: "4px 8px",
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            fontSize: 9,
            fontWeight: 500,
            background: "rgba(255, 80, 80, 0.15)",
            color: "#ff5050",
            fontFamily: "inherit",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function MultiBookmarkSection({ ids }: { ids: string[] }) {
  const store = useBookmarkStore.getState();

  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)" }}>
      <SectionHeader>{ids.length} Markers Selected</SectionHeader>
      <PresetDots
        onSelect={(p) => {
          for (const id of ids) store.setBookmarkColor(id, p);
        }}
      />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <button
          onClick={() => store.convertToNotes(ids)}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            fontSize: 9,
            fontWeight: 600,
            background: "var(--accent-primary)",
            color: "#fff",
            fontFamily: "inherit",
          }}
        >
          Convert All to Notes
        </button>
        <button
          onClick={() => store.deleteSelected()}
          style={{
            padding: "4px 8px",
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            fontSize: 9,
            fontWeight: 500,
            background: "rgba(255, 80, 80, 0.15)",
            color: "#ff5050",
            fontFamily: "inherit",
          }}
        >
          Delete All
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function UnifiedInspector() {
  const inspectorOpen = useEditorStore((s) => s.unifiedInspectorOpen);
  const toggleInspector = useEditorStore((s) => s.toggleUnifiedInspector);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);
  const activeLayer = useEditorStore((s) => s.eventEditorActiveLayer);
  const setActiveLayer = useEditorStore((s) => s.setEventEditorActiveLayer);
  const chart = useChartStore((s) => s.chart);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const selectedBookmarkIds = useBookmarkStore((s) => s.selectedBookmarkIds);

  const line = selectedLineIndex !== null ? chart.lines[selectedLineIndex] : null;
  const hasLayers = line?.event_layers != null && line.event_layers.length > 0;

  // Compute current evaluated values
  const evalValues = useMemo(() => {
    if (!line) return null;
    try {
      const { currentTime } = useAudioStore.getState();
      const cs = useChartStore.getState();
      const bpmList = new BpmList(cs.chart.bpm_list);
      const time = currentTime - cs.chart.offset;
      const state = evaluateLineEventsWithLayers(line.events, line.event_layers, bpmList.beatAtFloat(time));
      return state;
    } catch {
      return null;
    }
  }, [line, isPlaying, selectedLineIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentBeat = useMemo(() => {
    try {
      const { currentTime } = useAudioStore.getState();
      const cs = useChartStore.getState();
      const bpmList = new BpmList(cs.chart.bpm_list);
      return bpmList.beatAtFloat(currentTime - cs.chart.offset);
    } catch {
      return 0;
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        width: inspectorOpen ? 220 : 0,
        overflow: "hidden",
        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        borderLeft: inspectorOpen ? "1px solid var(--border-color)" : "none",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 220, display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--text-secondary, #888)", fontSize: 10, letterSpacing: 0.8 }}>
            INSPECTOR
          </span>
          <button
            onClick={toggleInspector}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Current Values section */}
          {line && (
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-color)" }}>
              <SectionHeader>Current Values</SectionHeader>
              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 6, fontFamily: "var(--font-mono, monospace)" }}>
                Beat {currentBeat.toFixed(2)}
              </div>
              {VALUE_PROPS.map(({ kind, label }) => {
                const val = evalValues
                  ? kind === "x" ? evalValues.x
                    : kind === "y" ? evalValues.y
                    : kind === "rotation" ? (evalValues.rotation * 180 / Math.PI)
                    : kind === "opacity" ? (evalValues.opacity * 255)
                    : kind === "speed" ? 1 // speed isn't in LineState directly
                    : 0
                  : 0;
                return (
                  <div key={kind} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        background: EVENT_COLORS[kind] || "#888",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ width: 14, fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>{val.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Context-sensitive content */}
          {selectedLineIndex === null && (
            <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 11 }}>
              No line selected
            </div>
          )}

          {selectedLineIndex !== null && selectedNoteIndices.length === 1 && line && (
            <NoteSection
              note={line.notes[selectedNoteIndices[0]]}
              lineIndex={selectedLineIndex}
              noteIndex={selectedNoteIndices[0]}
            />
          )}

          {selectedLineIndex !== null && selectedNoteIndices.length > 1 && (
            <>
              <MultiNoteSection
                count={selectedNoteIndices.length}
                lineIndex={selectedLineIndex}
                indices={selectedNoteIndices}
              />
              <BatchNoteOps />
            </>
          )}

          {selectedLineIndex !== null && selectedNoteIndices.length === 0 && selectedEventIndices.length === 1 && line && (
            <EventSection
              event={line.events[selectedEventIndices[0]]}
              lineIndex={selectedLineIndex}
              eventIndex={selectedEventIndices[0]}
            />
          )}

          {selectedLineIndex !== null && selectedNoteIndices.length === 0 && selectedEventIndices.length > 1 && (
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)" }}>
              <SectionHeader>{selectedEventIndices.length} Events Selected</SectionHeader>
            </div>
          )}

          {selectedBookmarkIds.length === 1 && (
            <BookmarkSection bookmarkId={selectedBookmarkIds[0]} />
          )}

          {selectedBookmarkIds.length > 1 && (
            <MultiBookmarkSection ids={selectedBookmarkIds} />
          )}

          {selectedLineIndex !== null && selectedNoteIndices.length === 0 && selectedEventIndices.length === 0 && (
            <LineSection lineIndex={selectedLineIndex} />
          )}

          {/* Layer selector */}
          {hasLayers && (
            <div style={{ padding: "8px 12px" }}>
              <SectionHeader color="var(--text-muted)">Event Layer</SectionHeader>
              <div style={{ display: "flex", gap: 3 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <button
                    key={i}
                    onClick={() => setActiveLayer(i)}
                    style={{
                      padding: "2px 6px",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 9,
                      fontWeight: 500,
                      transition: "all 0.15s",
                      background: activeLayer === i ? "var(--accent-primary)" : "var(--bg-active)",
                      color: activeLayer === i ? "#fff" : "#666",
                      fontFamily: "inherit",
                    }}
                  >
                    L{i}
                  </button>
                ))}
                <button
                  onClick={() => setActiveLayer(-1)}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 9,
                    fontWeight: 500,
                    transition: "all 0.15s",
                    background: activeLayer === -1 ? "var(--accent-primary)" : "var(--bg-active)",
                    color: activeLayer === -1 ? "#fff" : "#666",
                    fontFamily: "inherit",
                  }}
                >
                  Flat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

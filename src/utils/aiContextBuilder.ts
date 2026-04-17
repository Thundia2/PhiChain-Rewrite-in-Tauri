// ============================================================
// AI Context Builder — Beat-aware chart state snapshot
//
// Builds a compact text description of the current chart that
// gets injected after the system prompt. Uses the playhead
// position and/or beat references from the user's prompt to
// focus the context window on the relevant beat range.
//
// Recent change: Major enhancement — added computed line
// positions at current beat, actual event transition values,
// hold note durations, selected note/event details, note
// density metrics, BPM-scaled context window, song metadata,
// and inter-line spatial info.
// ============================================================

import { useChartStore, getCachedBpmList } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { beatToFloat } from "../types/chart";
import type { LineEvent, LineEventValue, Note, EventLayer, EasingType } from "../types/chart";
import { evaluateLineEventsWithLayers } from "../canvas/events";
import type { LineState } from "../canvas/events";
import type { BpmList } from "./bpmList";
import { floatToBeat } from "../types/chart";

// ---- Activity classification (mirrors LineStrip.tsx logic) ----

type LineActivity = "active" | "coming-soon" | "inactive";

/** Seconds within which approaching notes make a line "active" */
const NOTE_APPROACH_WINDOW_SECONDS = 2.5;
/** Beats ahead to check for upcoming visibility */
const LOOKAHEAD_BEATS = 8;
/** Max event details per kind to avoid context bloat */
const MAX_EVENT_DETAILS_PER_KIND = 6;
/** Max selected notes/events to show individually */
const MAX_SELECTED_DETAIL = 8;

// ---- BPM-scaled context window ----

/**
 * Compute the context window size in beats based on the current BPM.
 * Higher BPM → fewer beats (so the time span stays reasonable).
 * Clamped to [8, 32] beats.
 */
function getContextWindowBeats(bpmList: BpmList, contextCenter: number): number {
  const beat = floatToBeat(contextCenter);
  const currentBPM = bpmList.bpmAtBeat(beat);
  // At 120 BPM → 16 beats. Scale inversely.
  return Math.max(8, Math.min(32, Math.round(16 * (120 / Math.max(currentBPM, 1)))));
}

// ---- Utility: easing type to readable string ----

/** Convert an EasingType to a human-readable string for the AI context */
function easingToString(easing: EasingType): string {
  if (typeof easing === "string") return easing;
  if (typeof easing === "object" && easing !== null) {
    // Custom bezier, step function, or elastic easing
    if ("custom" in easing) return "custom_bezier";
    if ("steps" in easing) return `steps(${(easing as { steps: number }).steps})`;
    if ("elastic" in easing) return "elastic";
  }
  return "custom";
}

// ---- Activity classification helpers ----

/** Binary search: first note index with beat >= targetBeat */
function lowerBoundNoteBeat(notes: Note[], targetBeat: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beatToFloat(notes[mid].beat) < targetBeat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Check if notes are approaching within the time window */
function hasNotesApproaching(
  notes: Note[], currentBeat: number, bpmList: BpmList,
): boolean {
  if (notes.length === 0) return false;
  const currentTime = bpmList.timeAtFloat(currentBeat);
  const windowStartBeat = bpmList.beatAtFloat(Math.max(0, currentTime - NOTE_APPROACH_WINDOW_SECONDS));
  const windowEndBeat = bpmList.beatAtFloat(currentTime + 0.1);
  const startIdx = lowerBoundNoteBeat(notes, windowStartBeat);
  for (let i = startIdx; i < notes.length; i++) {
    if (beatToFloat(notes[i].beat) > windowEndBeat) break;
    return true;
  }
  return false;
}

/** Get beat ranges where a line has opacity > 0 */
function getOpacityRanges(
  events: { kind: string; start_beat: [number, number, number]; end_beat: [number, number, number]; value: LineEventValue }[],
): { start: number; end: number }[] {
  const opacityEvents = events
    .filter((e) => e.kind === "opacity")
    .sort((a, b) => beatToFloat(a.start_beat) - beatToFloat(b.start_beat));
  if (opacityEvents.length === 0) return [];
  const ranges: { start: number; end: number }[] = [];
  let rangeStart: number | null = null;
  for (const event of opacityEvents) {
    const start = beatToFloat(event.start_beat);
    const end = beatToFloat(event.end_beat);
    let hasOpacity = false;
    if ("constant" in event.value) hasOpacity = event.value.constant > 0;
    else if ("transition" in event.value) hasOpacity = event.value.transition.start > 0 || event.value.transition.end > 0;
    if (hasOpacity) {
      if (rangeStart === null) rangeStart = start;
      if (ranges.length > 0 && ranges[ranges.length - 1].end >= start) {
        ranges[ranges.length - 1].end = Math.max(ranges[ranges.length - 1].end, end);
      } else {
        if (rangeStart !== null && ranges.length > 0) {
          ranges[ranges.length - 1].end = Math.max(ranges[ranges.length - 1].end, start);
        }
        ranges.push({ start, end });
      }
      rangeStart = null;
    } else {
      if (ranges.length > 0) {
        ranges[ranges.length - 1].end = Math.min(ranges[ranges.length - 1].end, end);
      }
      rangeStart = null;
    }
  }
  return ranges;
}

/**
 * Classify a line's activity at the given beat.
 * Mirrors the logic from LineStrip.tsx:classifyLine() but simplified
 * to just ACTIVE / COMING_SOON / INACTIVE for context building.
 */
function classifyLineActivity(
  events: LineEvent[],
  eventLayers: EventLayer[] | undefined,
  beat: number,
  notes: Note[],
  bpmList: BpmList,
): LineActivity {
  // Check opacity at current beat
  const state = evaluateLineEventsWithLayers(events, eventLayers, beat);
  if (state.opacity > 0) return "active";

  // Check if notes are approaching (falling on the line)
  if (hasNotesApproaching(notes, beat, bpmList)) return "active";

  // Check if visibility is coming soon (within LOOKAHEAD_BEATS)
  const ranges = getOpacityRanges(events);
  for (const range of ranges) {
    if (range.start > beat && range.start - beat <= LOOKAHEAD_BEATS) {
      return "coming-soon";
    }
  }

  return "inactive";
}

// ---- Beat extraction from user prompt ----

/**
 * Extract beat references from the user's prompt.
 * Looks for patterns like "beat 6", "from 10 to 20", "beats 6-11", etc.
 */
function extractBeatsFromPrompt(prompt: string, contextWindowBeats: number): { center: number; lo: number; hi: number } | null {
  const rangeMatch = prompt.match(/(?:beats?\s+)(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)/i)
    || prompt.match(/from\s+(\d+\.?\d*)\s+to\s+(\d+\.?\d*)/i);
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1]);
    const b = parseFloat(rangeMatch[2]);
    return { center: (a + b) / 2, lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const singleMatch = prompt.match(/(?:at\s+)?beat\s+(\d+\.?\d*)/i);
  if (singleMatch) {
    const beat = parseFloat(singleMatch[1]);
    return { center: beat, lo: beat - contextWindowBeats, hi: beat + contextWindowBeats };
  }
  return null;
}

// ---- Event value formatting helpers ----

/** Default baseline values for numeric event kinds */
const DEFAULT_VALUES: Record<string, number> = { x: 0, y: 0, rotation: 0, opacity: 255, speed: 1 };

/**
 * Format a single event into a readable string showing its actual values.
 * E.g., "0→300 ease_out_cubic (0.0-8.0)" or "constant 255 (0.0-999.0)"
 */
function formatEventDetail(evt: LineEvent, kind: string): string {
  const sb = beatToFloat(evt.start_beat).toFixed(1);
  const eb = beatToFloat(evt.end_beat).toFixed(1);

  if ("constant" in evt.value) {
    const val = (evt.value as { constant: number }).constant;
    // Check if this is a default baseline constant
    const spanStart = beatToFloat(evt.start_beat);
    const spanEnd = beatToFloat(evt.end_beat);
    if (kind in DEFAULT_VALUES && val === DEFAULT_VALUES[kind] && spanStart <= 0 && spanEnd >= 999) {
      return `constant ${val} (default, safe to override)`;
    }
    return `constant ${val} (${sb}-${eb})`;
  }
  if ("transition" in evt.value) {
    const t = (evt.value as { transition: { start: number; end: number; easing: EasingType } }).transition;
    return `${t.start}→${t.end} ${easingToString(t.easing)} (${sb}-${eb})`;
  }
  if ("color_constant" in evt.value) {
    const c = (evt.value as { color_constant: [number, number, number] }).color_constant;
    return `constant [${c.join(",")}] (${sb}-${eb})`;
  }
  if ("color_transition" in evt.value) {
    const ct = (evt.value as { color_transition: { start: [number, number, number]; end: [number, number, number]; easing: EasingType } }).color_transition;
    return `[${ct.start.join(",")}]→[${ct.end.join(",")}] ${easingToString(ct.easing)} (${sb}-${eb})`;
  }
  if ("text_value" in evt.value) {
    return `text "${(evt.value as { text_value: string }).text_value}" (${sb}-${eb})`;
  }
  return `(${sb}-${eb})`;
}

/** Format a note into a readable string */
function formatNote(note: Note): string {
  let desc = `${note.kind} at beat ${beatToFloat(note.beat).toFixed(3)}, x=${note.x.toFixed(0)}, above=${note.above}`;
  if (note.kind === "hold" && note.hold_beat) {
    desc += `, duration=${beatToFloat(note.hold_beat).toFixed(2)} beats`;
  }
  if (note.speed !== undefined && note.speed !== 1.0) {
    desc += `, speed=${note.speed}`;
  }
  if (note.fake) {
    desc += `, fake`;
  }
  return desc;
}

/** Format a LineState into a compact position string for the AI */
function formatLineState(state: LineState, beat: number): string {
  const rotDeg = (state.rotation * 180 / Math.PI).toFixed(1);
  const opacityInt = Math.round(state.opacity * 255);
  let s = `Position at beat ${beat.toFixed(1)}: x=${state.x.toFixed(1)}, y=${state.y.toFixed(1)}, rotation=${rotDeg}deg, opacity=${opacityInt}, speed=${state.speed.toFixed(1)}`;
  if (state.scale_x !== 1 || state.scale_y !== 1) {
    s += `, scale=(${state.scale_x.toFixed(2)},${state.scale_y.toFixed(2)})`;
  }
  if (state.color) {
    s += `, color=[${state.color.join(",")}]`;
  }
  return s;
}

/** Compact position string for active line summary */
function formatLinePositionCompact(state: LineState): string {
  const rotDeg = (state.rotation * 180 / Math.PI).toFixed(0);
  const opacityInt = Math.round(state.opacity * 255);
  return `pos=(${state.x.toFixed(0)},${state.y.toFixed(0)}) rot=${rotDeg}deg opa=${opacityInt}`;
}

// ---- Main context builder ----

/**
 * Build a context string describing the current chart state.
 * @param userMessage - Optional user prompt for extracting beat references
 */
export function buildAiContext(userMessage?: string): string {
  const cs = useChartStore.getState();
  const es = useEditorStore.getState();
  const chart = cs.chart;
  const bpmList = getCachedBpmList();
  const audioDuration = useAudioStore.getState().duration;

  // ---- Determine the context beat window (BPM-scaled) ----
  let contextCenter: number;
  let contextLo: number;
  let contextHi: number;

  // First pass: get a rough center to determine BPM for window scaling
  const currentTime = useAudioStore.getState().currentTime;
  const playheadBeat = bpmList.beatAtFloat(Math.max(0, currentTime - chart.offset));

  // Compute BPM-scaled window size based on playhead position
  const contextWindowBeats = getContextWindowBeats(bpmList, playheadBeat);

  const promptBeats = userMessage ? extractBeatsFromPrompt(userMessage, contextWindowBeats) : null;
  if (promptBeats) {
    contextCenter = promptBeats.center;
    contextLo = promptBeats.lo - contextWindowBeats;
    contextHi = promptBeats.hi + contextWindowBeats;
  } else {
    contextCenter = playheadBeat;
    contextLo = contextCenter - contextWindowBeats;
    contextHi = contextCenter + contextWindowBeats;
  }

  // ---- Pre-classify all lines and compute states for active lines ----
  const lineActivities: LineActivity[] = [];
  const lineStateCache = new Map<number, LineState>();

  for (let i = 0; i < chart.lines.length; i++) {
    const line = chart.lines[i];
    const activity = classifyLineActivity(line.events, line.event_layers, contextCenter, line.notes, bpmList);
    lineActivities.push(activity);
    // Cache computed state for active and coming-soon lines (and selected)
    if (activity !== "inactive" || i === es.selectedLineIndex) {
      lineStateCache.set(i, evaluateLineEventsWithLayers(line.events, line.event_layers, contextCenter));
    }
  }
  const activeCount = lineActivities.filter(a => a === "active").length;
  const comingSoonCount = lineActivities.filter(a => a === "coming-soon").length;

  const sections: string[] = [];

  // ---- Song metadata (B7) ----
  const meta = cs.meta;
  if (meta.name || meta.composer || meta.level) {
    let songLine = `Song: "${meta.name || "Untitled"}"`;
    if (meta.composer) songLine += ` by ${meta.composer}`;
    if (meta.level) songLine += ` | Level: ${meta.level}`;
    if (meta.charter) songLine += ` | Charter: ${meta.charter}`;
    sections.push(`## Song Info`);
    sections.push(songLine);
    if (audioDuration > 0) {
      const totalBeats = bpmList.beatAtFloat(audioDuration);
      sections.push(`Audio length: ${audioDuration.toFixed(0)}s (~${totalBeats.toFixed(0)} beats)`);
    }
  }

  // ---- Chart metadata ----
  sections.push(`\n## Current Chart State`);
  sections.push(`BPM: ${chart.bpm_list.map(b => `${b.bpm} at beat ${beatToFloat(b.beat)}`).join(", ")}`);
  sections.push(`Audio offset: ${chart.offset}s`);
  sections.push(`Total lines: ${chart.lines.length} (${activeCount} active${comingSoonCount > 0 ? `, ${comingSoonCount} coming soon` : ""} at current beat)`);
  sections.push(`Total notes: ${cs.totalNoteCount()} | Total events: ${cs.totalEventCount()}`);
  sections.push(`Context beat: ${contextCenter.toFixed(1)} (window: ${contextLo.toFixed(1)} to ${contextHi.toFixed(1)}, ±${contextWindowBeats} beats)`);

  // ---- Chart density (B5 — overall) ----
  if (audioDuration > 0 && cs.totalNoteCount() > 0) {
    const totalBeats = bpmList.beatAtFloat(audioDuration);
    if (totalBeats > 0) {
      sections.push(`Overall chart density: ${(cs.totalNoteCount() / totalBeats).toFixed(2)} notes/beat`);
    }
  }

  // ---- Selected line ----
  if (es.selectedLineIndex !== null && es.selectedLineIndex < chart.lines.length) {
    sections.push(`Selected line index: ${es.selectedLineIndex}`);
    sections.push(`Selected line name: "${chart.lines[es.selectedLineIndex].name}"`);
  } else {
    sections.push(`No line selected.`);
  }

  // ---- Selected note details (B4) ----
  if (es.selectedNoteIndices.length > 0 && es.selectedLineIndex !== null && es.selectedLineIndex < chart.lines.length) {
    const line = chart.lines[es.selectedLineIndex];
    const selectedNotes = es.selectedNoteIndices
      .filter(i => i < line.notes.length)
      .map(i => line.notes[i]);
    if (selectedNotes.length <= MAX_SELECTED_DETAIL) {
      sections.push(`Selected notes (${selectedNotes.length}):`);
      for (const n of selectedNotes) {
        sections.push(`  ${formatNote(n)}`);
      }
    } else {
      sections.push(`Selected notes: ${selectedNotes.length} note(s)`);
      for (const n of selectedNotes.slice(0, 5)) {
        sections.push(`  ${formatNote(n)}`);
      }
      sections.push(`  ... +${selectedNotes.length - 5} more`);
    }
  }

  // ---- Selected event details (B4) ----
  if (es.selectedEventIndices.length > 0 && es.selectedLineIndex !== null && es.selectedLineIndex < chart.lines.length) {
    const line = chart.lines[es.selectedLineIndex];
    const selectedEvents = es.selectedEventIndices
      .filter(i => i < line.events.length)
      .map(i => line.events[i]);
    if (selectedEvents.length <= MAX_SELECTED_DETAIL) {
      sections.push(`Selected events (${selectedEvents.length}):`);
      for (const e of selectedEvents) {
        sections.push(`  ${e.kind}: ${formatEventDetail(e, e.kind)}`);
      }
    } else {
      sections.push(`Selected events: ${selectedEvents.length} event(s)`);
      for (const e of selectedEvents.slice(0, 5)) {
        sections.push(`  ${e.kind}: ${formatEventDetail(e, e.kind)}`);
      }
      sections.push(`  ... +${selectedEvents.length - 5} more`);
    }
  }

  // ---- Line summary (activity-based: only show active + selected) ----
  sections.push(`\n## Lines Summary`);
  const inactiveIndices: number[] = [];
  // Collect active line states for spatial analysis (B8)
  const activeLinePositions: { index: number; name: string; x: number; y: number }[] = [];

  for (let i = 0; i < chart.lines.length; i++) {
    const line = chart.lines[i];
    const activity = lineActivities[i];
    const isSelected = i === es.selectedLineIndex;

    // Show: active lines, coming-soon lines, and the selected line
    // Skip: inactive unselected lines (summarized at end)
    if (activity === "inactive" && !isSelected) {
      inactiveIndices.push(i);
      continue;
    }

    const tag = activity === "active" ? "ACTIVE" : activity === "coming-soon" ? "SOON" : "INACTIVE";
    const noteCount = line.notes.length;
    const noteRange = noteCount > 0
      ? `beats ${beatToFloat(line.notes[0].beat).toFixed(1)}-${beatToFloat(line.notes[noteCount - 1].beat).toFixed(1)}`
      : "no notes";
    const kinds = [...new Set(line.notes.map(n => n.kind))].join("/");
    const eventKinds = [...new Set(line.events.map(e => e.kind))].join("/");

    // Include computed position for active/soon lines (B2)
    const cachedState = lineStateCache.get(i);
    const posStr = cachedState ? ` ${formatLinePositionCompact(cachedState)}` : "";

    sections.push(
      `Line ${i}: "${line.name}" [${tag}]${posStr} — ${noteCount} notes (${kinds || "none"}) [${noteRange}], ${line.events.length} events (${eventKinds || "none"})`
    );

    // Collect for spatial analysis
    if (activity === "active" && cachedState) {
      activeLinePositions.push({ index: i, name: line.name, x: cachedState.x, y: cachedState.y });
    }
  }

  if (inactiveIndices.length > 0) {
    const indexList = inactiveIndices.length <= 8
      ? inactiveIndices.join(", ")
      : inactiveIndices.slice(0, 5).join(", ") + `, ... +${inactiveIndices.length - 5} more`;
    sections.push(`... and ${inactiveIndices.length} inactive lines (indices: ${indexList})`);
  }

  // ---- Inter-line spatial info (B8) ----
  if (activeLinePositions.length >= 2) {
    const overlaps: string[] = [];
    for (let a = 0; a < activeLinePositions.length; a++) {
      for (let b = a + 1; b < activeLinePositions.length; b++) {
        const dx = Math.abs(activeLinePositions[a].x - activeLinePositions[b].x);
        const dy = Math.abs(activeLinePositions[a].y - activeLinePositions[b].y);
        if (dx < 100 && dy < 100) {
          overlaps.push(`Lines ${activeLinePositions[a].index} ("${activeLinePositions[a].name}") and ${activeLinePositions[b].index} ("${activeLinePositions[b].name}") are close (dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)})`);
        }
      }
    }
    if (overlaps.length > 0) {
      sections.push(`\n## Nearby/Overlapping Lines`);
      for (const o of overlaps) {
        sections.push(`  ${o}`);
      }
    }
  }

  // ---- BPM-to-time reference (only if multiple BPM entries) ----
  if (chart.bpm_list.length > 1) {
    sections.push(`\n## Beat-Time Reference`);
    const refPoints = [0, 30, 60, 120];
    for (const sec of refPoints) {
      const beat = bpmList.beatAtFloat(sec);
      sections.push(`${sec}s = beat ${beat.toFixed(2)}`);
    }
  }

  // ---- Selected line detail (filtered to context window) ----
  if (es.selectedLineIndex !== null && es.selectedLineIndex < chart.lines.length) {
    const line = chart.lines[es.selectedLineIndex];
    const selectedActivity = lineActivities[es.selectedLineIndex];
    sections.push(`\n## Selected Line Detail (Line ${es.selectedLineIndex})`);
    sections.push(`  Activity: ${selectedActivity.toUpperCase()}${selectedActivity === "active" ? " (visible or notes approaching)" : selectedActivity === "coming-soon" ? " (will become visible soon)" : " (invisible, no notes nearby)"}`);

    // Computed position at context beat (B2)
    const cachedState = lineStateCache.get(es.selectedLineIndex);
    if (cachedState) {
      sections.push(`  ${formatLineState(cachedState, contextCenter)}`);
    }

    // Show event details with actual values (B1)
    const kindGroups = new Map<string, LineEvent[]>();
    for (const evt of line.events) {
      const sb = beatToFloat(evt.start_beat);
      const eb = beatToFloat(evt.end_beat);
      if (sb <= contextHi && eb >= contextLo) {
        const arr = kindGroups.get(evt.kind) ?? [];
        arr.push(evt);
        kindGroups.set(evt.kind, arr);
      }
    }
    if (kindGroups.size > 0) {
      sections.push(`  Events in context window:`);
      for (const [kind, events] of kindGroups) {
        // Format each event with actual values, capped to avoid bloat
        const details: string[] = [];
        for (const evt of events) {
          details.push(formatEventDetail(evt, kind));
        }
        if (details.length <= MAX_EVENT_DETAILS_PER_KIND) {
          sections.push(`    ${kind}: ${details.join(", ")}`);
        } else {
          // Show first few + count
          const shown = details.slice(0, MAX_EVENT_DETAILS_PER_KIND - 1);
          sections.push(`    ${kind}: ${shown.join(", ")}, ... +${details.length - shown.length} more`);
        }
      }
    } else {
      sections.push(`  No events in context window`);
    }

    // Show all notes within the context window (B3 — with hold durations)
    const windowNotes = line.notes.filter(n => {
      const b = beatToFloat(n.beat);
      return b >= contextLo && b <= contextHi;
    });
    if (windowNotes.length > 0) {
      sections.push(`  Notes in window (${windowNotes.length}):`);
      for (const note of windowNotes) {
        sections.push(`    ${formatNote(note)}`);
      }
    }
    if (line.notes.length > windowNotes.length) {
      sections.push(`  Total notes on line: ${line.notes.length}`);
    }

    // Window density metric (B5 — per-line)
    if (windowNotes.length > 0) {
      const windowSpan = contextHi - contextLo;
      if (windowSpan > 0) {
        const windowDensity = windowNotes.length / windowSpan;
        sections.push(`  Window density: ${windowDensity.toFixed(2)} notes/beat`);
      }
    }
  }

  return sections.join("\n");
}

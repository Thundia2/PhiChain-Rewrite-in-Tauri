// ============================================================
// Official (Phigros) Format Exporter
//
// Converts PhichainChart into the Official Phigros JSON format.
// Outputs formatVersion 3 (separate X/Y move events).
//
// This is the inverse of officialImport.ts.
//
// Official format key differences from phichain internal:
//   - Time is in seconds (converted using BPM: seconds = beat * 60 / 1.875)
//   - Each line has its own BPM field (taken from the global BPM list)
//   - Move events: v3 uses separate start/start2/end/end2 for X/Y
//   - Note X: mapped from -675..675 canvas to 0-18 range
//   - Opacity: 0-1 (phichain uses 0-255)
//   - Speed events have a single "value" (not start/end transition)
//   - All events use linear easing only (easing info is dropped)
//   - Hold note speeds are baked: speed *= lineSpeed / 9.0 * 2.0
// ============================================================

import type { PhichainChart, Line, Note, LineEvent, Beat } from "../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat } from "../types/chart";

// ============================================================
// Conversion Helpers
// ============================================================

/** Convert a Beat tuple to seconds using the fixed conversion factor */
function beatToTime(beat: Beat): number {
  const beatValue = beatToFloat(beat);
  // Inverse of import: beatValue = time * 1.875 / 60
  // So: time = beatValue * 60 / 1.875
  return beatValue * 60 / 1.875;
}

/** Map NoteKind to Official note type number */
function kindToNoteType(kind: string): number {
  switch (kind) {
    case "tap": return 1;
    case "drag": return 2;
    case "hold": return 3;
    case "flick": return 4;
    default: return 1;
  }
}

/** Get the numeric value from a LineEvent (start value for constants, or specified) */
function getEventStartValue(event: LineEvent): number {
  if ("constant" in event.value) return event.value.constant;
  if ("transition" in event.value) return event.value.transition.start;
  return 0;
}

function getEventEndValue(event: LineEvent): number {
  if ("constant" in event.value) return event.value.constant;
  if ("transition" in event.value) return event.value.transition.end;
  return 0;
}

// ============================================================
// Flatten Event Layers
// ============================================================

/** Collect all events of a given kind from both flat events and event layers */
function collectEvents(line: Line, kind: string): LineEvent[] {
  const events: LineEvent[] = [];

  if (line.event_layers && line.event_layers.length > 0) {
    // When layers exist, we can only export layer 0 since official format
    // doesn't support additive layers. Use layer 0 as the primary.
    for (const layer of line.event_layers) {
      let layerEvents: LineEvent[];
      switch (kind) {
        case "x": layerEvents = layer.move_x_events; break;
        case "y": layerEvents = layer.move_y_events; break;
        case "rotation": layerEvents = layer.rotate_events; break;
        case "opacity": layerEvents = layer.alpha_events; break;
        case "speed": layerEvents = layer.speed_events; break;
        default: layerEvents = [];
      }
      events.push(...layerEvents);
    }
  } else {
    events.push(...line.events.filter(e => e.kind === kind));
  }

  // Sort by start beat
  events.sort((a, b) => beatToFloat(a.start_beat) - beatToFloat(b.start_beat));
  return events;
}

// ============================================================
// Speed Lookup
// ============================================================

/** Find the effective speed at a given beat from the speed events */
function getSpeedAtBeat(speedEvents: LineEvent[], beat: number): number {
  let speed = 1;
  for (const event of speedEvents) {
    const startBeat = beatToFloat(event.start_beat);
    if (startBeat > beat) break;
    speed = getEventEndValue(event);
  }
  return speed;
}

// ============================================================
// Floor Position Calculation
// ============================================================

/** Calculate floorPosition for speed events (cumulative distance) */
function calculateFloorPositions(speedEvents: LineEvent[]): number[] {
  const positions: number[] = [];
  let cumulative = 0;

  for (let i = 0; i < speedEvents.length; i++) {
    positions.push(cumulative);
    const startTime = beatToTime(speedEvents[i].start_beat);
    const endTime = beatToTime(speedEvents[i].end_beat);
    const speed = getEventStartValue(speedEvents[i]);
    cumulative += speed * (endTime - startTime);
  }

  return positions;
}

// ============================================================
// Main Export Function
// ============================================================

export function convertPhichainToOfficial(chart: PhichainChart): string {
  const globalBpm = chart.bpm_list.length > 0 ? chart.bpm_list[0].bpm : 120;

  const judgeLineList = chart.lines.map((line) => {
    // Collect events by kind
    const xEvents = collectEvents(line, "x");
    const yEvents = collectEvents(line, "y");
    const rotateEvents = collectEvents(line, "rotation");
    const opacityEvents = collectEvents(line, "opacity");
    const speedEvents = collectEvents(line, "speed");

    // Build move events — merge X and Y into combined position events (v3 format)
    // We need to align X and Y events. For simplicity, take all unique time ranges
    // from both X and Y, and create combined position events.
    const judgeLineMoveEvents = buildMoveEvents(xEvents, yEvents);

    // Build rotation events
    const judgeLineRotateEvents = rotateEvents.map(event => ({
      startTime: beatToTime(event.start_beat),
      endTime: beatToTime(event.end_beat),
      start: getEventStartValue(event),
      end: getEventEndValue(event),
    }));

    // Build opacity events (phichain 0-255 → official 0-1)
    const judgeLineDisappearEvents = opacityEvents.map(event => ({
      startTime: beatToTime(event.start_beat),
      endTime: beatToTime(event.end_beat),
      start: Math.max(0, Math.min(1, getEventStartValue(event) / 255)),
      end: Math.max(0, Math.min(1, getEventEndValue(event) / 255)),
    }));

    // Build speed events
    // Official format: speed = value / 2.0 * 9.0 (import formula)
    // Reverse: official_value = phichain_speed * 2.0 / 9.0
    const floorPositions = calculateFloorPositions(speedEvents);
    const officialSpeedEvents = speedEvents.map((event, i) => {
      const speed = getEventStartValue(event);
      return {
        startTime: beatToTime(event.start_beat),
        endTime: beatToTime(event.end_beat),
        value: speed * 2.0 / 9.0,
        floorPosition: floorPositions[i] ?? 0,
      };
    });

    // Build notes — separate into above and below
    const notesAbove: ReturnType<typeof convertNote>[] = [];
    const notesBelow: ReturnType<typeof convertNote>[] = [];

    for (const note of line.notes) {
      // Skip fake notes — official format doesn't support them
      if (note.fake) continue;

      const converted = convertNote(note, speedEvents);
      if (note.above) {
        notesAbove.push(converted);
      } else {
        notesBelow.push(converted);
      }
    }

    return {
      bpm: globalBpm,
      judgeLineMoveEvents,
      judgeLineRotateEvents,
      judgeLineDisappearEvents,
      speedEvents: officialSpeedEvents,
      notesAbove,
      notesBelow,
    };
  });

  const officialChart = {
    formatVersion: 3,
    offset: chart.offset,
    judgeLineList,
  };

  return JSON.stringify(officialChart, null, 2);
}

// ============================================================
// Move Event Builder (merges X and Y into v3 format)
// ============================================================

function buildMoveEvents(
  xEvents: LineEvent[],
  yEvents: LineEvent[],
): Array<{ startTime: number; endTime: number; start: number; start2: number; end: number; end2: number }> {
  // Collect all unique time boundaries
  const timeBoundaries = new Set<number>();
  for (const e of xEvents) {
    timeBoundaries.add(beatToFloat(e.start_beat));
    timeBoundaries.add(beatToFloat(e.end_beat));
  }
  for (const e of yEvents) {
    timeBoundaries.add(beatToFloat(e.start_beat));
    timeBoundaries.add(beatToFloat(e.end_beat));
  }

  const sortedTimes = Array.from(timeBoundaries).sort((a, b) => a - b);

  if (sortedTimes.length < 2) {
    // Fallback: create a single event from the constant values
    const xVal = xEvents.length > 0 ? getEventStartValue(xEvents[0]) : 0;
    const yVal = yEvents.length > 0 ? getEventStartValue(yEvents[0]) : 0;
    return [{
      startTime: 0,
      endTime: 1e9,
      start: xToNormalized(xVal),
      start2: yToNormalized(yVal),
      end: xToNormalized(xVal),
      end2: yToNormalized(yVal),
    }];
  }

  const result: Array<{ startTime: number; endTime: number; start: number; start2: number; end: number; end2: number }> = [];

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const startBeat = sortedTimes[i];
    const endBeat = sortedTimes[i + 1];

    const xStart = sampleEventValue(xEvents, startBeat);
    const xEnd = sampleEventValue(xEvents, endBeat);
    const yStart = sampleEventValue(yEvents, startBeat);
    const yEnd = sampleEventValue(yEvents, endBeat);

    result.push({
      startTime: startBeat * 60 / 1.875,
      endTime: endBeat * 60 / 1.875,
      start: xToNormalized(xStart),
      start2: yToNormalized(yStart),
      end: xToNormalized(xEnd),
      end2: yToNormalized(yEnd),
    });
  }

  return result;
}

/** Convert phichain X (-675..675) to official normalized (0-1) */
function xToNormalized(x: number): number {
  return x / CANVAS_WIDTH + 0.5;
}

/** Convert phichain Y (-450..450) to official normalized (0-1) */
function yToNormalized(y: number): number {
  return y / CANVAS_HEIGHT + 0.5;
}

/** Sample event value at a given beat position (linear interpolation) */
function sampleEventValue(events: LineEvent[], beat: number): number {
  if (events.length === 0) return 0;

  for (const event of events) {
    const startBeat = beatToFloat(event.start_beat);
    const endBeat = beatToFloat(event.end_beat);

    if (beat >= startBeat && beat <= endBeat) {
      const startVal = getEventStartValue(event);
      const endVal = getEventEndValue(event);
      if (Math.abs(endBeat - startBeat) < 1e-9) return startVal;
      const t = (beat - startBeat) / (endBeat - startBeat);
      return startVal + (endVal - startVal) * t;
    }
  }

  // Before first event — use first event's start value
  const firstBeat = beatToFloat(events[0].start_beat);
  if (beat < firstBeat) return getEventStartValue(events[0]);

  // After last event — use last event's end value
  return getEventEndValue(events[events.length - 1]);
}

// ============================================================
// Note Conversion
// ============================================================

function convertNote(
  note: Note,
  speedEvents: LineEvent[],
): {
  type: number;
  time: number;
  holdTime: number;
  positionX: number;
  speed: number;
  floorPosition: number;
} {
  const time = beatToTime(note.beat);
  let holdTime = 0;
  if (note.kind === "hold" && note.hold_beat) {
    holdTime = beatToTime(note.hold_beat);
  }

  // Convert X from -675..675 canvas to 0-18 range
  const positionX = note.x / CANVAS_WIDTH * 18.0;

  // Bake speed for hold notes: official holds multiply by line speed
  let speed = note.speed;
  if (note.kind === "hold") {
    const noteBeat = beatToFloat(note.beat);
    const lineSpeed = getSpeedAtBeat(speedEvents, noteBeat);
    if (lineSpeed !== 0) {
      speed *= lineSpeed / 9.0 * 2.0;
    }
  }

  return {
    type: kindToNoteType(note.kind),
    time,
    holdTime,
    positionX,
    speed,
    floorPosition: 0, // Not critical for import — calculable from speed events
  };
}

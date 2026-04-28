// ============================================================
// Quick Event Creation — Context menu helpers
// ============================================================

import type { LineEvent, LineEventKind, EasingType } from "../types/chart";
import { beatToFloat, floatToBeat } from "../types/chart";
import { useChartStore } from "../stores/chartStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAudioStore } from "../stores/audioStore";
import { evaluateLineEventsWithLayers } from "../canvas/events";
import { DEFAULT_EVENT_VALUES } from "../constants/eventConfig";
import { BpmList } from "./bpmList";

/**
 * Create a constant event at the given beat/value.
 */
export function createQuickConstant(
  lineIndex: number,
  kind: LineEventKind,
  beat: number,
  value: number,
): void {
  const cs = useChartStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return;

  // Find if an event of this kind spans the target beat
  const eventIndex = line.events.findIndex((e) => {
    if (e.kind !== kind) return false;
    const start = beatToFloat(e.start_beat);
    const end = beatToFloat(e.end_beat);
    return beat >= start && beat <= end;
  });

  if (eventIndex >= 0) {
    const event = line.events[eventIndex];
    if ("constant" in event.value) {
      cs.editEvent(lineIndex, eventIndex, { value: { constant: value } });
    }
    // For transitions we'd need to split — keep simple for now
  } else {
    cs.addEvent(lineIndex, {
      kind,
      start_beat: floatToBeat(beat),
      end_beat: floatToBeat(beat + 1),
      value: { constant: value },
    });
  }
}

/**
 * Create a transition from the current value at playhead to a target value.
 */
export function createQuickTransition(
  lineIndex: number,
  kind: LineEventKind,
  targetValue: number,
  durationBeats?: number,
  easing?: EasingType,
): void {
  const cs = useChartStore.getState();
  const ss = useSettingsStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return;

  const duration = durationBeats ?? ss.quickTransitionDuration;
  const easingType = easing ?? (ss.quickTransitionEasing as EasingType);

  const { currentTime } = useAudioStore.getState();
  const bpmList = new BpmList(cs.chart.bpm_list);
  const currentBeat = bpmList.beatAtFloat(Math.max(0, currentTime - cs.chart.offset));
  const state = evaluateLineEventsWithLayers(line.events, line.event_layers, currentBeat);

  const currentValueMap: Record<string, number> = {
    x: state.x,
    y: state.y,
    rotation: state.rotation * (180 / Math.PI),
    opacity: state.opacity * 255,
    speed: state.speed,
    scale_x: state.scale_x,
    scale_y: state.scale_y,
  };
  const startValue = currentValueMap[kind] ?? 0;

  cs.addEvent(lineIndex, {
    kind,
    start_beat: floatToBeat(currentBeat),
    end_beat: floatToBeat(currentBeat + duration),
    value: { transition: { start: startValue, end: targetValue, easing: easingType } },
  });
}

/**
 * Create a constant event of *any* kind at [startBeat, endBeat] with
 * a sensible default value:
 *   - color → { color_constant: [255, 255, 255] }   (white)
 *   - text  → { text_value: "" }                    (empty)
 *   - else  → { constant: DEFAULT_EVENT_VALUES[kind] ?? 0 }
 *
 * Returns the resulting event's index in `line.events` after the
 * store's automatic sort-by-start_beat, or -1 on failure (no line,
 * or addEvent didn't add the event for some reason).
 *
 * Used by the unrolled canvas's mouse-down event-placement flow
 * (UnrolledCanvas.tsx). The canvas then drags `end_beat` live via
 * `cs.editEvent(...)`; since editEvent doesn't re-sort, the index
 * we return here stays stable across the drag.
 */
export function placeEventAtBeats(
  lineIndex: number,
  kind: LineEventKind,
  startBeat: number,
  endBeat: number,
): number {
  const cs = useChartStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return -1;

  // Normalize: caller may pass endBeat <= startBeat; clamp to a tiny
  // positive duration so the event is visible. The mouse-move handler
  // is responsible for enforcing the snap-grid minimum duration.
  const safeStart = Math.max(0, startBeat);
  const safeEnd = endBeat > safeStart ? endBeat : safeStart + 1 / 32;

  // Resolve the value union by kind
  let value: LineEvent["value"];
  if (kind === "color") {
    value = { color_constant: [255, 255, 255] };
  } else if (kind === "text") {
    value = { text_value: "" };
  } else {
    value = { constant: DEFAULT_EVENT_VALUES[kind] ?? 0 };
  }

  const newEvent: LineEvent = {
    kind,
    start_beat: floatToBeat(safeStart),
    end_beat: floatToBeat(safeEnd),
    value,
  };

  cs.addEvent(lineIndex, newEvent);

  // The store sorted by start_beat after insertion. Find our event by
  // identity (the store uses Immer; addEvent pushes the same reference,
  // and structural sharing preserves it). Fall back to start_beat
  // matching if reference equality somehow doesn't hold.
  const after = useChartStore.getState().chart.lines[lineIndex];
  if (!after) return -1;
  const refIdx = after.events.indexOf(newEvent);
  if (refIdx >= 0) return refIdx;

  // Fallback: locate by exact start_beat tuple. There can be multiple
  // events sharing a start beat — pick the last one (most recently
  // appended) since stable sorts preserve insertion order on ties.
  for (let i = after.events.length - 1; i >= 0; i--) {
    const e = after.events[i];
    if (
      e.start_beat[0] === newEvent.start_beat[0] &&
      e.start_beat[1] === newEvent.start_beat[1] &&
      e.start_beat[2] === newEvent.start_beat[2] &&
      e.kind === kind
    ) {
      return i;
    }
  }
  return -1;
}

// ============================================================
// Quick Event Creation — Context menu helpers
// ============================================================

import type { LineEventKind, LineEvent, EasingType } from "../types/chart";
import { beatToFloat, floatToBeat } from "../types/chart";
import { useChartStore } from "../stores/chartStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAudioStore } from "../stores/audioStore";
import { evaluateLineEventsWithLayers } from "../canvas/events";
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

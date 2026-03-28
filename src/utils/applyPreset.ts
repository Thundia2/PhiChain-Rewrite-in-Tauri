// ============================================================
// Apply Preset — Resolves tokens and creates events at playhead
// ============================================================

import type { EventPreset } from "../types/preset";
import type { LineEvent, LineEventKind, EasingType } from "../types/chart";
import { floatToBeat } from "../types/chart";
import { useChartStore } from "../stores/chartStore";
import { useAudioStore } from "../stores/audioStore";
import { evaluateLineEventsWithLayers } from "../canvas/events";
import { BpmList } from "./bpmList";

function resolveToken(
  token: string | number,
  kind: LineEventKind,
  currentValues: Record<string, number>,
): number {
  if (typeof token === "number") return token;
  switch (token) {
    case "$CURRENT": return currentValues[kind] ?? 0;
    case "$CENTER": return 0;
    case "$LEFT": return -675;
    case "$RIGHT": return 675;
    case "$TOP": return 450;
    case "$BOTTOM": return -450;
    case "$FULL_OPACITY": return 255;
    case "$ZERO": return 0;
    default: return parseFloat(token) || 0;
  }
}

export function applyPresetAtPlayhead(
  lineIndex: number,
  preset: EventPreset,
  durationScale: number = 1.0,
): void {
  const cs = useChartStore.getState();
  const line = cs.chart.lines[lineIndex];
  if (!line) return;

  const { currentTime } = useAudioStore.getState();
  const bpmList = new BpmList(cs.chart.bpm_list);
  const insertBeat = bpmList.beatAtFloat(Math.max(0, currentTime - cs.chart.offset));

  const state = evaluateLineEventsWithLayers(line.events, line.event_layers, insertBeat);

  const currentValues: Record<string, number> = {
    x: state.x,
    y: state.y,
    rotation: state.rotation * (180 / Math.PI),
    opacity: state.opacity * 255,
    speed: state.speed,
    scale_x: state.scale_x,
    scale_y: state.scale_y,
  };

  const newEvents: LineEvent[] = [];
  for (const tmpl of preset.template) {
    const startBeat = insertBeat + tmpl.beatOffset * durationScale;
    const endBeat = insertBeat + tmpl.endBeatOffset * durationScale;

    let value: LineEvent["value"];
    if ("constant" in tmpl.value) {
      value = { constant: resolveToken(tmpl.value.constant, tmpl.kind, currentValues) };
    } else {
      value = {
        transition: {
          start: resolveToken(tmpl.value.transition.start, tmpl.kind, currentValues),
          end: resolveToken(tmpl.value.transition.end, tmpl.kind, currentValues),
          easing: tmpl.value.transition.easing,
        },
      };
    }

    newEvents.push({
      kind: tmpl.kind,
      start_beat: floatToBeat(startBeat),
      end_beat: floatToBeat(endBeat),
      value,
    });
  }

  if (newEvents.length > 0) {
    cs.batchMultiLineMutations([{ lineIndex, newEvents }]);
  }
}

// ============================================================
// RPE (Re:PhiEdit) Format Exporter
//
// Converts phichain's internal format back to RPE JSON.
// This is the inverse of rpeImport.ts.
// ============================================================

import type {
  PhichainChart,
  Line,
  Note,
  LineEvent,
  Beat,
  EasingType,
  EventLayer,
  NoteControlEntry,
  ProjectMeta,
} from "../types/chart";
import { addBeats } from "./beat";
import { PHICHAIN_TO_RPE_EASING } from "./rpeImport";

// ============================================================
// Phichain → RPE Easing Mapping
// ============================================================

function phichainEasingToRpe(easing: EasingType): { easingType: number; bezier?: number; bezierPoints?: [number, number, number, number] } {
  if (typeof easing === "string") {
    return { easingType: PHICHAIN_TO_RPE_EASING[easing] ?? 1 };
  }
  if ("custom" in easing) {
    return { easingType: 1, bezier: 1, bezierPoints: easing.custom as [number, number, number, number] };
  }
  // Steps and elastic don't have RPE equivalents — fall back to linear
  return { easingType: 1 };
}

function noteKindToRpe(kind: string): number {
  switch (kind) {
    case "tap": return 1;
    case "hold": return 2;
    case "flick": return 3;
    case "drag": return 4;
    default: return 1;
  }
}

// ============================================================
// Event Conversion
// ============================================================

interface RpeEvent {
  startTime: Beat;
  endTime: Beat;
  start: number;
  end: number;
  easingType: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: number;
  bezierPoints?: [number, number, number, number];
}

function convertLineEventToRpe(event: LineEvent, negate = false): RpeEvent {
  let startVal: number;
  let endVal: number;
  let easingInfo: ReturnType<typeof phichainEasingToRpe> = { easingType: 1 };

  if ("constant" in event.value) {
    startVal = event.value.constant;
    endVal = event.value.constant;
  } else if ("transition" in event.value) {
    startVal = event.value.transition.start;
    endVal = event.value.transition.end;
    easingInfo = phichainEasingToRpe(event.value.transition.easing);
  } else {
    startVal = 0;
    endVal = 0;
  }

  if (negate) {
    startVal = -startVal;
    endVal = -endVal;
  }

  const rpeEvent: RpeEvent = {
    startTime: event.start_beat,
    endTime: event.end_beat,
    start: startVal,
    end: endVal,
    easingType: easingInfo.easingType,
  };

  if (easingInfo.bezier) {
    rpeEvent.bezier = 1;
    rpeEvent.bezierPoints = easingInfo.bezierPoints;
  }

  if (event.easing_left != null && event.easing_left !== 0) {
    rpeEvent.easingLeft = event.easing_left;
  }
  if (event.easing_right != null && event.easing_right !== 1) {
    rpeEvent.easingRight = event.easing_right;
  }

  return rpeEvent;
}

function convertEventLayerToRpe(layer: EventLayer): Record<string, RpeEvent[]> {
  const result: Record<string, RpeEvent[]> = {};

  if (layer.move_x_events.length > 0) {
    result.moveXEvents = layer.move_x_events.map((e) => convertLineEventToRpe(e));
  }
  if (layer.move_y_events.length > 0) {
    result.moveYEvents = layer.move_y_events.map((e) => convertLineEventToRpe(e));
  }
  if (layer.rotate_events.length > 0) {
    result.rotateEvents = layer.rotate_events.map((e) => convertLineEventToRpe(e, true));
  }
  if (layer.alpha_events.length > 0) {
    result.alphaEvents = layer.alpha_events.map((e) => convertLineEventToRpe(e));
  }
  if (layer.speed_events.length > 0) {
    result.speedEvents = layer.speed_events.map((e) => convertLineEventToRpe(e));
  }

  return result;
}

function buildEventLayersFromFlat(events: LineEvent[]): Record<string, RpeEvent[]> {
  const moveXEvents = events.filter((e) => e.kind === "x").map((e) => convertLineEventToRpe(e));
  const moveYEvents = events.filter((e) => e.kind === "y").map((e) => convertLineEventToRpe(e));
  const rotateEvents = events.filter((e) => e.kind === "rotation").map((e) => convertLineEventToRpe(e, true));
  const alphaEvents = events.filter((e) => e.kind === "opacity").map((e) => convertLineEventToRpe(e));
  const speedEvents = events.filter((e) => e.kind === "speed").map((e) => convertLineEventToRpe(e));

  const result: Record<string, RpeEvent[]> = {};
  if (moveXEvents.length > 0) result.moveXEvents = moveXEvents;
  if (moveYEvents.length > 0) result.moveYEvents = moveYEvents;
  if (rotateEvents.length > 0) result.rotateEvents = rotateEvents;
  if (alphaEvents.length > 0) result.alphaEvents = alphaEvents;
  if (speedEvents.length > 0) result.speedEvents = speedEvents;
  return result;
}

// ============================================================
// Extended Event Conversion
// ============================================================

function buildExtendedEvents(events: LineEvent[]): Record<string, unknown> | undefined {
  const scaleXEvents = events.filter((e) => e.kind === "scale_x").map((e) => convertLineEventToRpe(e));
  const scaleYEvents = events.filter((e) => e.kind === "scale_y").map((e) => convertLineEventToRpe(e));
  const inclineEvents = events.filter((e) => e.kind === "incline").map((e) => convertLineEventToRpe(e));

  const colorEvents = events.filter((e) => e.kind === "color").map((event) => {
    let startColor: [number, number, number] = [255, 255, 255];
    let endColor: [number, number, number] = [255, 255, 255];
    let easingInfo: ReturnType<typeof phichainEasingToRpe> = { easingType: 1 };

    if ("color_constant" in event.value) {
      startColor = event.value.color_constant;
      endColor = event.value.color_constant;
    } else if ("color_transition" in event.value) {
      startColor = event.value.color_transition.start;
      endColor = event.value.color_transition.end;
      easingInfo = phichainEasingToRpe(event.value.color_transition.easing);
    }

    const rpeEvent: Record<string, unknown> = {
      startTime: event.start_beat,
      endTime: event.end_beat,
      start: startColor,
      end: endColor,
      easingType: easingInfo.easingType,
    };
    if (easingInfo.bezier) {
      rpeEvent.bezier = 1;
      rpeEvent.bezierPoints = easingInfo.bezierPoints;
    }
    if (event.easing_left != null && event.easing_left !== 0) rpeEvent.easingLeft = event.easing_left;
    if (event.easing_right != null && event.easing_right !== 1) rpeEvent.easingRight = event.easing_right;
    return rpeEvent;
  });

  const textEvents = events.filter((e) => e.kind === "text").map((event) => ({
    startTime: event.start_beat,
    endTime: event.end_beat,
    start: "text_value" in event.value ? event.value.text_value : "",
    end: "text_value" in event.value ? event.value.text_value : "",
  }));

  const hasExtended = scaleXEvents.length > 0 || scaleYEvents.length > 0 ||
    colorEvents.length > 0 || textEvents.length > 0 || inclineEvents.length > 0;

  if (!hasExtended) return undefined;

  const extended: Record<string, unknown> = {};
  if (scaleXEvents.length > 0) extended.scaleXEvents = scaleXEvents;
  if (scaleYEvents.length > 0) extended.scaleYEvents = scaleYEvents;
  if (colorEvents.length > 0) extended.colorEvents = colorEvents;
  if (textEvents.length > 0) extended.textEvents = textEvents;
  if (inclineEvents.length > 0) extended.inclineEvents = inclineEvents;
  return extended;
}

// ============================================================
// Note Control Conversion
// ============================================================

function convertControlEntries(entries: NoteControlEntry[] | undefined): Record<string, unknown>[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((e) => ({
    x: e.x,
    easing: typeof e.easing === "string" ? (PHICHAIN_TO_RPE_EASING[e.easing] ?? 1) : 1,
    value: e.value,
  }));
}

// ============================================================
// Main Export Function
// ============================================================

export function convertPhichainToRpe(
  chart: PhichainChart,
  meta: ProjectMeta,
  rpeVersion: number = 162,
): string {
  const rpeLines = chart.lines.map((line) => {
    // Convert notes
    const notes = line.notes.map((note) => {
      const rpeNote: Record<string, unknown> = {
        type: noteKindToRpe(note.kind),
        positionX: note.x,
        above: note.above ? 1 : 0,
        startTime: note.beat,
        endTime: note.kind === "hold" && note.hold_beat
          ? addBeats(note.beat, note.hold_beat)
          : note.beat,
        speed: note.speed,
      };

      if (note.fake) rpeNote.isFake = 1;
      if (note.y_offset) rpeNote.yOffset = note.y_offset;
      if (note.size != null && note.size !== 1) rpeNote.size = note.size;
      if (note.alpha != null && note.alpha !== 255) rpeNote.alpha = note.alpha;
      if (note.visible_time != null && note.visible_time !== 999999) rpeNote.visibleTime = note.visible_time;

      return rpeNote;
    });

    // Convert event layers
    let eventLayers: Record<string, RpeEvent[]>[];
    if (line.event_layers && line.event_layers.length > 0) {
      eventLayers = line.event_layers.map(convertEventLayerToRpe);
    } else {
      eventLayers = [buildEventLayersFromFlat(line.events)];
    }

    // Build line object
    const rpeLine: Record<string, unknown> = {
      Name: line.name,
      notes,
      eventLayers,
      father: line.father_index ?? -1,
    };

    // Line properties
    if (line.z_order != null && line.z_order !== 0) rpeLine.zOrder = line.z_order;
    rpeLine.isCover = (line.is_cover !== false) ? 1 : 0;
    if (line.bpm_factor != null && line.bpm_factor !== 1) rpeLine.bpmfactor = line.bpm_factor;
    if (line.group != null) rpeLine.Group = line.group;
    if (line.texture) rpeLine.Texture = line.texture;
    if (line.anchor) rpeLine.anchor = line.anchor;
    if (line.rotate_with_father === false) rpeLine.rotateWithFather = false;

    // Extended events
    const extended = buildExtendedEvents(line.events);
    if (extended) rpeLine.extended = extended;

    // Note controls
    const posControl = convertControlEntries(line.pos_control);
    const alphaControl = convertControlEntries(line.alpha_control);
    const sizeControl = convertControlEntries(line.size_control);
    const skewControl = convertControlEntries(line.skew_control);
    const yControl = convertControlEntries(line.y_control);
    if (posControl) rpeLine.posControl = posControl;
    if (alphaControl) rpeLine.alphaControl = alphaControl;
    if (sizeControl) rpeLine.sizeControl = sizeControl;
    if (skewControl) rpeLine.skewControl = skewControl;
    if (yControl) rpeLine.yControl = yControl;

    return rpeLine;
  });

  const rpeChart: Record<string, unknown> = {
    META: {
      RPEVersion: rpeVersion,
      name: meta.name,
      composer: meta.composer,
      charter: meta.charter,
      level: meta.level,
      illustrator: meta.illustrator,
      offset: Math.round(chart.offset * 1000), // seconds → ms
      song: "music.mp3",
      background: "bg.png",
      id: "1",
    },
    BPMList: chart.bpm_list.map((b) => ({
      startTime: b.beat,
      bpm: b.bpm,
    })),
    judgeLineList: rpeLines,
  };

  if (chart.line_groups && chart.line_groups.length > 0) {
    rpeChart.judgeLineGroup = chart.line_groups;
  } else {
    rpeChart.judgeLineGroup = ["Default"];
  }

  return JSON.stringify(rpeChart, null, 2);
}

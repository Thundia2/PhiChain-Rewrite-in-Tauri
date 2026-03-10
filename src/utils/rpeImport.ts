// ============================================================
// RPE (Re:PhiEdit) Format Importer
//
// Converts RPE JSON charts to phichain's internal format.
// Supports all RPE features: event layers, extended events,
// easing clipping, bezier curves, note controls, line properties.
//
// Original from phichain-chart/src/format/rpe.rs
// ============================================================

import type {
  PhichainChart,
  Line,
  Note,
  LineEvent,
  LineEventValue,
  BpmPoint,
  Beat,
  NoteKind,
  EasingType,
  LineEventKind,
  EventLayer,
  NoteControlEntry,
} from "../types/chart";
import { subtractBeats } from "./beat";

// ============================================================
// RPE Format Types
// ============================================================

interface RpeChart {
  BPMList: Array<{ bpm: number; startTime: [number, number, number] }>;
  META?: {
    RPEVersion?: number;
    name?: string;
    composer?: string;
    charter?: string;
    level?: string;
    illustrator?: string;
    offset?: number;
  };
  judgeLineList: RpeLine[];
  judgeLineGroup?: string[];
}

interface RpeLine {
  Name?: string;
  notes?: RpeNote[];
  eventLayers?: (RpeEventLayer | null)[];
  father?: number;
  // Line properties
  zOrder?: number;
  isCover?: number;
  bpmfactor?: number;
  Group?: number;
  Texture?: string;
  anchor?: [number, number];
  rotateWithFather?: boolean;
  attachUI?: string;
  // Extended events
  extended?: {
    scaleXEvents?: RpeEvent[];
    scaleYEvents?: RpeEvent[];
    colorEvents?: RpeColorEvent[];
    textEvents?: RpeTextEvent[];
    inclineEvents?: RpeEvent[];
  };
  // Note controls
  posControl?: RpeControlEntry[];
  alphaControl?: RpeControlEntry[];
  sizeControl?: RpeControlEntry[];
  skewControl?: RpeControlEntry[];
  yControl?: RpeControlEntry[];
}

interface RpeEventLayer {
  moveXEvents?: RpeEvent[];
  moveYEvents?: RpeEvent[];
  rotateEvents?: RpeEvent[];
  alphaEvents?: RpeEvent[];
  speedEvents?: RpeEvent[];
}

interface RpeNote {
  type: number; // 1=tap, 2=hold, 3=flick, 4=drag
  positionX: number;
  above: number; // 1 or 0
  startTime: [number, number, number];
  endTime: [number, number, number]; // For holds: end time
  speed: number;
  size?: number;
  yOffset?: number;
  isFake?: number; // 0 or 1
  alpha?: number;
  visibleTime?: number;
}

interface RpeEvent {
  startTime: [number, number, number];
  endTime: [number, number, number];
  start: number;
  end: number;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: number;
  bezierPoints?: [number, number, number, number];
}

interface RpeColorEvent {
  startTime: [number, number, number];
  endTime: [number, number, number];
  start: [number, number, number];
  end: [number, number, number];
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: number;
  bezierPoints?: [number, number, number, number];
}

interface RpeTextEvent {
  startTime: [number, number, number];
  endTime: [number, number, number];
  start: string;
  end: string;
}

interface RpeControlEntry {
  x: number;
  easing?: number;
  value?: number;
  // Alternative field names used in some RPE versions
  pos?: number;
  alpha?: number;
  size?: number;
  skew?: number;
  y?: number;
}

// ============================================================
// RPE → Phichain Easing Mapping
// ============================================================

const RPE_EASING_MAP: Record<number, EasingType> = {
  0: "linear",
  1: "linear",
  2: "ease_out_sine",
  3: "ease_in_sine",
  4: "ease_out_quad",
  5: "ease_in_quad",
  6: "ease_in_out_sine",
  7: "ease_in_out_quad",
  8: "ease_out_cubic",
  9: "ease_in_cubic",
  10: "ease_out_quart",
  11: "ease_in_quart",
  12: "ease_in_out_cubic",
  13: "ease_in_out_quart",
  14: "ease_out_quint",
  15: "ease_in_quint",
  16: "ease_out_expo",
  17: "ease_in_expo",
  18: "ease_out_circ",
  19: "ease_in_circ",
  20: "ease_out_back",
  21: "ease_in_back",
  22: "ease_in_out_circ",
  23: "ease_in_out_back",
  24: "ease_out_elastic",
  25: "ease_in_elastic",
  26: "ease_out_bounce",
  27: "ease_in_bounce",
  28: "ease_in_out_bounce",
  29: "ease_in_out_elastic",
};

/** Reverse mapping: phichain easing name → RPE easing ID */
export const PHICHAIN_TO_RPE_EASING: Record<string, number> = {};
for (const [id, name] of Object.entries(RPE_EASING_MAP)) {
  if (typeof name === "string" && !(name in PHICHAIN_TO_RPE_EASING)) {
    PHICHAIN_TO_RPE_EASING[name] = Number(id);
  }
}

function rpeEasingToPhichain(rEvent: RpeEvent): EasingType {
  // Bezier curves override numbered easing
  if (rEvent.bezier === 1 && rEvent.bezierPoints) {
    return { custom: rEvent.bezierPoints };
  }
  return RPE_EASING_MAP[rEvent.easingType ?? 1] ?? "linear";
}

function rpeNoteTypeToKind(type: number): NoteKind {
  switch (type) {
    case 1: return "tap";
    case 2: return "hold";
    case 3: return "flick";
    case 4: return "drag";
    default: return "tap";
  }
}

// ============================================================
// Event Conversion
// ============================================================

function convertRpeEvent(rEvent: RpeEvent, kind: LineEventKind): LineEvent {
  const startBeat = rEvent.startTime as Beat;
  const endBeat = rEvent.endTime as Beat;
  const easingType = rpeEasingToPhichain(rEvent);

  // Easing clipping (sub-range of easing curve)
  const hasClipping =
    (rEvent.easingLeft !== undefined && rEvent.easingLeft !== 0) ||
    (rEvent.easingRight !== undefined && rEvent.easingRight !== 1);

  let value: LineEventValue;
  if (rEvent.start === rEvent.end) {
    value = { constant: rEvent.start };
  } else {
    value = {
      transition: {
        start: rEvent.start,
        end: rEvent.end,
        easing: easingType,
      },
    };
  }

  const event: LineEvent = {
    kind,
    start_beat: startBeat,
    end_beat: endBeat,
    value,
  };

  if (hasClipping) {
    if (rEvent.easingLeft !== undefined && rEvent.easingLeft !== 0) {
      event.easing_left = rEvent.easingLeft;
    }
    if (rEvent.easingRight !== undefined && rEvent.easingRight !== 1) {
      event.easing_right = rEvent.easingRight;
    }
  }

  return event;
}

function convertRpeColorEvent(rEvent: RpeColorEvent): LineEvent {
  const startBeat = rEvent.startTime as Beat;
  const endBeat = rEvent.endTime as Beat;

  let easing: EasingType = "linear";
  if (rEvent.bezier === 1 && rEvent.bezierPoints) {
    easing = { custom: rEvent.bezierPoints };
  } else {
    easing = RPE_EASING_MAP[rEvent.easingType ?? 1] ?? "linear";
  }

  const sameColor =
    rEvent.start[0] === rEvent.end[0] &&
    rEvent.start[1] === rEvent.end[1] &&
    rEvent.start[2] === rEvent.end[2];

  let value: LineEventValue;
  if (sameColor) {
    value = { color_constant: rEvent.start as [number, number, number] };
  } else {
    value = {
      color_transition: {
        start: rEvent.start as [number, number, number],
        end: rEvent.end as [number, number, number],
        easing,
      },
    };
  }

  const event: LineEvent = {
    kind: "color",
    start_beat: startBeat,
    end_beat: endBeat,
    value,
  };

  if (rEvent.easingLeft !== undefined && rEvent.easingLeft !== 0) {
    event.easing_left = rEvent.easingLeft;
  }
  if (rEvent.easingRight !== undefined && rEvent.easingRight !== 1) {
    event.easing_right = rEvent.easingRight;
  }

  return event;
}

function convertRpeTextEvent(rEvent: RpeTextEvent): LineEvent {
  return {
    kind: "text",
    start_beat: rEvent.startTime as Beat,
    end_beat: rEvent.endTime as Beat,
    value: { text_value: rEvent.start },
  };
}

function convertRpeControlEntries(entries: RpeControlEntry[] | undefined): NoteControlEntry[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((e) => ({
    x: e.x,
    easing: RPE_EASING_MAP[e.easing ?? 1] ?? "linear" as EasingType,
    value: e.value ?? e.pos ?? e.alpha ?? e.size ?? e.skew ?? e.y ?? 0,
  }));
}

// ============================================================
// Event Layer Conversion
// ============================================================

function convertEventLayer(layer: RpeEventLayer): EventLayer {
  const convertEvents = (events: RpeEvent[] | undefined, kind: LineEventKind, negate = false, forceLinear = false): LineEvent[] => {
    if (!events) return [];
    return events.map((e) => {
      const adjusted = negate ? { ...e, start: -e.start, end: -e.end } : e;
      const adjusted2 = forceLinear ? { ...adjusted, easingType: 1, bezier: 0 } : adjusted;
      return convertRpeEvent(adjusted2, kind);
    });
  };

  return {
    move_x_events: convertEvents(layer.moveXEvents, "x"),
    move_y_events: convertEvents(layer.moveYEvents, "y"),
    rotate_events: convertEvents(layer.rotateEvents, "rotation", true),
    alpha_events: convertEvents(layer.alphaEvents, "opacity"),
    speed_events: convertEvents(layer.speedEvents, "speed", false, true),
  };
}

// ============================================================
// Main Converter
// ============================================================

export function convertRpeToPhichain(rpeJson: string): PhichainChart {
  const rpe: RpeChart = JSON.parse(rpeJson);

  // Convert BPM list
  const bpm_list: BpmPoint[] = rpe.BPMList.map((b) => ({
    beat: b.startTime as Beat,
    bpm: b.bpm,
  }));

  // Convert lines
  const lines: Line[] = rpe.judgeLineList.map((rLine, lineIdx) => {
    // Convert notes with all properties
    const notes: Note[] = (rLine.notes ?? []).map((rNote) => {
      const kind = rpeNoteTypeToKind(rNote.type);
      const note: Note = {
        kind,
        above: rNote.above === 1,
        beat: rNote.startTime as Beat,
        x: Math.round(rNote.positionX),
        speed: rNote.speed,
        fake: rNote.isFake === 1 ? true : undefined,
        y_offset: rNote.yOffset ? rNote.yOffset : undefined,
        size: rNote.size != null && rNote.size !== 1 ? rNote.size : undefined,
        alpha: rNote.alpha != null && rNote.alpha !== 255 ? rNote.alpha : undefined,
        visible_time: rNote.visibleTime != null && rNote.visibleTime !== 999999 ? rNote.visibleTime : undefined,
      };

      if (kind === "hold") {
        note.hold_beat = subtractBeats(
          rNote.endTime as Beat,
          rNote.startTime as Beat,
        );
      }

      return note;
    });

    // Convert event layers (preserve layer structure instead of flattening)
    const rawLayers = (rLine.eventLayers ?? []).filter(Boolean) as RpeEventLayer[];
    const eventLayers: EventLayer[] = rawLayers.map(convertEventLayer);

    // Also build flat events array for backward compat and single-layer charts
    const events: LineEvent[] = [];
    const defaultBeat: Beat = [0, 0, 1];
    const farBeat: Beat = [1000, 0, 1];

    // Flatten all layers into flat events (for existing code that reads line.events)
    for (const layer of rawLayers) {
      if (layer.moveXEvents) {
        for (const e of layer.moveXEvents) {
          events.push(convertRpeEvent(e, "x"));
        }
      }
      if (layer.moveYEvents) {
        for (const e of layer.moveYEvents) {
          events.push(convertRpeEvent(e, "y"));
        }
      }
      if (layer.rotateEvents) {
        for (const e of layer.rotateEvents) {
          events.push(convertRpeEvent({ ...e, start: -e.start, end: -e.end }, "rotation"));
        }
      }
      if (layer.alphaEvents) {
        for (const e of layer.alphaEvents) {
          events.push(convertRpeEvent(e, "opacity"));
        }
      }
      if (layer.speedEvents) {
        for (const e of layer.speedEvents) {
          events.push(convertRpeEvent({ ...e, easingType: 1 }, "speed"));
        }
      }
    }

    // Convert extended events (these go into the flat events array)
    if (rLine.extended) {
      if (rLine.extended.scaleXEvents) {
        for (const e of rLine.extended.scaleXEvents) {
          events.push(convertRpeEvent(e, "scale_x"));
        }
      }
      if (rLine.extended.scaleYEvents) {
        for (const e of rLine.extended.scaleYEvents) {
          events.push(convertRpeEvent(e, "scale_y"));
        }
      }
      if (rLine.extended.colorEvents) {
        for (const e of rLine.extended.colorEvents) {
          events.push(convertRpeColorEvent(e));
        }
      }
      if (rLine.extended.textEvents) {
        for (const e of rLine.extended.textEvents) {
          events.push(convertRpeTextEvent(e));
        }
      }
      if (rLine.extended.inclineEvents) {
        for (const e of rLine.extended.inclineEvents) {
          events.push(convertRpeEvent(e, "incline"));
        }
      }
    }

    // If no events for a core kind, add a default
    const coreKinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];
    for (const kind of coreKinds) {
      if (!events.some((e) => e.kind === kind)) {
        const defaultVal = kind === "opacity" ? 255 : kind === "speed" ? 1 : 0;
        events.push({
          kind,
          start_beat: defaultBeat,
          end_beat: farBeat,
          value: { constant: defaultVal },
        });
      }
    }

    const line: Line = {
      name: rLine.Name ?? "Unnamed",
      notes,
      events,
      children: [],
      curve_note_tracks: [],
    };

    // Event layers (only store if there are multiple layers with data)
    if (eventLayers.length > 0) {
      line.event_layers = eventLayers;
    }

    // Line properties
    if (rLine.zOrder != null && rLine.zOrder !== 0) line.z_order = rLine.zOrder;
    if (rLine.isCover != null && rLine.isCover !== 1) line.is_cover = rLine.isCover === 1;
    if (rLine.bpmfactor != null && rLine.bpmfactor !== 1) line.bpm_factor = rLine.bpmfactor;
    if (rLine.Group != null) line.group = rLine.Group;
    if (rLine.Texture && rLine.Texture !== "line.png") line.texture = rLine.Texture;
    if (rLine.anchor) line.anchor = rLine.anchor;
    if (rLine.rotateWithFather === false) line.rotate_with_father = false;
    if (rLine.father != null && rLine.father !== -1) line.father_index = rLine.father;

    // Note controls
    line.pos_control = convertRpeControlEntries(rLine.posControl);
    line.alpha_control = convertRpeControlEntries(rLine.alphaControl);
    line.size_control = convertRpeControlEntries(rLine.sizeControl);
    line.skew_control = convertRpeControlEntries(rLine.skewControl);
    line.y_control = convertRpeControlEntries(rLine.yControl);

    return line;
  });

  const chart: PhichainChart = {
    format: 1,
    offset: (rpe.META?.offset ?? 0) / 1000,
    bpm_list: bpm_list.length > 0 ? bpm_list : [{ beat: [0, 0, 1], bpm: 120 }],
    lines,
  };

  if (rpe.judgeLineGroup && rpe.judgeLineGroup.length > 0) {
    chart.line_groups = rpe.judgeLineGroup;
  }

  return chart;
}

/**
 * Extract metadata from an RPE chart's META section.
 */
export function extractRpeMeta(rpeJson: string): {
  name: string;
  composer: string;
  charter: string;
  level: string;
  illustrator: string;
} {
  try {
    const rpe: RpeChart = JSON.parse(rpeJson);
    return {
      name: rpe.META?.name ?? "",
      composer: rpe.META?.composer ?? "",
      charter: rpe.META?.charter ?? "",
      level: rpe.META?.level ?? "",
      illustrator: rpe.META?.illustrator ?? "",
    };
  } catch {
    return { name: "", composer: "", charter: "", level: "", illustrator: "" };
  }
}

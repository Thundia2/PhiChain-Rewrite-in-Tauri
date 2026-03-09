// ============================================================
// RPE (Re:PhiEdit) Format Importer
//
// Converts RPE JSON charts to phichain's internal format.
// RPE uses a different structure with event layers and numeric
// easing type IDs.
//
// Original from phichain-chart/src/format/rpe.rs
// ============================================================

import type {
  PhichainChart,
  Line,
  Note,
  LineEvent,
  BpmPoint,
  Beat,
  NoteKind,
  EasingType,
  LineEventKind,
} from "../types/chart";
import { subtractBeats } from "./beat";

// ============================================================
// RPE Format Types
// ============================================================

interface RpeChart {
  BPMList: Array<{ bpm: number; startTime: [number, number, number] }>;
  META?: { RPEVersion?: number; name?: string; composer?: string; charter?: string; level?: string; illustrator?: string; offset?: number };
  judgeLineList: RpeLine[];
}

interface RpeLine {
  Name?: string;
  notes?: RpeNote[];
  eventLayers?: (RpeEventLayer | null)[];
  father?: number; // Parent line index (-1 = no parent)
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
}

interface RpeEvent {
  startTime: [number, number, number];
  endTime: [number, number, number];
  start: number;
  end: number;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
}

// ============================================================
// RPE → Phichain Easing Mapping
// ============================================================

// Mapping from RPE easing IDs to phichain easing types.
// Matches the Rust `static RPE_EASING: [Easing; 30]` array (0-indexed).
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

function rpeEasingToPhichain(easingType: number): EasingType {
  return RPE_EASING_MAP[easingType] ?? "linear";
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
// RPE coordinate conversion
// ============================================================

// RPE X is in "half-screen widths" (range ~-675 to 675 maps to canvas)
// RPE Y is similar but vertical
// RPE rotation is in degrees (same as phichain)
// RPE alpha is 0-255 (same as phichain)

function convertRpeEvent(rEvent: RpeEvent, kind: LineEventKind): LineEvent {
  const startBeat = rEvent.startTime as Beat;
  const endBeat = rEvent.endTime as Beat;
  const easingType = rpeEasingToPhichain(rEvent.easingType ?? 1);

  if (rEvent.start === rEvent.end) {
    return {
      kind,
      start_beat: startBeat,
      end_beat: endBeat,
      value: { constant: rEvent.start },
    };
  }

  return {
    kind,
    start_beat: startBeat,
    end_beat: endBeat,
    value: {
      transition: {
        start: rEvent.start,
        end: rEvent.end,
        easing: easingType,
      },
    },
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
  const lines: Line[] = rpe.judgeLineList.map((rLine) => {
    // Convert notes
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
      };

      // Hold notes have a duration
      if (kind === "hold") {
        note.hold_beat = subtractBeats(
          rNote.endTime as Beat,
          rNote.startTime as Beat,
        );
      }

      return note;
    });

    // Convert events from all layers
    const events: LineEvent[] = [];
    const defaultBeat: Beat = [0, 0, 1];
    const farBeat: Beat = [1000, 0, 1];

    for (const layer of (rLine.eventLayers ?? []).filter(Boolean) as RpeEventLayer[]) {
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
          // RPE rotation values need to be negated (matches Rust: start: -event.start, end: -event.end)
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
          // Speed events always use linear easing (matches Rust: easing: Easing::Linear)
          events.push(convertRpeEvent({ ...e, easingType: 1 }, "speed"));
        }
      }
    }

    // If no events for a kind, add a default
    const kinds: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];
    for (const kind of kinds) {
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

    return {
      name: rLine.Name ?? "Unnamed",
      notes,
      events,
      children: [],
      curve_note_tracks: [],
    };
  });

  return {
    format: 1,
    offset: (rpe.META?.offset ?? 0) / 1000, // RPE stores ms, phichain uses seconds
    bpm_list: bpm_list.length > 0 ? bpm_list : [{ beat: [0, 0, 1], bpm: 120 }],
    lines,
  };
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

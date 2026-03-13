// ============================================================
// PEC (Phigros Editor Chart) Format Exporter
//
// Converts phichain's internal format to PEC text format.
// This is the inverse of pecImport.ts.
//
// PEC is a lossy format — it only supports the 5 core event types
// (x, y, rotation, opacity, speed) and basic note properties.
// Extended events, layers, RPE features are all dropped.
//
// Format:
//   offset <ms>
//   bp <startBeat> <bpm>
//   cp                                — start line definition
//     cv <startBeat> <endBeat> <prop> <start> <end> <easingType>
//   n<type> <line> <beat> <x> <holdBeat> <speed> <side>
// ============================================================

import type { PhichainChart, Line, LineEvent, EasingType } from "../types/chart";
import { beatToFloat } from "../types/chart";

// ============================================================
// Phichain → PEC Easing Mapping (inverse of PEC_EASINGS in pecImport)
// ============================================================

const PHICHAIN_TO_PEC_EASING: Record<string, number> = {
  linear: 1,
  ease_out_sine: 2,
  ease_in_sine: 3,
  ease_out_quad: 4,
  ease_in_quad: 5,
  ease_in_out_sine: 6,
  ease_in_out_quad: 7,
  ease_out_cubic: 8,
  ease_in_cubic: 9,
  ease_out_quart: 10,
  ease_in_quart: 11,
  ease_in_out_cubic: 12,
  ease_in_out_quart: 13,
  ease_out_quint: 14,
  ease_in_quint: 15,
  ease_out_expo: 16,
  ease_in_expo: 17,
  ease_out_circ: 18,
  ease_in_circ: 19,
  ease_out_back: 20,
  ease_in_back: 21,
  ease_in_out_circ: 22,
  ease_in_out_back: 23,
  ease_out_elastic: 24,
  ease_in_elastic: 25,
  ease_out_bounce: 26,
  ease_in_bounce: 27,
  ease_in_out_bounce: 28,
  ease_in_out_elastic: 29,
};

function easingToPec(easing: EasingType): number {
  if (typeof easing === "string") {
    return PHICHAIN_TO_PEC_EASING[easing] ?? 1;
  }
  // Custom bezier, steps, elastic → fall back to linear
  return 1;
}

// PEC property IDs
const KIND_TO_PEC_PROP: Record<string, number> = {
  x: 1,
  y: 2,
  rotation: 3,
  opacity: 4,
  speed: 5,
};

function noteKindToPec(kind: string): string {
  switch (kind) {
    case "tap": return "n1";
    case "drag": return "n2";
    case "hold": return "n3";
    case "flick": return "n4";
    default: return "n1";
  }
}

// ============================================================
// Coordinate Conversion (phichain → PEC)
//
// Inverse of what pecImport does:
//   PEC X: center=0, range ~-2048..2048  ←  phichain X: -675..675
//   PEC Y: bottom=0, top=1400            ←  phichain Y: -450..450
//   PEC rotation: negated degrees        ←  phichain rotation: degrees
// ============================================================

function convertEventValue(kind: string, value: number): number {
  switch (kind) {
    case "x":
      return (value / 675) * 2048;
    case "y":
      return ((value + 450) / 900) * 1400;
    case "rotation":
      return -value;
    default:
      return value;
  }
}

// ============================================================
// Main Export Function
// ============================================================

export function convertPhichainToPec(chart: PhichainChart): string {
  const lines: string[] = [];

  // Offset (ms)
  lines.push(`offset ${Math.round(chart.offset * 1000)}`);
  lines.push("");

  // BPM list
  for (const bp of chart.bpm_list) {
    const beat = beatToFloat(bp.beat);
    lines.push(`bp ${beat} ${bp.bpm}`);
  }
  lines.push("");

  // Lines and their events
  for (const line of chart.lines) {
    lines.push("cp");

    // Collect events — flatten event layers if present
    const events = collectCoreEvents(line);

    // Sort events by start beat, then by property
    events.sort((a, b) => {
      const aStart = beatToFloat(a.start_beat);
      const bStart = beatToFloat(b.start_beat);
      if (aStart !== bStart) return aStart - bStart;
      return (KIND_TO_PEC_PROP[a.kind] ?? 0) - (KIND_TO_PEC_PROP[b.kind] ?? 0);
    });

    for (const event of events) {
      const prop = KIND_TO_PEC_PROP[event.kind];
      if (prop == null) continue; // Skip extended event types

      const startBeat = beatToFloat(event.start_beat);
      const endBeat = beatToFloat(event.end_beat);

      let startVal: number;
      let endVal: number;
      let easingId = 1;

      if ("constant" in event.value) {
        startVal = event.value.constant;
        endVal = event.value.constant;
      } else if ("transition" in event.value) {
        startVal = event.value.transition.start;
        endVal = event.value.transition.end;
        easingId = easingToPec(event.value.transition.easing);
      } else {
        continue; // color/text events — not supported in PEC
      }

      // Convert coordinates
      startVal = convertEventValue(event.kind, startVal);
      endVal = convertEventValue(event.kind, endVal);

      lines.push(`  cv ${startBeat} ${endBeat} ${prop} ${startVal} ${endVal} ${easingId}`);
    }
  }
  lines.push("");

  // Notes
  for (let lineIdx = 0; lineIdx < chart.lines.length; lineIdx++) {
    const line = chart.lines[lineIdx];
    for (const note of line.notes) {
      if (note.fake) continue; // PEC doesn't support fake notes

      const cmd = noteKindToPec(note.kind);
      const beat = beatToFloat(note.beat);
      const x = (note.x / 675) * 2048; // phichain X → PEC X
      const holdBeat = note.hold_beat ? beatToFloat(note.hold_beat) : 0;
      const speed = note.speed;
      const side = note.above ? 1 : 2;

      lines.push(`${cmd} ${lineIdx} ${beat} ${x} ${holdBeat} ${speed} ${side}`);
    }
  }

  return lines.join("\n");
}

/**
 * Collect the 5 core event types from a line, flattening event layers if present.
 * Only returns x, y, rotation, opacity, speed events.
 */
function collectCoreEvents(line: Line): LineEvent[] {
  const coreKinds = new Set(["x", "y", "rotation", "opacity", "speed"]);

  if (line.event_layers && line.event_layers.length > 0) {
    // Flatten all layers into a single event list
    // Note: PEC doesn't support additive layers, so we just merge them
    const events: LineEvent[] = [];
    for (const layer of line.event_layers) {
      events.push(...layer.move_x_events.filter(e => coreKinds.has(e.kind)));
      events.push(...layer.move_y_events.filter(e => coreKinds.has(e.kind)));
      events.push(...layer.rotate_events.filter(e => coreKinds.has(e.kind)));
      events.push(...layer.alpha_events.filter(e => coreKinds.has(e.kind)));
      events.push(...layer.speed_events.filter(e => coreKinds.has(e.kind)));
    }
    return events;
  }

  return line.events.filter(e => coreKinds.has(e.kind));
}

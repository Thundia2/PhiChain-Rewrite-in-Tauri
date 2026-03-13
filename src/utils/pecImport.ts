// ============================================================
// PEC Import
//
// Converts the legacy PEC (Phigros Editor Chart) text format
// into PhichainChart format. PEC is a line-based text format
// used by older Phigros editors.
//
// Format overview:
//   bp <startBeat> <bpm>              — BPM change
//   cp <lineData>                     — Define a judgment line
//     cv <startBeat> <endBeat> <prop> <start> <end> <easingType>  — Line event
//     ca <startBeat> <endBeat> <prop> <start> <end> <easingType>  — Line event (deprecated alias)
//   n1 <line> <beat> <x> <holdBeat> <speed> <side>  — Tap
//   n2 <line> <beat> <x> <holdBeat> <speed> <side>  — Drag
//   n3 <line> <beat> <x> <holdBeat> <speed> <side>  — Hold
//   n4 <line> <beat> <x> <holdBeat> <speed> <side>  — Flick
//
// PEC is lossy: it only supports the 5 core event types and
// basic note properties. No layers, no extended events, no RPE features.
// ============================================================

import type { PhichainChart, Line, Note, LineEvent, BpmPoint, NoteKind, EasingType } from "../types/chart";
import { floatToBeat } from "../types/chart";

// PEC easing type mapping (PEC uses numeric IDs)
const PEC_EASINGS: Record<number, EasingType> = {
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

// PEC event property mapping
const PEC_PROPS: Record<number, string> = {
  1: "x",
  2: "y",
  3: "rotation",
  4: "opacity",
  5: "speed",
};

interface PecLine {
  events: LineEvent[];
}

/**
 * Parse a PEC text file and convert to PhichainChart format.
 */
export function convertPecToPhichain(pecText: string): PhichainChart {
  const lines: string[] = pecText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const bpmList: BpmPoint[] = [];
  const pecLines: PecLine[] = [];
  const notes: Array<{ lineIdx: number; note: Note }> = [];
  let offset = 0;

  let currentLine: PecLine | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "bp") {
      // BPM point: bp <startBeat> <bpm>
      const startBeat = parseFloat(parts[1]) || 0;
      const bpm = parseFloat(parts[2]) || 120;
      bpmList.push({ beat: floatToBeat(startBeat), bpm });
    } else if (cmd === "cp") {
      // New line definition
      currentLine = { events: [] };
      pecLines.push(currentLine);
    } else if ((cmd === "cv" || cmd === "ca") && currentLine) {
      // Line event: cv/ca <startBeat> <endBeat> <prop> <start> <end> [easingType]
      const startBeat = parseFloat(parts[1]) || 0;
      const endBeat = parseFloat(parts[2]) || 0;
      const propId = parseInt(parts[3]) || 1;
      const startVal = parseFloat(parts[4]) || 0;
      const endVal = parseFloat(parts[5]) || 0;
      const easingId = parseInt(parts[6]) || 0;

      const kind = PEC_PROPS[propId] as LineEvent["kind"] | undefined;
      if (!kind) continue;

      const easing = PEC_EASINGS[easingId] ?? "linear";

      // PEC uses different coordinate systems:
      // X: center = 0, range = -2048 to 2048 (map to -675..675)
      // Y: bottom = 0, top = 1400 (map to -450..450)
      // Rotation: already in degrees but needs negation
      // Opacity: 0-255 (same as phichain)
      // Speed: same scale

      let adjStart = startVal;
      let adjEnd = endVal;

      if (kind === "x") {
        adjStart = (startVal / 2048) * 675;
        adjEnd = (endVal / 2048) * 675;
      } else if (kind === "y") {
        adjStart = (startVal / 1400) * 900 - 450;
        adjEnd = (endVal / 1400) * 900 - 450;
      } else if (kind === "rotation") {
        adjStart = -startVal;
        adjEnd = -endVal;
      }

      const event: LineEvent = {
        kind,
        start_beat: floatToBeat(startBeat),
        end_beat: floatToBeat(endBeat),
        value: Math.abs(adjEnd - adjStart) < 0.001
          ? { constant: adjStart }
          : { transition: { start: adjStart, end: adjEnd, easing } },
      };

      currentLine.events.push(event);
    } else if (cmd === "n1" || cmd === "n2" || cmd === "n3" || cmd === "n4") {
      // Note: n<type> <line> <beat> <x> <holdBeat> <speed> <side>
      const noteTypeMap: Record<string, NoteKind> = {
        n1: "tap",
        n2: "drag",
        n3: "hold",
        n4: "flick",
      };
      const kind = noteTypeMap[cmd];
      const lineIdx = parseInt(parts[1]) || 0;
      const beat = parseFloat(parts[2]) || 0;
      const x = parseFloat(parts[3]) || 0;
      const holdBeat = parseFloat(parts[4]) || 0;
      const speed = parseFloat(parts[5]) || 1;
      const side = parseInt(parts[6]) ?? 1;

      // PEC X: center = 0, range ~-2048..2048, map to -675..675
      const adjX = (x / 2048) * 675;

      const note: Note = {
        kind,
        above: side === 1,
        beat: floatToBeat(beat),
        x: Math.round(adjX * 10) / 10,
        speed,
      };

      if (kind === "hold" && holdBeat > 0) {
        note.hold_beat = floatToBeat(holdBeat);
      }

      notes.push({ lineIdx, note });
    } else if (cmd === "offset") {
      offset = (parseFloat(parts[1]) || 0) / 1000; // ms to seconds
    }
  }

  // Ensure at least one BPM point
  if (bpmList.length === 0) {
    bpmList.push({ beat: [0, 0, 1], bpm: 120 });
  }

  // Build chart lines
  const chartLines: Line[] = pecLines.map((pl, idx) => {
    const line: Line = {
      name: `Line ${idx}`,
      notes: [],
      events: pl.events,
      children: [],
      curve_note_tracks: [],
    };
    return line;
  });

  // Assign notes to lines
  for (const { lineIdx, note } of notes) {
    if (lineIdx >= 0 && lineIdx < chartLines.length) {
      chartLines[lineIdx].notes.push(note);
    }
  }

  // Sort notes by beat
  for (const line of chartLines) {
    line.notes.sort((a, b) => {
      const af = a.beat[0] + a.beat[1] / a.beat[2];
      const bf = b.beat[0] + b.beat[1] / b.beat[2];
      return af - bf;
    });
    line.events.sort((a, b) => {
      const af = a.start_beat[0] + a.start_beat[1] / a.start_beat[2];
      const bf = b.start_beat[0] + b.start_beat[1] / b.start_beat[2];
      return af - bf;
    });
  }

  return {
    format: 1,
    offset,
    bpm_list: bpmList,
    lines: chartLines,
  };
}

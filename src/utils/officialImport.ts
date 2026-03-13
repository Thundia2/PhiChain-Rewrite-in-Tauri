// ============================================================
// Official (Phigros) Format Importer
//
// Converts the Official Phigros JSON chart format into PhichainChart.
// Supports both formatVersion 1 and 3.
//
// Ported from phichain-chart/src/format/official.rs (into_primitive).
//
// Official format key differences from phichain internal:
//   - Time is in seconds (converted using BPM: beat = time * 1.875 / 60)
//   - Each line has its own BPM field (phichain uses a global BPM list)
//   - Move events pack X and Y (v1: x*1000+y, v3: separate start2/end2)
//   - Note X uses 0-18 range (mapped to -675..675 canvas)
//   - Opacity is 0-1 (phichain uses 0-255)
//   - Speed events have a single "value" (not start/end transition)
//   - All events use linear easing only
//   - Rotation stored directly in degrees (negated from RPE convention)
// ============================================================

import type { PhichainChart, Line, Note, LineEvent, Beat, NoteKind } from "../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT, floatToBeat } from "../types/chart";

// ============================================================
// Official Format Types
// ============================================================

interface OfficialNote {
  type: number; // 1=Tap, 2=Drag, 3=Hold, 4=Flick
  time: number; // seconds
  holdTime: number; // seconds (for Hold notes)
  positionX: number; // 0-18 range
  speed: number;
  floorPosition: number;
}

interface OfficialNumericEvent {
  startTime: number; // seconds
  endTime: number;
  start: number;
  end: number;
}

interface OfficialPositionEvent {
  startTime: number;
  endTime: number;
  start: number;  // X (v3: normalized 0-1; v1: packed x*1000+y)
  start2?: number; // Y (v3 only)
  end: number;
  end2?: number;
}

interface OfficialSpeedEvent {
  startTime: number;
  endTime: number;
  value: number;
  floorPosition: number;
}

interface OfficialLine {
  bpm: number;
  judgeLineMoveEvents: OfficialPositionEvent[];
  judgeLineRotateEvents: OfficialNumericEvent[];
  judgeLineDisappearEvents: OfficialNumericEvent[];
  speedEvents: OfficialSpeedEvent[];
  notesAbove: OfficialNote[];
  notesBelow: OfficialNote[];
}

interface OfficialChart {
  formatVersion: number;
  offset: number; // seconds
  judgeLineList: OfficialLine[];
}

// ============================================================
// Conversion Helpers
// ============================================================

/** Convert seconds to Beat tuple using the line's BPM */
function timeToBeat(time: number): Beat {
  // Official format: beat = time * 1.875 / 60
  // 1.875 = 32/128 * 60 / BPM... actually this is a fixed conversion:
  // The time values in Official format are "tick-based" using 1875000 ticks per minute
  // Simplified: beat = time * 1.875 / 60
  // But wait — in the Rust code the BPM is per-line and time conversion is fixed at 1.875/60
  // This gives us the beat position
  const beatValue = time * 1.875 / 60;
  return floatToBeat(beatValue);
}

/** Map Official note type number to NoteKind */
function noteTypeToKind(type: number): NoteKind {
  switch (type) {
    case 1: return "tap";
    case 2: return "drag";
    case 3: return "hold";
    case 4: return "flick";
    default: return "tap";
  }
}

// ============================================================
// Main Import Function
// ============================================================

export function convertOfficialToPhichain(json: string): PhichainChart {
  const official: OfficialChart = JSON.parse(json);

  if (!official.judgeLineList || official.judgeLineList.length === 0) {
    throw new Error("Chart has no judge lines");
  }

  if (official.formatVersion !== 1 && official.formatVersion !== 3) {
    throw new Error(`Unsupported formatVersion: ${official.formatVersion}, expected 1 or 3`);
  }

  const isV1 = official.formatVersion === 1;

  // Use the first line's BPM as the global BPM
  const globalBpm = official.judgeLineList[0].bpm;

  const chartLines: Line[] = official.judgeLineList.map((oLine, idx) => {
    const events: LineEvent[] = [];

    // Convert move events → X and Y events
    for (const event of oLine.judgeLineMoveEvents) {
      const startBeat = timeToBeat(event.startTime);
      const endBeat = timeToBeat(event.endTime);

      let startX: number, endX: number, startY: number, endY: number;

      if (isV1) {
        // v1: packed encoding — x*1000+y
        // X: (floor(start/1000)) / 880 → normalized, then to canvas
        // Y: (start % 1000) / 530 → normalized, then to canvas
        startX = (Math.round(event.start / 1e3) / 880 - 0.5) * CANVAS_WIDTH;
        endX = (Math.round(event.end / 1e3) / 880 - 0.5) * CANVAS_WIDTH;
        startY = ((event.start % 1e3) / 530 - 0.5) * CANVAS_HEIGHT;
        endY = ((event.end % 1e3) / 530 - 0.5) * CANVAS_HEIGHT;
      } else {
        // v3: separate X and Y fields, normalized 0-1
        startX = (event.start - 0.5) * CANVAS_WIDTH;
        endX = (event.end - 0.5) * CANVAS_WIDTH;
        startY = ((event.start2 ?? 0.5) - 0.5) * CANVAS_HEIGHT;
        endY = ((event.end2 ?? 0.5) - 0.5) * CANVAS_HEIGHT;
      }

      events.push({
        kind: "x",
        start_beat: startBeat,
        end_beat: endBeat,
        value: Math.abs(endX - startX) < 0.01
          ? { constant: startX }
          : { transition: { start: startX, end: endX, easing: "linear" } },
      });

      events.push({
        kind: "y",
        start_beat: startBeat,
        end_beat: endBeat,
        value: Math.abs(endY - startY) < 0.01
          ? { constant: startY }
          : { transition: { start: startY, end: endY, easing: "linear" } },
      });
    }

    // Convert rotation events
    for (const event of oLine.judgeLineRotateEvents) {
      const startBeat = timeToBeat(event.startTime);
      const endBeat = timeToBeat(event.endTime);

      events.push({
        kind: "rotation",
        start_beat: startBeat,
        end_beat: endBeat,
        value: Math.abs(event.end - event.start) < 0.01
          ? { constant: event.start }
          : { transition: { start: event.start, end: event.end, easing: "linear" } },
      });
    }

    // Convert opacity events (Official: 0-1 → phichain: 0-255)
    for (const event of oLine.judgeLineDisappearEvents) {
      const startBeat = timeToBeat(event.startTime);
      const endBeat = timeToBeat(event.endTime);
      const startVal = event.start * 255;
      const endVal = event.end * 255;

      events.push({
        kind: "opacity",
        start_beat: startBeat,
        end_beat: endBeat,
        value: Math.abs(endVal - startVal) < 0.01
          ? { constant: startVal }
          : { transition: { start: startVal, end: endVal, easing: "linear" } },
      });
    }

    // Convert speed events
    // Official speed events have a single "value" (constant speed for that range)
    // Rust conversion: speed = value / 2.0 * 9.0
    for (const event of oLine.speedEvents) {
      const startBeat = timeToBeat(event.startTime);
      const endBeat = timeToBeat(event.endTime);
      const speed = event.value / 2.0 * 9.0;

      events.push({
        kind: "speed",
        start_beat: startBeat,
        end_beat: endBeat,
        value: { constant: speed },
      });
    }

    // Convert notes
    const notes: Note[] = [];

    const convertNote = (oNote: OfficialNote, above: boolean): Note => {
      const kind = noteTypeToKind(oNote.type);
      const beat = timeToBeat(oNote.time);
      // Official X: 0-18 range → canvas: x/18 * CANVAS_WIDTH, centered
      const x = oNote.positionX / 18.0 * CANVAS_WIDTH;

      const note: Note = {
        kind,
        above,
        beat,
        x,
        speed: oNote.speed,
      };

      if (kind === "hold" && oNote.holdTime > 0) {
        note.hold_beat = timeToBeat(oNote.holdTime);
      }

      return note;
    };

    for (const oNote of oLine.notesAbove) {
      notes.push(convertNote(oNote, true));
    }
    for (const oNote of oLine.notesBelow) {
      notes.push(convertNote(oNote, false));
    }

    // Adjust hold note speeds (from Rust: note.speed /= speed / 9.0 * 2.0)
    // This reverses the speed baking that the Official format applies to holds
    const speedEvents = events
      .filter(e => e.kind === "speed")
      .sort((a, b) => {
        const af = a.start_beat[0] + a.start_beat[1] / a.start_beat[2];
        const bf = b.start_beat[0] + b.start_beat[1] / b.start_beat[2];
        return af - bf;
      });

    for (const note of notes) {
      if (note.kind === "hold") {
        const noteBeat = note.beat[0] + note.beat[1] / note.beat[2];
        let speed = 0;
        for (const event of speedEvents) {
          const startBeat = event.start_beat[0] + event.start_beat[1] / event.start_beat[2];
          if (startBeat > noteBeat) break;
          if ("constant" in event.value) {
            speed = event.value.constant;
          } else if ("transition" in event.value) {
            speed = event.value.transition.end;
          }
        }
        if (speed !== 0) {
          note.speed /= speed / 9.0 * 2.0;
        }
      }
    }

    // Sort notes by beat
    notes.sort((a, b) => {
      const af = a.beat[0] + a.beat[1] / a.beat[2];
      const bf = b.beat[0] + b.beat[1] / b.beat[2];
      return af - bf;
    });

    // Sort events by start beat
    events.sort((a, b) => {
      const af = a.start_beat[0] + a.start_beat[1] / a.start_beat[2];
      const bf = b.start_beat[0] + b.start_beat[1] / b.start_beat[2];
      return af - bf;
    });

    const line: Line = {
      name: `Line ${idx}`,
      notes,
      events,
      children: [],
      curve_note_tracks: [],
    };

    return line;
  });

  return {
    format: 1,
    offset: official.offset,
    bpm_list: [{ beat: [0, 0, 1] as Beat, bpm: globalBpm }],
    lines: chartLines,
  };
}

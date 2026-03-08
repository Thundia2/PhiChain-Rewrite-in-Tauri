// ============================================================
// BPM List Utilities
//
// Ported from phichain-chart/src/bpm_list.rs
//
// A chart can have tempo (BPM) changes at any beat. This class
// converts between "beat position" and "time in seconds" by
// keeping a sorted list of BPM change points and integrating
// the tempo between them.
//
// Example: If the song starts at 120 BPM and changes to 240 BPM
// at beat 4, then:
//   - Beat 0 = 0.0 seconds
//   - Beat 1 = 0.5 seconds (120 BPM → 0.5s per beat)
//   - Beat 4 = 2.0 seconds
//   - Beat 5 = 2.25 seconds (240 BPM → 0.25s per beat)
// ============================================================

import type { Beat, BpmPoint } from "../types/chart";
import { beatToFloat, floatToBeat } from "./beat";

/** Internal representation with pre-computed time values */
interface ComputedBpmPoint {
  beat: Beat;
  bpm: number;
  /** Pre-computed: the time in seconds at this BPM change */
  time: number;
}

export class BpmList {
  private points: ComputedBpmPoint[];

  /**
   * Create a new BPM list from an array of BPM change points.
   *
   * @param rawPoints - Array from the chart JSON (each has `beat` and `bpm`)
   */
  constructor(rawPoints: BpmPoint[]) {
    // Sort by beat position (should already be sorted, but be safe)
    const sorted = [...rawPoints].sort(
      (a, b) => beatToFloat(a.beat) - beatToFloat(b.beat)
    );

    // Pre-compute the time in seconds at each BPM change.
    // This is the core of how beat↔time conversion works:
    // the time between two BPM points equals
    //   (beatDifference) × (60 / bpm)
    this.points = [];
    let time = 0;
    let lastBeat = 0;
    let lastBpm = -1;

    for (const point of sorted) {
      const beatVal = beatToFloat(point.beat);
      if (lastBpm !== -1) {
        time += (beatVal - lastBeat) * (60.0 / lastBpm);
      }
      lastBeat = beatVal;
      lastBpm = point.bpm;
      this.points.push({ beat: point.beat, bpm: point.bpm, time });
    }

    // If no points were given, use a default of 120 BPM
    if (this.points.length === 0) {
      this.points = [{ beat: [0, 0, 1], bpm: 120, time: 0 }];
    }
  }

  /**
   * Convert a beat position to a time in seconds.
   *
   * Finds the last BPM point before the given beat, then calculates
   * how much time has elapsed since that point.
   *
   * @param beat - The beat position (as a Beat tuple)
   * @returns Time in seconds
   */
  timeAt(beat: Beat): number {
    const beatVal = beatToFloat(beat);
    return this.timeAtFloat(beatVal);
  }

  /**
   * Same as timeAt but takes a float beat value directly.
   * Used internally and by rendering code that works with floats.
   */
  timeAtFloat(beatVal: number): number {
    // Find the last BPM point at or before this beat
    let point = this.points[0];
    for (const p of this.points) {
      if (beatToFloat(p.beat) <= beatVal) {
        point = p;
      } else {
        break;
      }
    }

    // Time = (point's pre-computed time) + (remaining beats × seconds per beat)
    return point.time + (beatVal - beatToFloat(point.beat)) * (60.0 / point.bpm);
  }

  /**
   * Convert a time in seconds to a beat position.
   *
   * Finds the last BPM point before the given time, then calculates
   * how many beats have elapsed since that point.
   *
   * @param time - Time in seconds
   * @returns The beat position as a float (use floatToBeat to convert to Beat)
   */
  beatAtFloat(time: number): number {
    // Find the last BPM point at or before this time
    let point = this.points[0];
    for (const p of this.points) {
      if (p.time <= time) {
        point = p;
      } else {
        break;
      }
    }

    // Beat = (point's beat) + (remaining seconds × beats per second)
    return beatToFloat(point.beat) + (time - point.time) * point.bpm / 60.0;
  }

  /**
   * Convert a time in seconds to a Beat tuple.
   *
   * @param time - Time in seconds
   * @param maxDenom - Maximum denominator for the resulting beat (default 32)
   */
  beatAt(time: number, maxDenom: number = 32): Beat {
    return floatToBeat(this.beatAtFloat(time), maxDenom);
  }

  /**
   * Get the BPM at a specific time in seconds.
   * Useful for displaying "current BPM" in the status bar.
   */
  bpmAtTime(time: number): number {
    let point = this.points[0];
    for (const p of this.points) {
      if (p.time <= time) {
        point = p;
      } else {
        break;
      }
    }
    return point.bpm;
  }

  /**
   * Get the BPM at a specific beat position.
   */
  bpmAtBeat(beat: Beat): number {
    const beatVal = beatToFloat(beat);
    let point = this.points[0];
    for (const p of this.points) {
      if (beatToFloat(p.beat) <= beatVal) {
        point = p;
      } else {
        break;
      }
    }
    return point.bpm;
  }

  /** Get the raw BPM points (for serialization back to the chart format) */
  getRawPoints(): BpmPoint[] {
    return this.points.map((p) => ({ beat: p.beat, bpm: p.bpm }));
  }

  /** Get the number of BPM change points */
  get length(): number {
    return this.points.length;
  }
}

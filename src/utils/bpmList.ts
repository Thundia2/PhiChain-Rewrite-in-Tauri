// ============================================================
// BPM List Utilities
//
// Ported from phichain-chart/src/bpm_list.rs
//
// Recent change: Replaced O(n) linear lookups with O(log n) binary
// search in all beat/time conversion methods. Added pre-computed
// beatFloat array to avoid repeated beatToFloat() calls. Added
// lastIndex hint caching for temporal locality during playback.
// ============================================================

import type { Beat, BpmPoint } from "../types/chart";
import { beatToFloat, floatToBeat } from "./beat";

/** Internal representation with pre-computed time and beat float values */
interface ComputedBpmPoint {
  beat: Beat;
  beatFloat: number; // Pre-computed beatToFloat(beat) to avoid repeated conversion
  bpm: number;
  /** Pre-computed: the time in seconds at this BPM change */
  time: number;
}

export class BpmList {
  private points: ComputedBpmPoint[];

  // Temporal locality hint — remembers the last-found index to speed up
  // sequential lookups during playback (beats/times usually advance forward)
  private lastBeatIdx = 0;
  private lastTimeIdx = 0;

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
    this.points = [];
    let time = 0;
    let lastBeat = 0;
    let lastBpm = -1;

    for (const point of sorted) {
      const beatVal = beatToFloat(point.beat);
      const safeBpm = Math.max(point.bpm, Number.EPSILON);
      if (lastBpm > 0) {
        time += (beatVal - lastBeat) * (60.0 / lastBpm);
      }
      lastBeat = beatVal;
      lastBpm = safeBpm;
      this.points.push({ beat: point.beat, beatFloat: beatVal, bpm: safeBpm, time });
    }

    // If no points were given, use a default of 120 BPM
    if (this.points.length === 0) {
      this.points = [{ beat: [0, 0, 1], beatFloat: 0, bpm: 120, time: 0 }];
    }
  }

  /**
   * Binary search: find the last point where point[key] <= target.
   * Returns the index of that point (0 if target is before all points).
   */
  private findByBeat(beatVal: number): number {
    const pts = this.points;
    // Check hint first — temporal locality during playback
    if (this.lastBeatIdx < pts.length) {
      const h = pts[this.lastBeatIdx];
      if (h.beatFloat <= beatVal) {
        const next = this.lastBeatIdx + 1;
        if (next >= pts.length || pts[next].beatFloat > beatVal) {
          return this.lastBeatIdx;
        }
      }
    }
    // Binary search
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1; // Round up to avoid infinite loop
      if (pts[mid].beatFloat <= beatVal) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    this.lastBeatIdx = lo;
    return lo;
  }

  private findByTime(time: number): number {
    const pts = this.points;
    // Check hint first
    if (this.lastTimeIdx < pts.length) {
      const h = pts[this.lastTimeIdx];
      if (h.time <= time) {
        const next = this.lastTimeIdx + 1;
        if (next >= pts.length || pts[next].time > time) {
          return this.lastTimeIdx;
        }
      }
    }
    // Binary search
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (pts[mid].time <= time) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    this.lastTimeIdx = lo;
    return lo;
  }

  /** Convert a beat position (as a Beat tuple) to a time in seconds. */
  timeAt(beat: Beat): number {
    return this.timeAtFloat(beatToFloat(beat));
  }

  /** Same as timeAt but takes a float beat value directly. */
  timeAtFloat(beatVal: number): number {
    const idx = this.findByBeat(beatVal);
    const p = this.points[idx];
    return p.time + (beatVal - p.beatFloat) * (60.0 / Math.max(p.bpm, Number.EPSILON));
  }

  /** Convert a time in seconds to a beat position (as float). */
  beatAtFloat(time: number): number {
    const idx = this.findByTime(time);
    const p = this.points[idx];
    return p.beatFloat + (time - p.time) * p.bpm / 60.0;
  }

  /** Convert a time in seconds to a Beat tuple. */
  beatAt(time: number, maxDenom: number = 32): Beat {
    return floatToBeat(this.beatAtFloat(time), maxDenom);
  }

  /** Get the BPM at a specific time in seconds. */
  bpmAtTime(time: number): number {
    return this.points[this.findByTime(time)].bpm;
  }

  /** Get the BPM at a specific beat position. */
  bpmAtBeat(beat: Beat): number {
    return this.points[this.findByBeat(beatToFloat(beat))].bpm;
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

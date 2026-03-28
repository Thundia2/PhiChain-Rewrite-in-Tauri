// ============================================================
// BPM List Tests
//
// Tests for BpmList construction, beat->time conversion,
// time->beat conversion, and round-trip accuracy.
// ============================================================

import { describe, it, expect } from "vitest";
import { BpmList } from "../utils/bpmList";
import type { Beat, BpmPoint } from "../types/chart";
import { beatToFloat } from "../utils/beat";

describe("BpmList construction", () => {
  it("creates with a single BPM point", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.length).toBe(1);
  });

  it("creates with multiple BPM points", () => {
    const bl = new BpmList([
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [4, 0, 1], bpm: 240 },
    ]);
    expect(bl.length).toBe(2);
  });

  it("creates default BPM when given empty array", () => {
    const bl = new BpmList([]);
    expect(bl.length).toBe(1);
    // Default should be 120 BPM
    expect(bl.bpmAtTime(0)).toBe(120);
  });

  it("sorts BPM points by beat", () => {
    const bl = new BpmList([
      { beat: [4, 0, 1], bpm: 240 },
      { beat: [0, 0, 1], bpm: 120 },
    ]);
    expect(bl.bpmAtBeat([0, 0, 1])).toBe(120);
    expect(bl.bpmAtBeat([4, 0, 1])).toBe(240);
  });
});

describe("BpmList.timeAt", () => {
  it("returns 0 for beat 0", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.timeAt([0, 0, 1])).toBe(0);
  });

  it("calculates time at 120 BPM (1 beat = 0.5s)", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.timeAt([1, 0, 1])).toBeCloseTo(0.5, 5);
    expect(bl.timeAt([4, 0, 1])).toBeCloseTo(2.0, 5);
  });

  it("calculates time at 60 BPM (1 beat = 1.0s)", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 60 }]);
    expect(bl.timeAt([1, 0, 1])).toBeCloseTo(1.0, 5);
    expect(bl.timeAt([3, 0, 1])).toBeCloseTo(3.0, 5);
  });

  it("handles BPM changes correctly", () => {
    const bl = new BpmList([
      { beat: [0, 0, 1], bpm: 120 }, // 0.5s per beat
      { beat: [4, 0, 1], bpm: 240 }, // 0.25s per beat
    ]);

    // At beat 4: 4 beats * 0.5s = 2.0s
    expect(bl.timeAt([4, 0, 1])).toBeCloseTo(2.0, 5);

    // At beat 5: 2.0s + 1 beat * 0.25s = 2.25s
    expect(bl.timeAt([5, 0, 1])).toBeCloseTo(2.25, 5);

    // At beat 8: 2.0s + 4 beats * 0.25s = 3.0s
    expect(bl.timeAt([8, 0, 1])).toBeCloseTo(3.0, 5);
  });

  it("handles fractional beats", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    // Beat 2.5 = 2.5 * 0.5s = 1.25s
    expect(bl.timeAt([2, 1, 2])).toBeCloseTo(1.25, 5);
  });
});

describe("BpmList.beatAtFloat", () => {
  it("returns 0 for time 0", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.beatAtFloat(0)).toBe(0);
  });

  it("converts time back to beat at 120 BPM", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.beatAtFloat(0.5)).toBeCloseTo(1.0, 5);
    expect(bl.beatAtFloat(2.0)).toBeCloseTo(4.0, 5);
  });

  it("handles BPM changes in reverse", () => {
    const bl = new BpmList([
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [4, 0, 1], bpm: 240 },
    ]);

    // time 2.0 = beat 4 (in first segment)
    expect(bl.beatAtFloat(2.0)).toBeCloseTo(4.0, 5);

    // time 2.25 = beat 5 (in second segment)
    expect(bl.beatAtFloat(2.25)).toBeCloseTo(5.0, 5);
  });
});

describe("BpmList round-trip", () => {
  it("beat -> time -> beat is identity at constant BPM", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);

    const testBeats: Beat[] = [
      [0, 0, 1],
      [1, 0, 1],
      [2, 1, 4],
      [5, 3, 8],
      [10, 0, 1],
    ];

    for (const beat of testBeats) {
      const time = bl.timeAt(beat);
      const recoveredBeat = bl.beatAtFloat(time);
      expect(recoveredBeat).toBeCloseTo(beatToFloat(beat), 5);
    }
  });

  it("beat -> time -> beat is identity with BPM changes", () => {
    const bl = new BpmList([
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [4, 0, 1], bpm: 240 },
      { beat: [8, 0, 1], bpm: 60 },
    ]);

    const testBeats: Beat[] = [
      [0, 0, 1],
      [2, 0, 1],
      [4, 0, 1],
      [6, 0, 1],
      [8, 0, 1],
      [10, 0, 1],
    ];

    for (const beat of testBeats) {
      const time = bl.timeAt(beat);
      const recoveredBeat = bl.beatAtFloat(time);
      expect(recoveredBeat).toBeCloseTo(beatToFloat(beat), 5);
    }
  });
});

describe("BpmList.bpmAtTime", () => {
  it("returns BPM at start", () => {
    const bl = new BpmList([{ beat: [0, 0, 1], bpm: 120 }]);
    expect(bl.bpmAtTime(0)).toBe(120);
  });

  it("returns correct BPM after change", () => {
    const bl = new BpmList([
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [4, 0, 1], bpm: 240 },
    ]);
    expect(bl.bpmAtTime(0)).toBe(120);
    expect(bl.bpmAtTime(2.0)).toBe(240); // After beat 4
    expect(bl.bpmAtTime(3.0)).toBe(240); // Still in second segment
  });
});

describe("BpmList.getRawPoints", () => {
  it("returns original points for re-serialization", () => {
    const points: BpmPoint[] = [
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [4, 0, 1], bpm: 240 },
    ];
    const bl = new BpmList(points);
    const raw = bl.getRawPoints();

    expect(raw.length).toBe(2);
    expect(raw[0].bpm).toBe(120);
    expect(raw[1].bpm).toBe(240);
    expect(raw[0].beat).toEqual([0, 0, 1]);
    expect(raw[1].beat).toEqual([4, 0, 1]);
  });
});

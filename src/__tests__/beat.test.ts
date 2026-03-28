// ============================================================
// Beat Arithmetic Tests
//
// Tests for beatToFloat, floatToBeat, addBeats, subtractBeats,
// snapBeat, and related utilities from src/utils/beat.ts
// ============================================================

import { describe, it, expect } from "vitest";
import {
  beatToFloat,
  floatToBeat,
  addBeats,
  subtractBeats,
  snapBeat,
  reduceBeat,
  compareBeats,
  beatsEqual,
  formatBeat,
  minimumBeat,
} from "../utils/beat";
import type { Beat } from "../types/chart";

describe("beatToFloat", () => {
  it("converts zero beat", () => {
    expect(beatToFloat([0, 0, 1])).toBe(0);
  });

  it("converts whole beats", () => {
    expect(beatToFloat([3, 0, 1])).toBe(3);
  });

  it("converts fractional beats", () => {
    expect(beatToFloat([2, 3, 4])).toBe(2.75);
  });

  it("converts small fractions", () => {
    expect(beatToFloat([0, 1, 3])).toBeCloseTo(0.333333, 5);
  });

  it("converts beat 1 and 1/2", () => {
    expect(beatToFloat([1, 1, 2])).toBe(1.5);
  });
});

describe("floatToBeat", () => {
  it("converts 0 to [0, 0, 1]", () => {
    const result = floatToBeat(0);
    expect(beatToFloat(result)).toBe(0);
  });

  it("converts whole numbers", () => {
    const result = floatToBeat(5);
    expect(result[0]).toBe(5);
    expect(result[1]).toBe(0);
  });

  it("converts 2.75 to [2, 3, 4]", () => {
    const result = floatToBeat(2.75);
    expect(beatToFloat(result)).toBeCloseTo(2.75, 5);
  });

  it("converts 0.5 to beat with accurate fraction", () => {
    const result = floatToBeat(0.5);
    expect(beatToFloat(result)).toBeCloseTo(0.5, 5);
  });

  it("converts 1.333 to approximately [1, 1, 3]", () => {
    const result = floatToBeat(1.333333);
    expect(beatToFloat(result)).toBeCloseTo(1.333333, 3);
  });

  it("round-trips through float and back", () => {
    const original: Beat = [3, 7, 8];
    const asFloat = beatToFloat(original);
    const roundTripped = floatToBeat(asFloat);
    expect(beatToFloat(roundTripped)).toBeCloseTo(asFloat, 5);
  });
});

describe("addBeats", () => {
  it("adds two zero beats", () => {
    const result = addBeats([0, 0, 1], [0, 0, 1]);
    expect(beatToFloat(result)).toBe(0);
  });

  it("adds whole beats", () => {
    const result = addBeats([2, 0, 1], [3, 0, 1]);
    expect(beatToFloat(result)).toBe(5);
  });

  it("adds fractional beats", () => {
    const result = addBeats([1, 1, 4], [0, 3, 4]);
    expect(beatToFloat(result)).toBe(2);
  });

  it("adds with different denominators", () => {
    const result = addBeats([0, 1, 3], [0, 1, 4]);
    expect(beatToFloat(result)).toBeCloseTo(7 / 12, 5);
  });

  it("carries over when fraction >= 1", () => {
    const result = addBeats([0, 3, 4], [0, 3, 4]);
    expect(beatToFloat(result)).toBeCloseTo(1.5, 5);
  });
});

describe("subtractBeats", () => {
  it("subtracts equal beats to zero", () => {
    const result = subtractBeats([2, 1, 4], [2, 1, 4]);
    expect(beatToFloat(result)).toBeCloseTo(0, 5);
  });

  it("subtracts smaller from larger", () => {
    const result = subtractBeats([3, 0, 1], [1, 0, 1]);
    expect(beatToFloat(result)).toBe(2);
  });

  it("subtracts fractional beats", () => {
    const result = subtractBeats([2, 0, 1], [0, 1, 4]);
    expect(beatToFloat(result)).toBeCloseTo(1.75, 5);
  });
});

describe("snapBeat", () => {
  it("snaps to nearest quarter beat (density=4)", () => {
    const result = snapBeat(2.73, 4);
    expect(beatToFloat(result)).toBeCloseTo(2.75, 5);
  });

  it("snaps exact value unchanged", () => {
    const result = snapBeat(3.0, 4);
    expect(beatToFloat(result)).toBe(3);
  });

  it("snaps to nearest eighth beat (density=8)", () => {
    const result = snapBeat(1.13, 8);
    expect(beatToFloat(result)).toBeCloseTo(1.125, 5);
  });

  it("snaps to whole beat (density=1)", () => {
    const result = snapBeat(2.7, 1);
    expect(beatToFloat(result)).toBe(3);
  });
});

describe("reduceBeat", () => {
  it("reduces [1, 4, 8] to [1, 1, 2]", () => {
    const result = reduceBeat([1, 4, 8]);
    expect(result).toEqual([1, 1, 2]);
  });

  it("reduces [0, 6, 4] to [1, 1, 2]", () => {
    const result = reduceBeat([0, 6, 4]);
    expect(result).toEqual([1, 1, 2]);
  });

  it("reduces [0, 0, 4] to [0, 0, 1]", () => {
    const result = reduceBeat([0, 0, 4]);
    expect(result).toEqual([0, 0, 1]);
  });
});

describe("compareBeats", () => {
  it("returns 0 for equal beats", () => {
    expect(compareBeats([1, 1, 2], [1, 2, 4])).toBe(0);
  });

  it("returns negative for a < b", () => {
    expect(compareBeats([1, 0, 1], [2, 0, 1])).toBeLessThan(0);
  });

  it("returns positive for a > b", () => {
    expect(compareBeats([3, 0, 1], [2, 0, 1])).toBeGreaterThan(0);
  });
});

describe("beatsEqual", () => {
  it("detects equal beats with different representation", () => {
    expect(beatsEqual([1, 2, 4], [1, 1, 2])).toBe(true);
  });

  it("detects unequal beats", () => {
    expect(beatsEqual([1, 1, 4], [1, 1, 3])).toBe(false);
  });
});

describe("formatBeat", () => {
  it("formats whole beat", () => {
    expect(formatBeat([3, 0, 1])).toBe("3");
  });

  it("formats fractional beat", () => {
    expect(formatBeat([2, 3, 4])).toBe("2:3/4");
  });
});

describe("minimumBeat", () => {
  it("returns correct minimum for density 4", () => {
    const result = minimumBeat(4);
    expect(beatToFloat(result)).toBe(0.25);
  });

  it("returns correct minimum for density 8", () => {
    const result = minimumBeat(8);
    expect(beatToFloat(result)).toBe(0.125);
  });
});

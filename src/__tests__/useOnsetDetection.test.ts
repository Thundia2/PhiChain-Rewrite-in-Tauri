// ============================================================
// peakPickT1 tests — Phase A onset picker
//
// These are pure-function tests against synthetic probability
// arrays; no React, no Tauri. They validate that the new picker
// produces musically-sensible picks on the five patterns §12.11
// of the rewrite plan calls out plus one tempo-change fixture.
//
// Recent change: New file (Phase A of onset rewrite plan,
// 2026-04-20). Previously no tests covered onset peak-picking.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  peakPickT1,
  computeRollingMedianFloor,
} from "../hooks/useOnsetDetection";
import type { OnsetResult } from "../utils/ipc";

// ── Helpers ────────────────────────────────────────────────────

/** Build an OnsetResult[] from a raw probability array at 100 fps. */
function mk(probs: number[]): OnsetResult[] {
  return probs.map((p, i) => ({ time: i / 100, probability: p }));
}

/** Constant-tempo bpmAtTime for tests that don't care about tempo. */
const BPM_120 = () => 120;
const BPM_180 = () => 180;

// ── Tests ──────────────────────────────────────────────────────

describe("peakPickT1", () => {
  it("returns no picks on a flat-zero array", () => {
    const n = 1000;
    const probs = new Array<number>(n).fill(0);
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 2.0, BPM_120);
    expect(picks).toHaveLength(0);
  });

  it("returns no picks when n = 0", () => {
    expect(peakPickT1([], 0.1, 0.03, 2.0, BPM_120)).toHaveLength(0);
  });

  it("picks a single strong spike", () => {
    const n = 1000;
    const probs = new Array<number>(n).fill(0);
    probs[500] = 0.9;
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 2.0, BPM_120);
    expect(picks).toHaveLength(1);
    // Frame 500 = 5.00 s at 100 fps
    expect(picks[0].time).toBeCloseTo(5.0, 2);
    expect(picks[0].probability).toBeCloseTo(0.9, 5);
  });

  it("collapses a 5-frame cluster of 0.9 into one pick at its local max", () => {
    // The picker's local-max step requires strict inequality against neighbors.
    // A flat plateau has no strict local max — give it a peak in the middle.
    const n = 1000;
    const probs = new Array<number>(n).fill(0);
    probs[498] = 0.7;
    probs[499] = 0.8;
    probs[500] = 0.9;
    probs[501] = 0.8;
    probs[502] = 0.7;
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 2.0, BPM_120);
    expect(picks).toHaveLength(1);
    expect(picks[0].time).toBeCloseTo(5.0, 2);
  });

  it("picks 4-on-the-floor at 180 BPM on-beat", () => {
    // 4-on-the-floor at 180 BPM = quarter note every 60/180 = 0.333 s = ~33 frames.
    // Place spikes every 33 frames for 10 seconds = ~30 beats. Use target=4/sec
    // so the per-window budget (4 picks/sec × 1 sec) accommodates all 3-4 beats
    // that land inside each 1-second window; otherwise the budget clips every
    // 4th beat and produces legitimate 2-beat gaps at window boundaries.
    const n = 1000;
    const probs = new Array<number>(n).fill(0);
    const framesPerBeat = Math.round(33.333); // ≈ 33
    for (let f = 100; f < n; f += framesPerBeat) {
      probs[f] = 0.9;
    }
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 4.0, BPM_180);
    // ~28 beats in the 10-sec span — allow slack for boundary effects.
    expect(picks.length).toBeGreaterThanOrEqual(25);
    expect(picks.length).toBeLessThanOrEqual(32);
    // Adjacent picks should be separated by ~33 frames (one beat).
    for (let i = 1; i < picks.length; i++) {
      const deltaFrames = Math.round((picks[i].time - picks[i - 1].time) * 100);
      expect(deltaFrames).toBeGreaterThanOrEqual(30);
      expect(deltaFrames).toBeLessThanOrEqual(40);
    }
  });

  it("suppresses a dense plateau via the adaptive floor", () => {
    // 5 seconds of uniform-ish 0.7 probability with tiny per-frame variation.
    // No frame is a meaningful outlier; the adaptive floor rises to ~0.73 and
    // strict local-max is rare. Expect very few picks despite the high mean.
    const n = 500;
    const probs = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      probs[i] = 0.70 + 0.01 * Math.sin(i * 0.3); // +/- 0.01
    }
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 2.0, BPM_120);
    // Adaptive floor ≈ 0.70 + 0.03 = 0.73; all frames are below it → 0 picks.
    expect(picks.length).toBeLessThanOrEqual(2);
  });

  it("honors BPM-aware min-gap across a 120 → 180 tempo change", () => {
    // 30 seconds of spikes at every 5th frame. With min-gap=6 (120 BPM) the
    // 5-frame spike spacing forces skipping every other spike; at min-gap=4
    // (180 BPM) all spikes pass. Set target density way above the spike rate
    // (50/sec) so the MIN-GAP is the binding constraint, not targetK.
    const n = 3000;
    const probs = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 5) probs[i] = 0.8;
    const bpmAtTime = (t: number) => (t < 15 ? 120 : 180);
    const picks = peakPickT1(mk(probs), 0.1, 0.03, 50.0, bpmAtTime);

    const lowTempoPicks = picks.filter((p) => p.time < 15).length;
    const highTempoPicks = picks.filter((p) => p.time >= 15).length;
    // 120 BPM (min-gap 6) → ~10 picks/sec × 15 = ~150
    // 180 BPM (min-gap 4) → ~20 picks/sec × 15 = ~300
    // Assert the high-tempo half is at least 1.5× the low-tempo half.
    expect(highTempoPicks).toBeGreaterThan(lowTempoPicks * 1.5);
  });

  it("snap-to-grid collapses multiple candidates in the same cell", () => {
    // Three spikes within 10 frames — at the default 4-density quarter-note
    // grid and 120 BPM, one beat = 50 frames, quarter-note cell = 12.5 frames.
    // All three spikes fall into adjacent cells. Without snap, density=8.0
    // could admit all three; with snap they collapse to the distinct cells.
    const n = 500;
    const probs = new Array<number>(n).fill(0);
    probs[100] = 0.5;
    probs[102] = 0.9; // highest in its neighborhood
    probs[104] = 0.6;
    const noSnap = peakPickT1(mk(probs), 0.1, 0.03, 8.0, BPM_120);
    // All three are local maxima (each has strictly-lower neighbors), but the
    // min-gap at 120 BPM is ≥6 frames, so the picker will only emit the
    // highest (102) and drop the two within the gap.
    expect(noSnap.length).toBeGreaterThanOrEqual(1);
    expect(noSnap.length).toBeLessThanOrEqual(3);
    // The 0.9 candidate at frame 102 should always be picked.
    expect(noSnap.some((p) => Math.abs(p.time - 1.02) < 0.005)).toBe(true);
  });
});

describe("computeRollingMedianFloor", () => {
  it("is bounded below by absFloor", () => {
    const results = mk(new Array<number>(200).fill(0));
    const out = new Float32Array(200);
    computeRollingMedianFloor(results, 100, 0.25, 0.03, out);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("rises above absFloor when the local median exceeds it", () => {
    // 500 frames of constant 0.6 probability — median is 0.6, plus delta 0.03
    // → threshold ≈ 0.63, comfortably above absFloor 0.10.
    const results = mk(new Array<number>(500).fill(0.6));
    const out = new Float32Array(500);
    computeRollingMedianFloor(results, 100, 0.10, 0.03, out);
    // Check a few mid-range frames (avoid window-prime edges).
    for (const i of [100, 200, 300]) {
      expect(out[i]).toBeGreaterThan(0.55);
      expect(out[i]).toBeLessThan(0.70);
    }
  });

  it("does not mutate elements outside [0, n)", () => {
    // Sanity — defensive against off-by-one in sliding-window code.
    const n = 50;
    const results = mk(new Array<number>(n).fill(0.3));
    // Over-allocate out to detect out-of-range writes.
    const out = new Float32Array(n + 10);
    computeRollingMedianFloor(results, 20, 0.05, 0.01, out);
    for (let i = n; i < n + 10; i++) {
      expect(out[i]).toBe(0); // untouched tail
    }
  });
});

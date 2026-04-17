// Refined peak-picking test — exploring the best parameter combinations
// for Algorithm B (absolute+localmax+combine) and D (prominence).
//
// Run: node scripts/test_peak_picking2.js

function generatePattern(name, fps, durationSec, generator) {
  const n = fps * durationSec;
  const data = [];
  for (let i = 0; i < n; i++) {
    data.push({ time: i / fps, probability: generator(i, fps) });
  }
  return { name, data };
}

// Same patterns as before
const patterns = [
  generatePattern("1: Clean sparse (baseline~0.05)", 100, 10, (i) => {
    const dist = Math.abs((i % 50));
    if (dist <= 1) return 0.85 + Math.random() * 0.1;
    if (dist <= 3) return 0.3 - dist * 0.08;
    return 0.03 + Math.random() * 0.04;
  }),
  generatePattern("2: Dense busy (baseline~0.3)", 100, 10, (i) => {
    const dist = Math.abs((i % 15));
    if (dist <= 1) return 0.7 + Math.random() * 0.15;
    if (dist <= 3) return 0.4 - dist * 0.03;
    return 0.25 + Math.random() * 0.1;
  }),
  generatePattern("3: Sustained noise (0.4-0.7)", 100, 10, (i) => {
    return 0.45 + 0.15 * Math.sin(i * 0.3) + Math.random() * 0.1;
  }),
  generatePattern("4: Transition quiet→loud", 100, 10, (i) => {
    const t = i / 100;
    if (t < 5) {
      const dist = Math.abs((i % 100));
      if (dist <= 1) return 0.7 + Math.random() * 0.1;
      return 0.02 + Math.random() * 0.03;
    } else {
      const dist = Math.abs(((i - 500) % 20));
      if (dist <= 1) return 0.75 + Math.random() * 0.15;
      if (dist <= 3) return 0.35 - dist * 0.05;
      return 0.2 + Math.random() * 0.15;
    }
  }),
  generatePattern("5: Very dense (every 80ms)", 100, 10, (i) => {
    const dist = Math.abs((i % 8));
    if (dist <= 1) return 0.6 + Math.random() * 0.2;
    return 0.3 + Math.random() * 0.1;
  }),
];

// ── Algorithm: Absolute + Local max + Prominence + Combine ─────
// Use prominence as a lightweight noise filter alongside absolute threshold.
function algoBestOf(data, sensitivity, params) {
  const { preMax, postMax, combine, prominenceWindow, minProminence } = params;
  const absThreshold = 0.65 - sensitivity * 0.55;
  const n = data.length;
  const peaks = [];
  let lastIdx = -combine - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    // 1. Absolute gate
    if (prob < absThreshold) continue;
    // 2. Local max
    let isMax = true;
    for (let j = Math.max(0, i - preMax); j <= Math.min(n - 1, i + postMax); j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    // 3. Prominence check (optional)
    if (minProminence > 0) {
      let localMin = prob;
      for (let j = Math.max(0, i - prominenceWindow); j <= Math.min(n - 1, i + prominenceWindow); j++) {
        if (data[j].probability < localMin) localMin = data[j].probability;
      }
      if (prob - localMin < minProminence) continue;
    }
    // 4. Combine
    if (i - lastIdx < combine) continue;
    peaks.push(i);
    lastIdx = i;
  }
  return peaks;
}

// ── Parameter variations to test ───────────────────────────────
const configs = [
  { name: "B: abs+lm2+c5 (no prom)",       preMax: 2, postMax: 2, combine: 5, prominenceWindow: 0, minProminence: 0 },
  { name: "B: abs+lm3+c5 (no prom)",       preMax: 3, postMax: 3, combine: 5, prominenceWindow: 0, minProminence: 0 },
  { name: "B: abs+lm2+c7 (no prom)",       preMax: 2, postMax: 2, combine: 7, prominenceWindow: 0, minProminence: 0 },
  { name: "D: abs+lm2+c5+prom0.10/w10",    preMax: 2, postMax: 2, combine: 5, prominenceWindow: 10, minProminence: 0.10 },
  { name: "D: abs+lm2+c5+prom0.15/w10",    preMax: 2, postMax: 2, combine: 5, prominenceWindow: 10, minProminence: 0.15 },
  { name: "D: abs+lm2+c5+prom0.10/w15",    preMax: 2, postMax: 2, combine: 5, prominenceWindow: 15, minProminence: 0.10 },
  { name: "D: abs+lm3+c5+prom0.10/w10",    preMax: 3, postMax: 3, combine: 5, prominenceWindow: 10, minProminence: 0.10 },
  { name: "D: abs+lm2+c7+prom0.10/w10",    preMax: 2, postMax: 2, combine: 7, prominenceWindow: 10, minProminence: 0.10 },
];

const sensitivity = 0.3;
console.log(`\n${"=".repeat(90)}`);
console.log(`REFINED COMPARISON (sensitivity=${sensitivity}, absThreshold=${(0.65 - sensitivity * 0.55).toFixed(3)})`);
console.log(`${"=".repeat(90)}\n`);

// Expected onsets per second for each pattern
const expected = ["~2/s", "~6.7/s", "~0/s (noise)", "~5.5/s quiet+loud", "~12.5/s"];

for (let p = 0; p < patterns.length; p++) {
  const { name, data } = patterns[p];
  console.log(`── ${name}  (expected: ${expected[p]}) ──`);
  for (const cfg of configs) {
    const peaks = algoBestOf(data, sensitivity, cfg);
    const rate = (peaks.length / (data.length / 100)).toFixed(1);
    // Max gap
    let maxGap = 0;
    for (let i = 1; i < peaks.length; i++) {
      const gap = (peaks[i] - peaks[i - 1]) / 100;
      if (gap > maxGap) maxGap = gap;
    }
    const warn = [];
    if (maxGap > 2.0) warn.push(`gap ${maxGap.toFixed(1)}s`);
    if (peaks.length > 0 && name.includes("noise") && peaks.length > 20) warn.push(`noise: ${peaks.length}`);
    const warnStr = warn.length ? ` ⚠️  ${warn.join(", ")}` : "";
    console.log(`   ${cfg.name.padEnd(42)} → ${String(peaks.length).padStart(4)} (${rate}/s)${warnStr}`);
  }
  console.log();
}

// ── Sensitivity sweep for the winner ───────────────────────────
console.log(`\n${"=".repeat(90)}`);
console.log(`SENSITIVITY SWEEP — D: abs+lm2+c5+prom0.10/w10`);
console.log(`${"=".repeat(90)}\n`);

const bestCfg = { preMax: 2, postMax: 2, combine: 5, prominenceWindow: 10, minProminence: 0.10 };
for (const s of [0.0, 0.2, 0.3, 0.5, 0.7, 1.0]) {
  const absT = (0.65 - s * 0.55).toFixed(3);
  console.log(`sensitivity=${s} (absThreshold=${absT}):`);
  for (const pat of patterns) {
    const peaks = algoBestOf(pat.data, s, bestCfg);
    const rate = (peaks.length / (pat.data.length / 100)).toFixed(1);
    console.log(`   ${pat.name.substring(0, 40).padEnd(42)} → ${String(peaks.length).padStart(4)} (${rate}/s)`);
  }
  console.log();
}

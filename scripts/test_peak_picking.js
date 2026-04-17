// Quick test script for onset peak-picking algorithms.
// Simulates various CNN output patterns and tests which parameters
// produce reasonable results across all of them.
//
// Run: node scripts/test_peak_picking.js

// ── Simulate different CNN output patterns ──────────────────────

function generatePattern(name, fps, durationSec, generator) {
  const n = fps * durationSec;
  const data = [];
  for (let i = 0; i < n; i++) {
    data.push({ time: i / fps, probability: generator(i, fps) });
  }
  return { name, data };
}

// Pattern 1: Clean sparse onsets — clear spikes on a quiet baseline
const pattern1 = generatePattern("Clean sparse (baseline~0.05, spikes~0.9)", 100, 10, (i, fps) => {
  // Onset every ~0.5s (every 50 frames)
  const dist = Math.abs((i % 50) - 0);
  if (dist <= 1) return 0.85 + Math.random() * 0.1;
  if (dist <= 3) return 0.3 - dist * 0.08;
  return 0.03 + Math.random() * 0.04;
});

// Pattern 2: Dense busy section — onsets every ~0.15s, elevated baseline
const pattern2 = generatePattern("Dense busy (baseline~0.3, spikes~0.8)", 100, 10, (i, fps) => {
  // Onset every ~15 frames
  const dist = Math.abs((i % 15) - 0);
  if (dist <= 1) return 0.7 + Math.random() * 0.15;
  if (dist <= 3) return 0.4 - dist * 0.03;
  return 0.25 + Math.random() * 0.1;
});

// Pattern 3: Sustained high activation — noisy, no clear peaks
// (this is what causes false positives with naive approaches)
const pattern3 = generatePattern("Sustained noise (0.4-0.7 throughout)", 100, 10, (i, fps) => {
  return 0.45 + 0.15 * Math.sin(i * 0.3) + Math.random() * 0.1;
});

// Pattern 4: Transition quiet → loud
const pattern4 = generatePattern("Transition quiet→loud at 5s", 100, 10, (i, fps) => {
  const t = i / fps;
  if (t < 5) {
    // Quiet with occasional onset every 1s
    const dist = Math.abs((i % 100) - 0);
    if (dist <= 1) return 0.7 + Math.random() * 0.1;
    return 0.02 + Math.random() * 0.03;
  } else {
    // Loud with onset every 0.2s
    const dist = Math.abs(((i - 500) % 20) - 0);
    if (dist <= 1) return 0.75 + Math.random() * 0.15;
    if (dist <= 3) return 0.35 - dist * 0.05;
    return 0.2 + Math.random() * 0.15;
  }
});

// Pattern 5: Very dense section (16th notes at fast tempo)
const pattern5 = generatePattern("Very dense (onsets every 8 frames=80ms)", 100, 10, (i, fps) => {
  const dist = Math.abs((i % 8) - 0);
  if (dist <= 1) return 0.6 + Math.random() * 0.2;
  return 0.3 + Math.random() * 0.1;
});

const patterns = [pattern1, pattern2, pattern3, pattern4, pattern5];

// ── Peak-picking algorithms ─────────────────────────────────────

// Algorithm A: Current broken approach (backward-only adaptive, high threshold)
function algoAdaptiveBackward(data, sensitivity) {
  const PRE_MAX = 1, POST_MAX = 1, PRE_AVG = 15, POST_AVG = 0, COMBINE = 3;
  const threshold = 0.80 - sensitivity * 0.70;
  const n = data.length;
  const peaks = [];
  let lastIdx = -COMBINE - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    // Local max
    let isMax = true;
    for (let j = Math.max(0, i - PRE_MAX); j <= Math.min(n - 1, i + POST_MAX); j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    // Adaptive threshold (backward only)
    const avgStart = Math.max(0, i - PRE_AVG);
    let sum = 0;
    for (let j = avgStart; j <= i; j++) sum += data[j].probability;
    const localMean = sum / (i - avgStart + 1);
    if (prob < localMean + threshold) continue;
    // Combine
    if (i - lastIdx < COMBINE) continue;
    peaks.push(i);
    lastIdx = i;
  }
  return peaks;
}

// Algorithm B: Pure absolute threshold + local max + combine (no adaptive)
function algoAbsoluteOnly(data, sensitivity) {
  const PRE_MAX = 2, POST_MAX = 2, COMBINE = 5;
  const threshold = 0.65 - sensitivity * 0.55;
  const n = data.length;
  const peaks = [];
  let lastIdx = -COMBINE - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    if (prob < threshold) continue;
    // Local max
    let isMax = true;
    for (let j = Math.max(0, i - PRE_MAX); j <= Math.min(n - 1, i + POST_MAX); j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    // Combine
    if (i - lastIdx < COMBINE) continue;
    peaks.push(i);
    lastIdx = i;
  }
  return peaks;
}

// Algorithm C: Absolute gate + weak adaptive delta
function algoHybrid(data, sensitivity) {
  const PRE_MAX = 1, POST_MAX = 1, PRE_AVG = 15, COMBINE = 5;
  const absThreshold = 0.65 - sensitivity * 0.55;
  const adaptiveDelta = 0.05; // very small fixed delta
  const n = data.length;
  const peaks = [];
  let lastIdx = -COMBINE - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    // Absolute gate
    if (prob < absThreshold) continue;
    // Local max
    let isMax = true;
    for (let j = Math.max(0, i - PRE_MAX); j <= Math.min(n - 1, i + POST_MAX); j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    // Weak adaptive: just needs to be slightly above local mean
    const avgStart = Math.max(0, i - PRE_AVG);
    let sum = 0;
    for (let j = avgStart; j <= i; j++) sum += data[j].probability;
    const localMean = sum / (i - avgStart + 1);
    if (prob < localMean + adaptiveDelta) continue;
    // Combine
    if (i - lastIdx < COMBINE) continue;
    peaks.push(i);
    lastIdx = i;
  }
  return peaks;
}

// Algorithm D: Prominence-based (peak must rise above surrounding minimum)
function algoProminence(data, sensitivity) {
  const PRE_MAX = 2, POST_MAX = 2, COMBINE = 5;
  const absThreshold = 0.65 - sensitivity * 0.55;
  const minProminence = 0.15 - sensitivity * 0.10; // how much above local min
  const PROMINENCE_WINDOW = 10; // frames to look for minimum
  const n = data.length;
  const peaks = [];
  let lastIdx = -COMBINE - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    if (prob < absThreshold) continue;
    // Local max
    let isMax = true;
    for (let j = Math.max(0, i - PRE_MAX); j <= Math.min(n - 1, i + POST_MAX); j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    // Prominence: find minimum in surrounding window
    let localMin = prob;
    for (let j = Math.max(0, i - PROMINENCE_WINDOW); j <= Math.min(n - 1, i + PROMINENCE_WINDOW); j++) {
      if (data[j].probability < localMin) localMin = data[j].probability;
    }
    if (prob - localMin < minProminence) continue;
    // Combine
    if (i - lastIdx < COMBINE) continue;
    peaks.push(i);
    lastIdx = i;
  }
  return peaks;
}

// ── Run tests ───────────────────────────────────────────────────

const sensitivity = 0.3; // default
const algorithms = [
  { name: "A: Backward adaptive (current)", fn: algoAdaptiveBackward },
  { name: "B: Absolute only", fn: algoAbsoluteOnly },
  { name: "C: Hybrid (abs + weak adaptive)", fn: algoHybrid },
  { name: "D: Prominence-based", fn: algoProminence },
];

console.log(`\n${"=".repeat(80)}`);
console.log(`ONSET PEAK-PICKING ALGORITHM COMPARISON (sensitivity=${sensitivity})`);
console.log(`${"=".repeat(80)}\n`);

for (const pattern of patterns) {
  const { name, data } = pattern;
  // Compute stats
  const probs = data.map(d => d.probability);
  const maxP = Math.max(...probs);
  const meanP = probs.reduce((a, b) => a + b) / probs.length;
  const minP = Math.min(...probs);

  console.log(`── Pattern: ${name} ──`);
  console.log(`   Stats: min=${minP.toFixed(3)} mean=${meanP.toFixed(3)} max=${maxP.toFixed(3)}  (${data.length} frames, ${data.length/100}s)`);

  for (const algo of algorithms) {
    const peaks = algo.fn(data, sensitivity);
    const rate = (peaks.length / (data.length / 100)).toFixed(1);

    // Check for gaps > 2s (problem indicator)
    let maxGap = 0;
    for (let i = 1; i < peaks.length; i++) {
      const gap = (peaks[i] - peaks[i - 1]) / 100;
      if (gap > maxGap) maxGap = gap;
    }
    if (peaks.length > 0 && peaks[0] > 0) {
      const firstGap = peaks[0] / 100;
      if (firstGap > maxGap) maxGap = firstGap;
    }

    const gapWarn = maxGap > 2.0 ? ` ⚠️  MAX GAP ${maxGap.toFixed(1)}s` : "";
    const tooMany = peaks.length / (data.length / 100) > 15 ? " ⚠️  >15/s" : "";
    console.log(`   ${algo.name.padEnd(40)} → ${String(peaks.length).padStart(4)} peaks (${rate}/s)${gapWarn}${tooMany}`);
  }
  console.log();
}

// Also test at different sensitivities for the best algorithm
console.log(`\n${"=".repeat(80)}`);
console.log(`SENSITIVITY SWEEP (Pattern 2: Dense busy section)`);
console.log(`${"=".repeat(80)}\n`);

for (const s of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0]) {
  console.log(`sensitivity=${s}:`);
  for (const algo of algorithms) {
    const peaks = algo.fn(pattern2.data, s);
    const rate = (peaks.length / (pattern2.data.length / 100)).toFixed(1);
    let maxGap = 0;
    for (let i = 1; i < peaks.length; i++) {
      const gap = (peaks[i] - peaks[i - 1]) / 100;
      if (gap > maxGap) maxGap = gap;
    }
    const gapWarn = maxGap > 1.0 ? ` ⚠️  gap ${maxGap.toFixed(1)}s` : "";
    console.log(`   ${algo.name.padEnd(40)} → ${String(peaks.length).padStart(4)} peaks (${rate}/s)${gapWarn}`);
  }
  console.log();
}

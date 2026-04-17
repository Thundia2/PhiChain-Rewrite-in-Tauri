// Final verification: test the EXACT algorithm now in useOnsetDetection.ts
// Run: node scripts/test_final.js

function gen(name, fps, dur, fn) {
  const d = [];
  for (let i = 0; i < fps * dur; i++) d.push({ time: i / fps, probability: fn(i) });
  return { name, data: d };
}

const patterns = [
  gen("Clean sparse (baseline~0.05, spikes~0.9)", 100, 10, i => {
    const d = i % 50; return d <= 1 ? 0.88 : d <= 3 ? 0.3 - d * 0.08 : 0.04;
  }),
  gen("Dense busy (baseline~0.3, spikes~0.8)", 100, 10, i => {
    const d = i % 15; return d <= 1 ? 0.78 : d <= 3 ? 0.4 - d * 0.03 : 0.3;
  }),
  gen("Sustained noise (0.4-0.7)", 100, 10, i => 0.45 + 0.15 * Math.sin(i * 0.3) + Math.random() * 0.1),
  gen("Transition quiet→loud at 5s", 100, 10, i => {
    if (i < 500) { const d = i % 100; return d <= 1 ? 0.75 : 0.03; }
    const d = (i - 500) % 20; return d <= 1 ? 0.8 : d <= 3 ? 0.35 - d * 0.05 : 0.25;
  }),
  gen("Very dense (every 80ms)", 100, 10, i => {
    const d = i % 8; return d <= 1 ? 0.7 : 0.35;
  }),
];

// EXACT algorithm from useOnsetDetection.ts
function peakPick(data, sensitivity) {
  const PRE_MAX = 2, POST_MAX = 2, COMBINE = 5;
  const threshold = 0.65 - sensitivity * 0.55;
  const n = data.length;
  const peaks = [];
  let lastPeakIdx = -COMBINE - 1;

  for (let i = 0; i < n; i++) {
    const prob = data[i].probability;
    if (prob < threshold) continue;
    let isMax = true;
    const maxStart = Math.max(0, i - PRE_MAX);
    const maxEnd = Math.min(n - 1, i + POST_MAX);
    for (let j = maxStart; j <= maxEnd; j++) {
      if (j !== i && data[j].probability > prob) { isMax = false; break; }
    }
    if (!isMax) continue;
    if (i - lastPeakIdx < COMBINE) continue;
    peaks.push(data[i]);
    lastPeakIdx = i;
  }
  return peaks;
}

console.log("\n=== FINAL ALGORITHM VERIFICATION ===\n");

for (const s of [0.0, 0.3, 0.5, 1.0]) {
  const t = (0.65 - s * 0.55).toFixed(3);
  console.log(`sensitivity=${s} (threshold=${t}):`);
  for (const p of patterns) {
    const peaks = peakPick(p.data, s);
    const rate = (peaks.length / (p.data.length / 100)).toFixed(1);
    // Check for gaps > 2s
    let maxGap = 0;
    for (let i = 1; i < peaks.length; i++) {
      const g = peaks[i].time - peaks[i - 1].time;
      if (g > maxGap) maxGap = g;
    }
    const warn = maxGap > 2 ? `  ⚠️ MAX GAP ${maxGap.toFixed(1)}s` : "";
    console.log(`  ${p.name.padEnd(50)} ${String(peaks.length).padStart(4)} peaks (${rate}/s)${warn}`);
  }
  console.log();
}

// ============================================================
// Step Recording Presets & Helpers
//
// Shared between the ContextPanel step recording banner
// and the canvas status bar overlay.
//
// Recent change: Initial creation for Section D (ContextPanel).
// ============================================================

/** Step size preset for the step recording UI */
export interface StepPreset {
  label: string;
  value: number;
}

export const STEP_PRESETS: StepPreset[] = [
  { label: "1/2",  value: 1 / 2 },
  { label: "1/3",  value: 1 / 3 },
  { label: "1/4",  value: 1 / 4 },
  { label: "1/6",  value: 1 / 6 },
  { label: "1/8",  value: 1 / 8 },
  { label: "1/12", value: 1 / 12 },
  { label: "1/16", value: 1 / 16 },
  { label: "1",    value: 1 },
  { label: "2",    value: 2 },
];

/**
 * Format a step size as a readable fraction string.
 * e.g., 0.25 → "1/4", 0.333... → "1/3", 0.5 → "1/2", 1 → "1"
 */
export function formatStepSize(size: number): string {
  const FRACTIONS: Array<[number, string]> = [
    [1 / 32, "1/32"], [1 / 16, "1/16"], [1 / 12, "1/12"],
    [1 / 8, "1/8"],   [1 / 6, "1/6"],   [1 / 4, "1/4"],
    [1 / 3, "1/3"],   [1 / 2, "1/2"],   [1, "1"],
    [2, "2"],          [4, "4"],
  ];
  for (const [val, label] of FRACTIONS) {
    if (Math.abs(size - val) < 0.0001) return label;
  }
  return size.toFixed(3);
}

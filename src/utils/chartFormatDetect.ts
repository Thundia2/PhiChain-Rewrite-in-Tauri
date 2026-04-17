// ============================================================
// Chart Format Auto-Detection
//
// Recent change: New file — detects chart format from content,
// matching Phira's approach (prpr/src/scene/game.rs:195-211).
// Used by the unified import pipeline to auto-detect RPE,
// Official (Phigros), and PEC formats without user intervention.
// ============================================================

export type DetectedChartFormat = "rpe" | "official" | "pec";

/**
 * Auto-detect the chart format from its text content.
 *
 * Detection logic (mirrors Phira's `infer_chart_format`):
 *   - JSON with "META" or "BPMList" key → RPE
 *   - JSON with "formatVersion" or "judgeLineList" key → Official (Phigros)
 *   - Non-JSON text → PEC (line-based text format)
 */
export function detectChartFormat(content: string): DetectedChartFormat {
  const trimmed = content.trimStart();

  // JSON content — distinguish RPE from Official
  if (trimmed.startsWith("{")) {
    // Quick string-level check first (avoids full JSON parse for large files)
    // RPE always has "META" and/or "BPMList" at the top level
    if (trimmed.includes('"META"') || trimmed.includes('"BPMList"')) {
      return "rpe";
    }
    // Official always has "formatVersion" and "judgeLineList"
    if (trimmed.includes('"formatVersion"') || trimmed.includes('"judgeLineList"')) {
      return "official";
    }
    // Fallback for ambiguous JSON — Official is more likely than PEC
    return "official";
  }

  // Non-JSON text → PEC format (line-based commands like bp, cp, cv, n1-n4)
  return "pec";
}

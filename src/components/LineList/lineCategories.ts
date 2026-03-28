// ============================================================
// Line Categories — Color-coded organizational tags
// ============================================================

import type { Line } from "../../types/chart";

export const LINE_CATEGORY_COLORS: Record<string, string> = {
  gameplay: "#4dabf7",
  visual: "#ffd43b",
  text: "#51cf66",
  helper: "#868e96",
};

export const LINE_CATEGORY_LABELS: Record<string, string> = {
  gameplay: "Gameplay",
  visual: "Visual",
  text: "Text/Lyrics",
  helper: "Helper",
};

/**
 * Auto-detect a line's category based on its contents.
 */
export function autoCategorize(line: Line): Line["_category"] {
  const hasNotes = line.notes.length > 0;
  const hasTextEvents = line.events.some((e) => e.kind === "text");
  const hasTexture = line.texture != null && line.texture !== "line.png";
  const hasColorEvents = line.events.some((e) => e.kind === "color");

  if (hasTextEvents) return "text";
  if (hasNotes) return "gameplay";
  if (hasTexture || hasColorEvents) return "visual";
  if (!hasNotes && line.events.length <= 5) return "helper";
  return undefined;
}

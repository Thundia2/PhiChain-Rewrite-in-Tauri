// ============================================================
// Phira info.yml Parser
//
// Parses the info.yml file from Phira chart packages and extracts
// the extended metadata fields into a partial ProjectMeta object.
// Only returns fields that are present in the YAML.
// ============================================================

import type { ProjectMeta } from "../types/chart";

/**
 * Parse a Phira info.yml and return a partial ProjectMeta with
 * any extended fields found. Core fields (name, charter, etc.)
 * are included too so they can override RPE META if desired.
 */
export function parsePhiraInfoYml(text: string): Partial<ProjectMeta> {
  const raw: Record<string, string> = {};

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    raw[key] = val;
  }

  const result: Partial<ProjectMeta> = {};

  // Core fields
  if (raw.name) result.name = raw.name;
  if (raw.charter) result.charter = raw.charter;
  if (raw.composer) result.composer = raw.composer;
  if (raw.illustrator) result.illustrator = raw.illustrator;
  if (raw.level) result.level = raw.level;

  // Extended Phira fields
  if (raw.previewStart) {
    const v = parseFloat(raw.previewStart);
    if (!isNaN(v)) result.preview_start = v;
  }
  if (raw.previewEnd) {
    const v = parseFloat(raw.previewEnd);
    if (!isNaN(v)) result.preview_end = v;
  }
  if (raw.aspectRatio) {
    const v = parseFloat(raw.aspectRatio);
    if (!isNaN(v)) result.aspect_ratio = v;
  }
  if (raw.backgroundDim) {
    const v = parseFloat(raw.backgroundDim);
    if (!isNaN(v)) result.background_dim = v;
  }
  if (raw.lineLength) {
    const v = parseFloat(raw.lineLength);
    if (!isNaN(v)) result.line_length = v;
  }
  if (raw.tip) result.tip = raw.tip;
  if (raw.intro) result.intro = raw.intro;

  // Tags: parse [tag1, tag2, ...] or "tag1, tag2"
  if (raw.tags) {
    let tagsStr = raw.tags;
    if (tagsStr.startsWith("[") && tagsStr.endsWith("]")) {
      tagsStr = tagsStr.slice(1, -1);
    }
    const tags = tagsStr.split(",").map(t => {
      let s = t.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
      }
      return s;
    }).filter(Boolean);
    if (tags.length > 0) result.tags = tags;
  }

  // holdPartialCover
  if (raw.holdPartialCover) {
    result.hold_partial_cover = raw.holdPartialCover === "true";
  }

  return result;
}

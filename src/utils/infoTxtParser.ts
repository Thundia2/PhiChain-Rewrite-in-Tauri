// ============================================================
// Phira info.txt Parser
//
// Recent change: New file — parses Phira-style info.txt files
// found inside chart zip packages. Format: first line is "#",
// followed by "Key: Value" pairs. Key mappings match Phira's
// implementation in prpr/src/fs.rs:226-295 (info_from_kv and
// info_from_txt functions).
//
// Returns both metadata fields AND file pointers (chart, music,
// image filenames) so the unified importer can locate the exact
// files within the zip.
// ============================================================

/** Parsed result from a Phira info.txt file */
export interface InfoTxtResult {
  // Metadata fields
  name?: string;
  level?: string;
  composer?: string;
  charter?: string;
  illustrator?: string;
  // File pointers (filenames within the zip)
  chart?: string;
  music?: string;
  image?: string;
}

/**
 * Parse a Phira-style info.txt file.
 *
 * Format:
 *   #                          (header marker, required first line)
 *   Name: Song Name
 *   Song: music.ogg            (aliases: Music)
 *   Picture: illustration.png  (aliases: Image)
 *   Chart: chart.json
 *   Level: SP Lv.?
 *   Composer: Artist Name      (aliases: Artist, Musician)
 *   Charter: Charter Name      (aliases: Designer)
 *   Illustrator: Illustrator Name
 */
export function parseInfoTxt(text: string): InfoTxtResult {
  const result: InfoTxtResult = {};

  const lines = text.split(/\r?\n/);
  let startIdx = 0;

  // Skip the "#" header line if present (with optional BOM)
  if (lines.length > 0) {
    const first = lines[0].trim();
    if (first === "#" || first === "\uFEFF#") {
      startIdx = 1;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split at first ": " (colon-space) like Phira does
    const colonIdx = line.indexOf(": ");
    if (colonIdx < 0) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 2).trim();
    if (!value) continue;

    // Map keys matching Phira's info_from_kv (case-sensitive, like Phira)
    switch (key) {
      case "Name":
        result.name = value;
        break;
      case "Song":
      case "Music":
        result.music = value;
        break;
      case "Chart":
        result.chart = value;
        break;
      case "Image":
      case "Picture":
        result.image = value;
        break;
      case "Level":
        result.level = value;
        break;
      case "Illustrator":
        result.illustrator = value;
        break;
      case "Composer":
      case "Artist":
      case "Musician":
        result.composer = value;
        break;
      case "Charter":
      case "Designer":
        result.charter = value;
        break;
      // Ignore deprecated/unsupported keys: AspectRatio, BackgroundDim,
      // NoteScale, ScaleRatio, GlobalAlpha, LastEditTime, Length, EditTime
    }
  }

  return result;
}

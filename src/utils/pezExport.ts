// ============================================================
// PEZ Export — Bundle chart + music + illustration into a ZIP
//
// PEZ is a ZIP archive containing:
//   - chart.json (RPE format)
//   - music.mp3 (or other audio format)
//   - bg.png (or other image format)
//
// This creates a .pez file that can be shared with Phira/RPE users.
// ============================================================

import JSZip from "jszip";
import type { PhichainChart, ProjectMeta } from "../types/chart";
import type { ExtraConfig } from "../types/extra";
import type { EditorGroup } from "../types/group";
import { convertPhichainToRpe } from "./rpeExport";

export interface PezExportOptions {
  chart: PhichainChart;
  meta: ProjectMeta;
  /** Music file (optional — user-provided) */
  musicFile?: File | null;
  /** Illustration as HTMLImageElement (can be extracted from store) */
  illustrationImage?: HTMLImageElement | null;
  /** Illustration file (optional — user-provided, preferred over image extraction) */
  illustrationFile?: File | null;
  /** Extra config (prpr effects/video) — included as extra.json if non-empty */
  extraConfig?: ExtraConfig | null;
  /** Line texture images — Map from filename to Blob */
  lineTextures?: Map<string, Blob> | null;
  /** Editor groups — included as groups.json if non-empty */
  groups?: EditorGroup[] | null;
}

/**
 * Create a PEZ (ZIP) bundle containing the chart, music, and illustration.
 * Returns a Blob that can be downloaded.
 */
export async function createPezBundle(options: PezExportOptions): Promise<Blob> {
  const zip = new JSZip();

  // 1. Convert chart to RPE format and add to ZIP
  const rpeJson = convertPhichainToRpe(options.chart, options.meta);
  zip.file("chart.json", rpeJson);

  // 2. Add music file if provided
  if (options.musicFile) {
    const ext = options.musicFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
    zip.file(`music.${ext}`, options.musicFile);
  }

  // 3. Add illustration
  if (options.illustrationFile) {
    const ext = options.illustrationFile.name.split(".").pop()?.toLowerCase() ?? "png";
    zip.file(`bg.${ext}`, options.illustrationFile);
  } else if (options.illustrationImage) {
    // Extract from HTMLImageElement by drawing to canvas
    const blob = await imageElementToBlob(options.illustrationImage);
    if (blob) {
      zip.file("bg.png", blob);
    }
  }

  // 4. Add extra.json if non-empty
  if (options.extraConfig) {
    const hasContent = (options.extraConfig.effects && options.extraConfig.effects.length > 0) ||
                       (options.extraConfig.videos && options.extraConfig.videos.length > 0);
    if (hasContent) {
      zip.file("extra.json", JSON.stringify(options.extraConfig, null, 2));
    }
  }

  // 5. Add line texture images
  if (options.lineTextures && options.lineTextures.size > 0) {
    for (const [name, blob] of options.lineTextures) {
      zip.file(name, blob);
    }
  }

  // 6. Add groups.json if non-empty (Phichain editor-only data)
  if (options.groups && options.groups.length > 0) {
    zip.file("groups.json", JSON.stringify(options.groups, null, 2));
  }

  // 7. Generate info.yml (Phira chart standard metadata)
  zip.file("info.yml", buildInfoYml(options));

  // Generate the ZIP
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Build a Phira-compatible info.yml from project metadata.
 * Follows the ChartInfo specification from Phira docs.
 */
function buildInfoYml(options: PezExportOptions): string {
  const meta = options.meta;
  const musicExt = options.musicFile?.name.split(".").pop()?.toLowerCase() ?? "mp3";
  const hasIllustrationFile = !!options.illustrationFile;
  const illustrationExt = hasIllustrationFile
    ? (options.illustrationFile!.name.split(".").pop()?.toLowerCase() ?? "png")
    : "png";

  const lines: string[] = [];

  lines.push(`name: "${escapeYmlString(meta.name || "Untitled")}"`);
  lines.push(`charter: "${escapeYmlString(meta.charter || "")}"`);
  lines.push(`composer: "${escapeYmlString(meta.composer || "")}"`);
  lines.push(`illustrator: "${escapeYmlString(meta.illustrator || "")}"`);
  lines.push(`level: "${escapeYmlString(meta.level || "")}"`);
  lines.push(`chart: chart.json`);
  lines.push(`music: music.${musicExt}`);
  lines.push(`illustration: bg.${illustrationExt}`);
  lines.push(`offset: ${options.chart.offset}`);

  // Extended Phira fields
  if (meta.preview_start != null) {
    lines.push(`previewStart: ${meta.preview_start}`);
  }
  if (meta.preview_end != null) {
    lines.push(`previewEnd: ${meta.preview_end}`);
  }
  if (meta.aspect_ratio != null) {
    lines.push(`aspectRatio: ${meta.aspect_ratio}`);
  }
  if (meta.background_dim != null) {
    lines.push(`backgroundDim: ${meta.background_dim}`);
  }
  if (meta.line_length != null) {
    lines.push(`lineLength: ${meta.line_length}`);
  }
  if (meta.tip) {
    lines.push(`tip: "${escapeYmlString(meta.tip)}"`);
  }
  if (meta.tags && meta.tags.length > 0) {
    lines.push(`tags: [${meta.tags.map(t => `"${escapeYmlString(t)}"`).join(", ")}]`);
  }
  if (meta.intro) {
    lines.push(`intro: "${escapeYmlString(meta.intro)}"`);
  }
  if (meta.hold_partial_cover != null) {
    lines.push(`holdPartialCover: ${meta.hold_partial_cover}`);
  }

  return lines.join("\n") + "\n";
}

function escapeYmlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Convert an HTMLImageElement to a PNG Blob by drawing it to a canvas.
 */
function imageElementToBlob(img: HTMLImageElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

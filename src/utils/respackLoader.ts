// ============================================================
// Resource Pack (Respack) Loader
//
// Extracts and parses respack zip files containing note textures,
// hit effect sprite sheets, and configuration.
//
// Respack format matches Phira's resource pack system:
//   - info.yml: metadata & rendering config
//   - click/drag/flick/hold.png: note textures
//   - *_mh.png: multi-highlight variants
//   - hit_fx.png: hit effect sprite sheet
// ============================================================

import JSZip from "jszip";

// ============================================================
// Types
// ============================================================

export interface RespackConfig {
  name: string;
  author?: string;
  description?: string;
  hitFx?: [number, number];       // [cols, rows] sprite grid
  hitFxDuration?: number;         // animation duration in seconds (default 0.5)
  hitFxScale?: number;            // scale multiplier (default 1.0)
  hitFxRotate?: boolean;          // rotate effect with line (default false)
  hideParticles?: boolean;        // hide square particles (default false)
  hitFxTinted?: boolean;          // tint with judgment colors (default true)
  holdAtlas?: [number, number];   // [tail_height_px, head_height_px]
  holdAtlasMH?: [number, number];
  holdKeepHead?: boolean;
  holdRepeat?: boolean;
  holdCompact?: boolean;
  colorPerfect?: string;          // CSS hex color
  colorGood?: string;
}

export interface HoldTextureParts {
  tail: HTMLImageElement;
  body: HTMLImageElement;
  head: HTMLImageElement;
}

export interface RespackTextures {
  tap: HTMLImageElement | null;
  drag: HTMLImageElement | null;
  flick: HTMLImageElement | null;
  hold: HoldTextureParts | null;
  tapMH: HTMLImageElement | null;
  dragMH: HTMLImageElement | null;
  flickMH: HTMLImageElement | null;
  holdMH: HoldTextureParts | null;
  hitFx: HTMLImageElement | null;
}

export interface LoadedRespack {
  id: string;
  config: RespackConfig;
  textures: RespackTextures;
}

// ============================================================
// Simple YAML Parser (for flat key-value info.yml)
// ============================================================

function parseInfoYml(text: string): RespackConfig {
  const result: Record<string, unknown> = {};

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      result[key] = val.slice(1, -1);
      continue;
    }

    // Array: [x, y]
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1);
      result[key] = inner.split(",").map((s) => parseFloat(s.trim()));
      continue;
    }

    // Hex color: 0xRRGGBB or 0xAARRGGBB
    if (val.startsWith("0x") || val.startsWith("0X")) {
      // Convert to CSS hex: strip alpha if present, keep last 6 chars
      const hex = val.slice(2);
      result[key] = "#" + (hex.length > 6 ? hex.slice(-6) : hex);
      continue;
    }

    // Boolean
    if (val === "true") { result[key] = true; continue; }
    if (val === "false") { result[key] = false; continue; }

    // Number
    const num = parseFloat(val);
    if (!isNaN(num) && val !== "") {
      result[key] = num;
      continue;
    }

    // Plain string
    result[key] = val;
  }

  return {
    name: (result.name as string) ?? "Unnamed",
    author: result.author as string | undefined,
    description: result.description as string | undefined,
    hitFx: result.hitFx as [number, number] | undefined,
    hitFxDuration: result.hitFxDuration as number | undefined,
    hitFxScale: result.hitFxScale as number | undefined,
    hitFxRotate: result.hitFxRotate as boolean | undefined,
    hideParticles: result.hideParticles as boolean | undefined,
    hitFxTinted: result.hitFxTinted as boolean | undefined,
    holdAtlas: result.holdAtlas as [number, number] | undefined,
    holdAtlasMH: result.holdAtlasMH as [number, number] | undefined,
    holdKeepHead: result.holdKeepHead as boolean | undefined,
    holdRepeat: result.holdRepeat as boolean | undefined,
    holdCompact: result.holdCompact as boolean | undefined,
    colorPerfect: result.colorPerfect as string | undefined,
    colorGood: result.colorGood as string | undefined,
  };
}

// ============================================================
// Image Utilities
// ============================================================

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export async function splitHoldAtlas(
  holdImg: HTMLImageElement,
  tailHeight: number,
  headHeight: number,
): Promise<HoldTextureParts> {
  const w = holdImg.naturalWidth;
  const h = holdImg.naturalHeight;
  const bodyTop = tailHeight;
  const bodyHeight = Math.max(h - tailHeight - headHeight, 1);
  const headTop = h - headHeight;

  async function extractRegion(sx: number, sy: number, sw: number, sh: number): Promise<HTMLImageElement> {
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(holdImg, sx, sy, sw, sh, 0, 0, sw, sh);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Failed to extract hold region")); return; }
        blobToImage(blob).then(resolve, reject);
      });
    });
  }

  const [tail, body, head] = await Promise.all([
    extractRegion(0, 0, w, tailHeight),
    extractRegion(0, bodyTop, w, bodyHeight),
    extractRegion(0, headTop, w, headHeight),
  ]);

  return { tail, body, head };
}

// ============================================================
// ZIP Extraction
// ============================================================

// Map from zip filenames to our internal texture keys
const TEXTURE_MAP: Record<string, keyof RespackTextures> = {
  "click.png": "tap",
  "drag.png": "drag",
  "flick.png": "flick",
  "click_mh.png": "tapMH",
  "drag_mh.png": "dragMH",
  "flick_mh.png": "flickMH",
  "hit_fx.png": "hitFx",
};

export async function extractRespack(zipData: ArrayBuffer): Promise<{
  config: RespackConfig;
  textures: RespackTextures;
}> {
  const zip = await JSZip.loadAsync(zipData);

  // Find and parse info.yml
  let configText: string | null = null;
  for (const name of ["info.yml", "info.yaml"]) {
    const file = zip.file(name);
    if (file) {
      configText = await file.async("string");
      break;
    }
  }
  if (!configText) {
    throw new Error("No info.yml found in respack zip");
  }

  const config = parseInfoYml(configText);

  // Extract textures
  const textures: RespackTextures = {
    tap: null, drag: null, flick: null, hold: null,
    tapMH: null, dragMH: null, flickMH: null, holdMH: null,
    hitFx: null,
  };

  // Simple textures (non-hold)
  for (const [filename, key] of Object.entries(TEXTURE_MAP)) {
    const file = zip.file(filename);
    if (file) {
      const blob = await file.async("blob");
      textures[key] = await blobToImage(blob) as HTMLImageElement & HoldTextureParts;
    }
  }

  // Hold textures need atlas splitting
  const holdFile = zip.file("hold.png");
  if (holdFile) {
    const holdBlob = await holdFile.async("blob");
    const holdImg = await blobToImage(holdBlob);
    const atlas = config.holdAtlas ?? [50, 50];
    textures.hold = await splitHoldAtlas(holdImg, atlas[0], atlas[1]);
  }

  const holdMhFile = zip.file("hold_mh.png");
  if (holdMhFile) {
    const holdMhBlob = await holdMhFile.async("blob");
    const holdMhImg = await blobToImage(holdMhBlob);
    const atlasMH = config.holdAtlasMH ?? config.holdAtlas ?? [50, 50];
    textures.holdMH = await splitHoldAtlas(holdMhImg, atlasMH[0], atlasMH[1]);
  }

  return { config, textures };
}

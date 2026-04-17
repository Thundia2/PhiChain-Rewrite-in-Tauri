// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiNoteSprite — Note rendering helpers for the Pixi renderer
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Provides factory functions for creating and updating note sprites
// (tap, drag, flick) using either respack textures or colored fallback shapes.
// ============================================================

import { Sprite, Graphics, Texture } from "pixi.js";
import type { NoteKind } from "../../types/chart";
import type { PixiRespackTextures } from "./PixiTextureManager";

// ============================================================
// Note color palette (matches gameRenderer.ts)
// ============================================================

const NOTE_COLORS: Record<string, number> = {
  tap:   0x35b5ff,
  drag:  0xf0d040,
  flick: 0xff4060,
  hold:  0x35b5ff,
};

const PERFECT_COLOR = 0xfeffa9;
const SELECTED_COLOR = 0x32cd32;

// ============================================================
// Note color resolution
// ============================================================

/**
 * Determine the display color for a note based on selection state and FC/AP mode.
 * Returns a hex color number (e.g. 0x35b5ff).
 */
export function resolveNoteColor(
  kind: NoteKind,
  isSelected: boolean,
  isFcApActive: boolean,
  respackPerfectColor?: string | null,
): number {
  if (isSelected) return SELECTED_COLOR;
  if (isFcApActive) {
    // Parse respack colorPerfect if available (CSS hex string like "#feffa9")
    if (respackPerfectColor) {
      return parseInt(respackPerfectColor.replace("#", ""), 16) || PERFECT_COLOR;
    }
    return PERFECT_COLOR;
  }
  return NOTE_COLORS[kind] ?? 0xffffff;
}

// ============================================================
// Sprite configuration helpers
// ============================================================

/**
 * Configure a Sprite to display a note at the given position and size.
 *
 * @param sprite    The Sprite instance (from pool)
 * @param texture   The texture to use (respack or fallback)
 * @param noteX     X position in line-local space (center of note)
 * @param noteY     Y position in line-local space (center of note)
 * @param noteW     Note width in pixels
 * @param noteH     Note height in pixels (or auto from texture aspect ratio)
 * @param color     Tint color (hex number)
 * @param alpha     Note alpha (0-1)
 * @param useTexture Whether a real respack texture is being used (affects sizing)
 */
export function configureNoteSprite(
  sprite: Sprite,
  texture: Texture,
  noteX: number,
  noteY: number,
  noteW: number,
  noteH: number,
  color: number,
  alpha: number,
  useTexture: boolean,
): void {
  sprite.texture = texture;

  if (useTexture) {
    // Respack texture: maintain aspect ratio based on width
    const aspect = texture.height / texture.width;
    const texH = noteW * aspect;
    sprite.width = noteW;
    sprite.height = texH;
  } else {
    // Fallback: use exact note dimensions
    sprite.width = noteW;
    sprite.height = noteH;
  }

  // Position at center (anchor 0.5, 0.5)
  sprite.anchor.set(0.5, 0.5);
  sprite.position.set(noteX, noteY);
  sprite.tint = color;
  sprite.alpha = alpha;
}

/**
 * Configure a sprite for a drag note (shorter height: 70% of normal).
 */
export function configureDragSprite(
  sprite: Sprite,
  texture: Texture,
  noteX: number,
  noteY: number,
  noteW: number,
  noteH: number,
  color: number,
  alpha: number,
  useTexture: boolean,
): void {
  if (useTexture) {
    // Respack texture: same as normal note (texture defines shape)
    configureNoteSprite(sprite, texture, noteX, noteY, noteW, noteH, color, alpha, true);
  } else {
    // Fallback: 70% height for drag notes
    configureNoteSprite(sprite, texture, noteX, noteY, noteW, noteH * 0.7, color, alpha, false);
  }
}

/**
 * Get the texture to use for a note, checking respack first, fallback to white pixel.
 * Returns { texture, isRespackTexture } so the caller knows how to size the sprite.
 */
export function getNoteTexture(
  kind: NoteKind,
  isMultiHighlight: boolean,
  respackTextures: PixiRespackTextures | null,
): { texture: Texture; isRespack: boolean } {
  if (respackTextures) {
    const texKey = kind === "tap" ? "tap" : kind === "hold" ? "tap" : kind;
    const mhKey = (texKey + "MH") as "tapMH" | "dragMH" | "flickMH";

    // Try multi-highlight variant first
    if (isMultiHighlight) {
      const mhTex = respackTextures[mhKey];
      if (mhTex) return { texture: mhTex, isRespack: true };
    }

    // Try normal texture
    const tex = respackTextures[texKey as "tap" | "drag" | "flick"];
    if (tex) return { texture: tex, isRespack: true };
  }

  // Fallback: white pixel (will be tinted by sprite.tint)
  return { texture: Texture.WHITE, isRespack: false };
}

// ============================================================
// Multi-highlight outline
// ============================================================

/**
 * Draw a multi-highlight outline around a note using a Graphics object.
 * Only draws when the note's beat has notes on multiple lines AND
 * no multi-highlight respack texture is available.
 */
export function drawMultiHighlightOutline(
  gfx: Graphics,
  noteX: number,
  noteY: number,
  noteW: number,
  noteH: number,
): void {
  gfx.clear();
  gfx.rect(
    noteX - noteW / 2 - 1,
    noteY - noteH / 2 - 1,
    noteW + 2,
    noteH + 2,
  );
  gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
}

// ============================================================
// Flick arrow helper
// ============================================================

/**
 * Configure a Graphics object to draw a flick arrow above a note.
 * The arrow is a small upward-pointing triangle.
 */
export function drawFlickArrow(
  gfx: Graphics,
  noteX: number,
  noteY: number,
  noteW: number,
  noteH: number,
  color: number,
): void {
  gfx.clear();
  // Triangle above the note — shape first, then fill
  const arrowW = noteW * 0.3;
  gfx.moveTo(noteX - arrowW, noteY - noteH);
  gfx.lineTo(noteX, noteY - noteH * 2);
  gfx.lineTo(noteX + arrowW, noteY - noteH);
  gfx.closePath();
  gfx.fill({ color, alpha: 0.9 });
}

// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiTextureManager — Converts respack HTMLImageElements to PIXI.Textures
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Converts HTMLImageElement-based respack textures to PixiJS GPU textures
// with lazy caching and automatic lifecycle management.
// ============================================================

import { Texture } from "pixi.js";
import type { HoldTextureParts, LoadedRespack } from "../../utils/respackLoader";

// ============================================================
// Pixi-compatible hold texture parts
// ============================================================

export interface PixiHoldTextures {
  tail: Texture;
  body: Texture;
  head: Texture;
}

// ============================================================
// Pixi-compatible respack textures (mirrors RespackTextures but with Pixi Textures)
// ============================================================

export interface PixiRespackTextures {
  tap: Texture | null;
  drag: Texture | null;
  flick: Texture | null;
  hold: PixiHoldTextures | null;
  tapMH: Texture | null;
  dragMH: Texture | null;
  flickMH: Texture | null;
  holdMH: PixiHoldTextures | null;
  hitFx: Texture | null;
}

// ============================================================
// Texture Manager
// ============================================================

/**
 * Manages conversion of HTMLImageElement textures (from respack system)
 * to PixiJS GPU textures with caching. When the active respack changes,
 * call invalidate() to force re-creation of GPU textures.
 */
export class PixiTextureManager {
  // Cache keyed by HTMLImageElement reference — if the same image object
  // is passed again, we reuse the existing GPU texture.
  private cache = new Map<HTMLImageElement, Texture>();

  // Cached converted respack (invalidated when respack reference changes)
  private lastRespack: LoadedRespack | null = null;
  private cachedPixiTextures: PixiRespackTextures | null = null;

  // Line texture cache (custom judgment line textures)
  private lineTextureCache = new Map<string, Texture | null>();

  /**
   * Convert a single HTMLImageElement to a PIXI.Texture.
   * Returns cached version if the same image object was converted before.
   */
  getTexture(image: HTMLImageElement): Texture {
    let tex = this.cache.get(image);
    if (!tex) {
      // Use Texture.from() which handles ImageSource creation internally.
      // This is the recommended Pixi v8 approach for HTMLImageElement.
      tex = Texture.from(image);
      this.cache.set(image, tex);
    }
    return tex;
  }

  /**
   * Convert HoldTextureParts (head/body/tail HTMLImageElements) to PixiHoldTextures.
   */
  getHoldTextures(parts: HoldTextureParts): PixiHoldTextures {
    return {
      tail: this.getTexture(parts.tail),
      body: this.getTexture(parts.body),
      head: this.getTexture(parts.head),
    };
  }

  /**
   * Get the full set of Pixi textures for a LoadedRespack.
   * Caches the conversion — returns the same object if the respack
   * reference hasn't changed since the last call.
   */
  getRespackTextures(respack: LoadedRespack | null | undefined): PixiRespackTextures | null {
    if (!respack) return null;

    // Return cached if same respack object
    if (respack === this.lastRespack && this.cachedPixiTextures) {
      return this.cachedPixiTextures;
    }

    const textures = respack.textures;
    const result: PixiRespackTextures = {
      tap: textures.tap ? this.getTexture(textures.tap) : null,
      drag: textures.drag ? this.getTexture(textures.drag) : null,
      flick: textures.flick ? this.getTexture(textures.flick) : null,
      hold: textures.hold ? this.getHoldTextures(textures.hold) : null,
      tapMH: textures.tapMH ? this.getTexture(textures.tapMH) : null,
      dragMH: textures.dragMH ? this.getTexture(textures.dragMH) : null,
      flickMH: textures.flickMH ? this.getTexture(textures.flickMH) : null,
      holdMH: textures.holdMH ? this.getHoldTextures(textures.holdMH) : null,
      hitFx: textures.hitFx ? this.getTexture(textures.hitFx) : null,
    };

    this.lastRespack = respack;
    this.cachedPixiTextures = result;
    return result;
  }

  /**
   * Get or create a Pixi texture for a custom line texture (judgment line image).
   * Returns the cached texture if available, or creates one from the image.
   * Returns null if no cached texture exists and no image is provided.
   */
  getLineTexture(path: string, image: HTMLImageElement | null): Texture | null {
    // Return cached texture if available (regardless of image param)
    const cached = this.lineTextureCache.get(path);
    if (cached) return cached;

    // Create new texture from image if provided
    if (!image) return null;
    const tex = this.getTexture(image);
    this.lineTextureCache.set(path, tex);
    return tex;
  }

  /**
   * Check if a line texture is cached.
   */
  hasLineTexture(path: string): boolean {
    return this.lineTextureCache.has(path);
  }

  /**
   * Clear all cached textures. Call when the renderer is disposed
   * or when a major state change occurs (e.g. loading a new chart).
   */
  destroy(): void {
    // Destroy all cached textures to free GPU memory
    for (const tex of this.cache.values()) {
      tex.destroy(true);
    }
    this.cache.clear();
    this.lineTextureCache.clear();
    this.lastRespack = null;
    this.cachedPixiTextures = null;
  }
}

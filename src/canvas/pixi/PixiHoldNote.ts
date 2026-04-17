// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiHoldNote — Hold note rendering for the Pixi renderer
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Holds are composite objects: body (tiled or stretched) + head + tail sprites.
// Uses TilingSprite for holdRepeat mode (GPU-efficient texture wrapping).
// ============================================================

import { Sprite, TilingSprite, Container, Texture } from "pixi.js";
import type { PixiHoldTextures } from "./PixiTextureManager";

// ============================================================
// Hold note composite container
// ============================================================

/**
 * A container that manages the three parts of a hold note:
 *   - body: TilingSprite or Sprite (between head and tail)
 *   - head: Sprite (at the judgment line end)
 *   - tail: Sprite (at the far end)
 *
 * Positioned in line-local space. The parent PixiLineContainer
 * applies the line's world transform.
 */
export class PixiHoldNoteContainer extends Container {
  public bodySprite: TilingSprite | Sprite | null = null;
  public headSprite: Sprite | null = null;
  public tailSprite: Sprite | null = null;

  // Track whether body is currently a TilingSprite for switching
  private isTilingBody = false;

  /**
   * Update the hold note visual to match the current frame's parameters.
   *
   * @param noteX        Center X in line-local space
   * @param noteW        Note width in pixels
   * @param noteH        Note height in pixels (for fallback rect head/tail)
   * @param headY        Screen Y of head (in line-local, direction-adjusted)
   * @param tailY        Screen Y of tail (in line-local, direction-adjusted)
   * @param top          Top of the body rect (min of headY, tailY)
   * @param bodyHeight   Height of the body rect
   * @param color        Tint color (hex number)
   * @param holdTextures Pixi hold textures from respack (null = use fallback)
   * @param holdRepeat   Whether to tile the body texture (holdRepeat config)
   * @param holdCompact  Whether to overlap head/tail on body edges
   * @param holdKeepHead Whether to show head even after it passes the line
   * @param rawY         Raw distance from line (for holdKeepHead check)
   */
  update(
    noteX: number,
    noteW: number,
    noteH: number,
    headY: number,
    tailY: number,
    top: number,
    bodyHeight: number,
    color: number,
    holdTextures: PixiHoldTextures | null,
    holdRepeat: boolean,
    holdCompact: boolean,
    holdKeepHead: boolean,
    rawY: number,
  ): void {
    if (holdTextures) {
      this.updateTextured(
        noteX, noteW, headY, tailY, top, bodyHeight, color,
        holdTextures, holdRepeat, holdCompact, holdKeepHead, rawY,
      );
    } else {
      this.updateFallback(noteX, noteW, noteH, headY, tailY, top, bodyHeight, color, rawY);
    }
  }

  // ---- Textured hold (respack) ----

  private updateTextured(
    noteX: number,
    noteW: number,
    headY: number,
    tailY: number,
    top: number,
    bodyHeight: number,
    _color: number,
    holdTextures: PixiHoldTextures,
    holdRepeat: boolean,
    holdCompact: boolean,
    holdKeepHead: boolean,
    rawY: number,
  ): void {
    const headAspect = holdTextures.head.height / holdTextures.head.width;
    const tailAspect = holdTextures.tail.height / holdTextures.tail.width;
    const headTexH = noteW * headAspect;
    const tailTexH = noteW * tailAspect;

    // ---- Body ----
    if (holdRepeat) {
      // Use TilingSprite for repeat-y tiling
      if (!this.bodySprite || !this.isTilingBody) {
        if (this.bodySprite) { this.removeChild(this.bodySprite); this.bodySprite.destroy(); }
        this.bodySprite = new TilingSprite({
          texture: holdTextures.body,
          width: noteW,
          height: bodyHeight,
        });
        this.isTilingBody = true;
        this.addChildAt(this.bodySprite, 0); // Body behind head/tail
      }
      const ts = this.bodySprite as TilingSprite;
      ts.texture = holdTextures.body;
      ts.width = noteW;
      ts.height = bodyHeight;
      ts.position.set(noteX - noteW / 2, top);
      ts.alpha = 0.9;
      ts.visible = true;
    } else {
      // Stretched body
      if (!this.bodySprite || this.isTilingBody) {
        if (this.bodySprite) { this.removeChild(this.bodySprite); this.bodySprite.destroy(); }
        this.bodySprite = new Sprite(holdTextures.body);
        this.isTilingBody = false;
        this.addChildAt(this.bodySprite, 0);
      }
      this.bodySprite.texture = holdTextures.body;
      this.bodySprite.width = noteW;
      this.bodySprite.height = bodyHeight;
      this.bodySprite.position.set(noteX - noteW / 2, top);
      this.bodySprite.alpha = 0.9;
      this.bodySprite.visible = true;
    }

    // ---- Head ----
    if (!this.headSprite) {
      this.headSprite = new Sprite(holdTextures.head);
      this.headSprite.anchor.set(0.5, 0.5);
      this.addChild(this.headSprite);
    }
    this.headSprite.texture = holdTextures.head;
    this.headSprite.width = noteW;
    this.headSprite.height = headTexH;
    this.headSprite.alpha = 0.9;

    if (holdCompact) {
      this.headSprite.position.set(noteX, top);
      this.headSprite.visible = true;
    } else {
      this.headSprite.visible = rawY >= 0 || holdKeepHead;
      this.headSprite.position.set(noteX, headY);
    }

    // ---- Tail ----
    if (!this.tailSprite) {
      this.tailSprite = new Sprite(holdTextures.tail);
      this.tailSprite.anchor.set(0.5, 0.5);
      this.addChild(this.tailSprite);
    }
    this.tailSprite.texture = holdTextures.tail;
    this.tailSprite.width = noteW;
    this.tailSprite.height = tailTexH;
    this.tailSprite.alpha = 0.9;

    if (holdCompact) {
      this.tailSprite.position.set(noteX, top + bodyHeight);
    } else {
      this.tailSprite.position.set(noteX, tailY);
    }
    this.tailSprite.visible = true;
  }

  // ---- Fallback hold (colored rectangles) ----

  private updateFallback(
    noteX: number,
    noteW: number,
    noteH: number,
    headY: number,
    _tailY: number,
    top: number,
    bodyHeight: number,
    color: number,
    rawY: number,
  ): void {
    // We reuse bodySprite as a plain Sprite with the white pixel texture
    // The body, head, and tail are all simple colored rectangles

    // For fallback, we use Sprites with tint. We need the white pixel texture.
    // Import it lazily to avoid circular dependencies.
    const whiteTex = Texture.WHITE;

    // ---- Body (semi-transparent) ----
    if (!this.bodySprite || this.isTilingBody) {
      if (this.bodySprite) { this.removeChild(this.bodySprite); this.bodySprite.destroy(); }
      this.bodySprite = new Sprite(whiteTex);
      this.isTilingBody = false;
      this.addChildAt(this.bodySprite, 0);
    }
    this.bodySprite.texture = whiteTex;
    this.bodySprite.tint = color;
    this.bodySprite.width = noteW;
    this.bodySprite.height = bodyHeight;
    this.bodySprite.position.set(noteX - noteW / 2, top);
    this.bodySprite.alpha = 0.5;
    this.bodySprite.visible = true;

    // ---- Head (opaque) ----
    if (!this.headSprite) {
      this.headSprite = new Sprite(whiteTex);
      this.addChild(this.headSprite);
    }
    this.headSprite.texture = whiteTex;
    this.headSprite.tint = color;
    this.headSprite.anchor.set(0.5, 0.5);
    this.headSprite.width = noteW;
    this.headSprite.height = noteH;
    this.headSprite.position.set(noteX, headY);
    this.headSprite.alpha = 0.9;
    this.headSprite.visible = rawY >= 0;

    // ---- Tail (slightly transparent, half height) ----
    if (!this.tailSprite) {
      this.tailSprite = new Sprite(whiteTex);
      this.tailSprite.anchor.set(0.5, 0.5);
      this.addChild(this.tailSprite);
    }
    this.tailSprite.texture = whiteTex;
    this.tailSprite.tint = color;
    this.tailSprite.width = noteW;
    this.tailSprite.height = noteH / 2;
    // Tail is at bottom of body
    this.tailSprite.position.set(noteX, top + bodyHeight);
    this.tailSprite.alpha = 0.7;
    this.tailSprite.visible = true;
  }

  /**
   * Hide all parts (used when returning to pool).
   */
  hideAll(): void {
    if (this.bodySprite) this.bodySprite.visible = false;
    if (this.headSprite) this.headSprite.visible = false;
    if (this.tailSprite) this.tailSprite.visible = false;
    this.visible = false;
  }
}

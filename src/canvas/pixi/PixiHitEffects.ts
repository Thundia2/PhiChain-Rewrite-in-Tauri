// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiHitEffects — GPU-rendered hit effects for the Pixi renderer
//
// Recent change (build fix): renamed the private `effects` field to
// `hitEffects` to avoid a structural-subtype conflict with Pixi v8's
// Container.effects (public). Without the rename, PixiHitEffectLayer
// wasn't assignable to `ContainerChild`, breaking `addChild` callers.
// Also removed the unused `HitEffect` interface (duplicate of
// PixiHitEffectData) and the unused pool fields (ringPool/particlePool/
// spritePool/spriteSheetTexture) that were never wired up.
//
// Renders expanding rings + square particles using Pixi Graphics,
// and sprite sheet animations using Pixi Sprites. Reads from the
// existing HitEffectManager's effect data (spawning/tracking unchanged).
//
// Replaces the Canvas 2D overlay approach with direct scene graph
// rendering for better performance and consistency.
// ============================================================

import { Container, Graphics, Sprite, Texture, Rectangle } from "pixi.js";
import type { HitEffectConfig } from "../hitEffects";
import type { NoteKind } from "../../types/chart";

// ============================================================
// Types (mirrors hitEffects.ts internal types)
// ============================================================

interface Particle {
  angle: number;
  speed: number;
  size: number;
}

const DEFAULT_LIFETIME = 0.5;
const PARTICLE_COUNT = 4;
const EFFECT_COLOR = "53, 181, 255";

/**
 * Parse an "R, G, B" color string to a hex number for Pixi tinting.
 */
function parseRGBString(rgb: string): number {
  const parts = rgb.split(",").map(s => parseInt(s.trim()));
  if (parts.length >= 3) {
    return (parts[0] << 16) | (parts[1] << 8) | parts[2];
  }
  return 0x35b5ff; // fallback
}

// ============================================================
// PixiHitEffectLayer — renders hit effects in the Pixi scene graph
// ============================================================

/**
 * A Container that renders hit effects (expanding rings + particles)
 * directly in the Pixi scene graph. This replaces the Canvas 2D
 * overlay approach used in Phase 1.
 *
 * The layer reads effect data from a parallel tracking array and
 * renders using pooled Graphics objects.
 *
 * Usage:
 *   1. Add to the stage after the line layer
 *   2. Call update() each frame with currentTime
 *   3. Hit effects are spawned via the existing HitEffectManager
 */
export class PixiHitEffectLayer extends Container {
  // Active hit effects (renamed from `effects` to avoid shadowing
  // Container.effects introduced in Pixi v8).
  private hitEffects: PixiHitEffectData[] = [];
  private processedKeys = new Set<string>();
  private config: HitEffectConfig | null = null;
  private onHitSound: ((kind: NoteKind) => void) | null = null;

  // Sprite sheet textures (extracted frames from respack hit_fx.png)
  private frameTextures: Texture[] = [];

  constructor() {
    super();
  }

  /** Set respack hit effect config (null = use default ring+particles) */
  setConfig(config: HitEffectConfig | null): void {
    this.config = config;
    // Rebuild frame textures if sprite sheet changed
    if (config?.spriteSheet) {
      this.buildFrameTextures(config);
    } else {
      this.frameTextures = [];
    }
  }

  /** Set callback for playing hit sounds when notes are hit */
  setHitSoundCallback(cb: ((kind: NoteKind) => void) | null): void {
    this.onHitSound = cb;
  }

  /**
   * Build individual frame textures from the sprite sheet grid.
   */
  private buildFrameTextures(config: HitEffectConfig): void {
    const sheet = config.spriteSheet;
    const baseTexture = Texture.from(sheet);
    const frameW = sheet.naturalWidth / config.cols;
    const frameH = sheet.naturalHeight / config.rows;
    this.frameTextures = [];
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        const frame = new Texture({
          source: baseTexture.source,
          frame: new Rectangle(col * frameW, row * frameH, frameW, frameH),
        });
        this.frameTextures.push(frame);
      }
    }
  }

  /**
   * Spawn a hit effect at the given screen position.
   * Same signature as HitEffectManager.trySpawnEffect().
   */
  trySpawnEffect(
    key: string,
    noteBeat: number,
    currentBeat: number,
    screenX: number,
    screenY: number,
    currentTime: number,
    noteKind?: NoteKind,
    lineColor?: [number, number, number] | null,
  ): void {
    if (noteBeat > currentBeat) return;
    if (this.processedKeys.has(key)) return;
    this.processedKeys.add(key);

    // Play hit sound
    if (this.onHitSound && noteKind) {
      this.onHitSound(noteKind);
    }

    // Determine effect color
    const tinted = this.config ? this.config.tinted : true;
    const effectColor = (tinted && lineColor)
      ? `${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]}`
      : EFFECT_COLOR;

    // Create effect data
    const effect: PixiHitEffectData = {
      x: screenX,
      y: screenY,
      spawnTime: currentTime,
      rotation: this.config?.rotate ? Math.random() * Math.PI * 2 : 0,
      color: effectColor,
      colorHex: parseRGBString(effectColor),
      particles: Array.from({ length: PARTICLE_COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 80 + Math.random() * 120,
        size: 4 + Math.random() * 4,
      })),
      // Pixi objects (created lazily)
      ringGfx: null,
      particleGfxs: [],
      spriteObj: null,
    };

    this.hitEffects.push(effect);
  }

  /**
   * Update and render all active effects.
   * Call once per frame from the render loop.
   */
  update(currentTime: number): void {
    const lifetime = this.config?.duration ?? DEFAULT_LIFETIME;

    // Update existing effects, remove expired ones
    this.hitEffects = this.hitEffects.filter((e) => {
      const age = currentTime - e.spawnTime;
      if (age > lifetime || age < 0) {
        // Remove Pixi objects
        this.recycleEffect(e);
        return false;
      }

      const progress = age / lifetime;

      if (this.config?.spriteSheet && this.frameTextures.length > 0) {
        this.updateSpriteEffect(e, progress);
      } else {
        this.updateDefaultEffect(e, progress);
      }

      return true;
    });
  }

  // ---- Default effect: expanding ring + particles ----

  private updateDefaultEffect(effect: PixiHitEffectData, progress: number): void {
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out quad

    // Ring
    if (!effect.ringGfx) {
      effect.ringGfx = new Graphics();
      this.addChild(effect.ringGfx);
    }
    const ringRadius = 30 * eased;
    const ringAlpha = 1 - progress;
    const ringWidth = 3 * (1 - progress);
    effect.ringGfx.clear();
    effect.ringGfx.circle(effect.x, effect.y, Math.max(ringRadius, 0.1));
    effect.ringGfx.stroke({ width: Math.max(ringWidth, 0.1), color: effect.colorHex, alpha: ringAlpha });

    // Particles
    while (effect.particleGfxs.length < effect.particles.length) {
      const g = new Graphics();
      this.addChild(g);
      effect.particleGfxs.push(g);
    }

    for (let i = 0; i < effect.particles.length; i++) {
      const p = effect.particles[i];
      const g = effect.particleGfxs[i];
      const px = effect.x + Math.cos(p.angle) * p.speed * eased;
      const py = effect.y + Math.sin(p.angle) * p.speed * eased;
      const size = p.size * (1 - progress);
      g.clear();
      g.rect(px - size / 2, py - size / 2, Math.max(size, 0.1), Math.max(size, 0.1));
      g.fill({ color: effect.colorHex, alpha: 1 - progress });
    }
  }

  // ---- Sprite sheet effect ----

  private updateSpriteEffect(effect: PixiHitEffectData, progress: number): void {
    const cfg = this.config!;
    const totalFrames = this.frameTextures.length;
    const frameIndex = Math.min(Math.floor(progress * totalFrames), totalFrames - 1);

    if (!effect.spriteObj) {
      effect.spriteObj = new Sprite();
      effect.spriteObj.anchor.set(0.5, 0.5);
      this.addChild(effect.spriteObj);
    }

    const frameW = cfg.spriteSheet.naturalWidth / cfg.cols;
    const drawSize = frameW * cfg.scale * 1.5;

    effect.spriteObj.texture = this.frameTextures[frameIndex];
    effect.spriteObj.position.set(effect.x, effect.y);
    effect.spriteObj.width = drawSize;
    effect.spriteObj.height = drawSize;
    effect.spriteObj.rotation = effect.rotation;
    effect.spriteObj.alpha = 1 - progress * 0.3;
    effect.spriteObj.visible = true;

    // Optional particles alongside sprite
    if (!cfg.hideParticles) {
      const eased = 1 - (1 - progress) * (1 - progress);
      while (effect.particleGfxs.length < effect.particles.length) {
        const g = new Graphics();
        this.addChild(g);
        effect.particleGfxs.push(g);
      }
      for (let i = 0; i < effect.particles.length; i++) {
        const p = effect.particles[i];
        const g = effect.particleGfxs[i];
        const px = effect.x + Math.cos(p.angle) * p.speed * eased;
        const py = effect.y + Math.sin(p.angle) * p.speed * eased;
        const size = p.size * (1 - progress);
        g.clear();
        g.rect(px - size / 2, py - size / 2, Math.max(size, 0.1), Math.max(size, 0.1));
        g.fill({ color: effect.colorHex, alpha: 1 - progress });
      }
    }
  }

  // ---- Cleanup ----

  private recycleEffect(effect: PixiHitEffectData): void {
    if (effect.ringGfx) {
      this.removeChild(effect.ringGfx);
      effect.ringGfx.destroy();
      effect.ringGfx = null;
    }
    for (const g of effect.particleGfxs) {
      this.removeChild(g);
      g.destroy();
    }
    effect.particleGfxs = [];
    if (effect.spriteObj) {
      this.removeChild(effect.spriteObj);
      effect.spriteObj.destroy();
      effect.spriteObj = null;
    }
  }

  /** Reset all effects (call when seeking or stopping playback) */
  reset(): void {
    for (const e of this.hitEffects) {
      this.recycleEffect(e);
    }
    this.hitEffects = [];
    this.processedKeys.clear();
  }

  override destroy(): void {
    this.reset();
    super.destroy({ children: true });
  }
}

// ---- Internal data type ----

interface PixiHitEffectData {
  x: number;
  y: number;
  spawnTime: number;
  rotation: number;
  color: string;
  colorHex: number;
  particles: Particle[];
  // Pixi display objects
  ringGfx: Graphics | null;
  particleGfxs: Graphics[];
  spriteObj: Sprite | null;
}

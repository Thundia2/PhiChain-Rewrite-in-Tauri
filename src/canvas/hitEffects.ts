// ============================================================
// Hit Effect & Particle System
//
// Spawns expanding ring + square particles when notes are "hit"
// during playback. Effects last 0.5 seconds with ease-out.
//
// When a respack sprite sheet is configured, renders animated
// frames from the hit_fx.png grid instead of the default effect.
// ============================================================

interface Particle {
  angle: number;
  speed: number;
  size: number;
}

interface HitEffect {
  x: number;
  y: number;
  spawnTime: number;
  rotation: number; // random rotation if hitFxRotate is enabled
  particles: Particle[];
}

export interface HitEffectConfig {
  spriteSheet: HTMLImageElement;
  cols: number;
  rows: number;
  duration: number;  // animation duration in seconds
  scale: number;
  rotate: boolean;
  hideParticles: boolean;
}

const DEFAULT_LIFETIME = 0.5;
const PARTICLE_COUNT = 4;
const EFFECT_COLOR = "53, 181, 255"; // #35b5ff as rgb

export class HitEffectManager {
  private effects: HitEffect[] = [];
  private processedKeys = new Set<string>();
  private config: HitEffectConfig | null = null;

  /** Set respack hit effect config (null = use default ring+particles) */
  setConfig(config: HitEffectConfig | null): void {
    this.config = config;
  }

  /**
   * Check if a note should trigger a hit effect and spawn one.
   * Call once per note per frame during playback.
   */
  trySpawnEffect(
    key: string,
    noteBeat: number,
    currentBeat: number,
    screenX: number,
    screenY: number,
    currentTime: number,
  ): void {
    if (noteBeat > currentBeat) return; // Not hit yet
    if (this.processedKeys.has(key)) return; // Already spawned

    this.processedKeys.add(key);
    this.effects.push({
      x: screenX,
      y: screenY,
      spawnTime: currentTime,
      rotation: this.config?.rotate ? Math.random() * Math.PI * 2 : 0,
      particles: Array.from({ length: PARTICLE_COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 80 + Math.random() * 120,
        size: 4 + Math.random() * 4,
      })),
    });
  }

  /**
   * Render all active effects and remove expired ones.
   */
  render(ctx: CanvasRenderingContext2D, currentTime: number): void {
    const lifetime = this.config?.duration ?? DEFAULT_LIFETIME;

    this.effects = this.effects.filter((e) => {
      const age = currentTime - e.spawnTime;
      if (age > lifetime || age < 0) return false;

      const progress = age / lifetime;

      if (this.config?.spriteSheet) {
        this.renderSpriteEffect(ctx, e, progress);
      } else {
        this.renderDefaultEffect(ctx, e, progress);
      }

      return true; // Keep effect alive
    });
  }

  /** Render using respack sprite sheet */
  private renderSpriteEffect(
    ctx: CanvasRenderingContext2D,
    effect: HitEffect,
    progress: number,
  ): void {
    const cfg = this.config!;
    const sheet = cfg.spriteSheet;
    const totalFrames = cfg.cols * cfg.rows;
    const frameIndex = Math.min(Math.floor(progress * totalFrames), totalFrames - 1);

    const col = frameIndex % cfg.cols;
    const row = Math.floor(frameIndex / cfg.cols);
    const frameW = sheet.naturalWidth / cfg.cols;
    const frameH = sheet.naturalHeight / cfg.rows;

    const drawSize = frameW * cfg.scale * 1.5;

    ctx.save();
    ctx.translate(effect.x, effect.y);
    if (effect.rotation !== 0) {
      ctx.rotate(effect.rotation);
    }
    ctx.globalAlpha = 1 - progress * 0.3;
    ctx.drawImage(
      sheet,
      col * frameW, row * frameH, frameW, frameH,
      -drawSize / 2, -drawSize / 2, drawSize, drawSize,
    );
    ctx.restore();

    // Optional particles alongside sprite
    if (!cfg.hideParticles) {
      const eased = 1 - (1 - progress) * (1 - progress);
      for (const p of effect.particles) {
        const px = effect.x + Math.cos(p.angle) * p.speed * eased;
        const py = effect.y + Math.sin(p.angle) * p.speed * eased;
        const size = p.size * (1 - progress);
        ctx.fillStyle = `rgba(${EFFECT_COLOR}, ${1 - progress})`;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    }
  }

  /** Render default ring + particles effect */
  private renderDefaultEffect(
    ctx: CanvasRenderingContext2D,
    effect: HitEffect,
    progress: number,
  ): void {
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out quad

    // Expanding ring
    const ringRadius = 30 * eased;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${EFFECT_COLOR}, ${1 - progress})`;
    ctx.lineWidth = 3 * (1 - progress);
    ctx.stroke();

    // Particles
    for (const p of effect.particles) {
      const px = effect.x + Math.cos(p.angle) * p.speed * eased;
      const py = effect.y + Math.sin(p.angle) * p.speed * eased;
      const size = p.size * (1 - progress);
      ctx.fillStyle = `rgba(${EFFECT_COLOR}, ${1 - progress})`;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }

  /** Reset all effects (call when seeking or stopping playback) */
  reset(): void {
    this.effects = [];
    this.processedKeys.clear();
  }
}

// ============================================================
// *** PAUSED / ON HOLD ***
// Feature-flagged behind usePixiRenderer setting (default: false).
// Functional but still undergoing visual parity testing.
// ============================================================
// PixiGameRenderer — GPU-accelerated game preview renderer
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Replaces the Canvas 2D GameRenderer with a PixiJS v8 scene graph.
// Same RenderResult interface for backward-compatible hit-testing.
//
// Architecture:
//   Stage
//     +-- backgroundLayer (illustration + dim)
//     +-- lineLayer (PixiLineContainers sorted by z_order)
//     +-- hudLayer (score, combo, chart info)
//
// Key performance improvement: PixiJS auto-batches sprites sharing
// the same texture/blend mode, collapsing 1000+ note draws into 4-8
// GPU draw calls (one per note texture type).
// ============================================================

import { Application, Container, Sprite, Graphics, Texture, Filter } from "pixi.js";
import type { Line, Beat } from "../../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat } from "../../types/chart";
import { computeWorldTransforms, evaluateLineEventsWithLayers } from "../events";
import type { BpmList } from "../../utils/bpmList";
import { getCachedMultiBeats } from "../../stores/chartStore";

// Local pixi modules
import { PixiTextureManager } from "./PixiTextureManager";
import { PixiLineContainer } from "./PixiLineContainer";
import { PixiHud } from "./PixiHud";
import { PixiHitEffectLayer } from "./PixiHitEffects";
import { createChartFilter, updateChartFilterUniforms, isEffectActive } from "./PixiShaderFilter";
import type { ShaderEffect } from "../../types/extra";

// Re-export types from gameRenderer.ts for API compatibility
import type { RenderResult, RenderOptions, RenderedLineInfo, RenderedNoteInfo } from "../gameRenderer";
export type { RenderResult, RenderOptions, RenderedLineInfo, RenderedNoteInfo };

// ============================================================
// PixiGameRenderer
// ============================================================

/**
 * GPU-accelerated game preview renderer using PixiJS v8.
 *
 * Drop-in replacement for GameRenderer with the same render() signature
 * and RenderResult output. The Canvas 2D context is replaced by a
 * PixiJS WebGL Application.
 *
 * Usage:
 *   const renderer = new PixiGameRenderer();
 *   await renderer.init(canvas);
 *   // Per frame:
 *   const result = renderer.render(lines, bpmList, ...);
 *   // On dispose:
 *   renderer.destroy();
 */
export class PixiGameRenderer {
  private app: Application | null = null;
  private textureManager = new PixiTextureManager();

  // Track init state — destroy must wait for init to complete
  private initPromise: Promise<void> | null = null;
  private initComplete = false;
  private destroyed = false;

  // Scene graph layers
  private backgroundLayer: Container | null = null;
  private lineLayer: Container | null = null;
  private hitEffectLayer: PixiHitEffectLayer | null = null;
  private hudLayer: PixiHud | null = null;

  // Background sprites
  private illustrationSprite: Sprite | null = null;
  private dimOverlay: Graphics | null = null;

  // Line containers pool (keyed by line index, resized per frame)
  private lineContainers: PixiLineContainer[] = [];

  // Canvas element reference (for sizing)
  private canvas: HTMLCanvasElement | null = null;

  // Track the last illustration image to detect changes
  private lastIllustrationImage: HTMLImageElement | null = null;
  private illustrationTexture: Texture | null = null;

  // Post-processing filters (Phase 3)
  private filterCache = new Map<string, Filter>();

  // Hit effect manager reference (still renders via Canvas 2D overlay in Phase 1)
  // The HitEffectManager.render() call is handled by the component's overlay canvas.

  /**
   * Initialize the Pixi Application.
   *
   * Instead of reusing the React-managed canvas (which breaks on React Strict
   * Mode double-mount — the WebGL context gets corrupted when Pixi destroys
   * then re-inits on the same canvas), we let Pixi create its own canvas and
   * insert it into the container. The caller provides the container element.
   */
  async init(container: HTMLElement): Promise<void> {
    this.destroyed = false;

    this.app = new Application();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Store the init promise so destroy() can await it if needed
    this.initPromise = this.app.init({
      // Don't pass canvas — let Pixi create a fresh one each time.
      // This avoids WebGL context corruption on React Strict Mode re-mounts.
      preference: "webgl",  // Force WebGL (not WebGPU) for broad compatibility
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundAlpha: 0,  // Transparent background (for overlay compositing)
      width,
      height,
    });
    await this.initPromise;

    // If destroy() was called while we were awaiting init, abort setup
    if (this.destroyed) return;

    // Insert Pixi's canvas into the container as the first child
    this.canvas = this.app.canvas as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    // Insert before any existing children (overlay canvas)
    if (container.firstChild) {
      container.insertBefore(this.canvas, container.firstChild);
    } else {
      container.appendChild(this.canvas);
    }

    // Build scene graph
    this.backgroundLayer = new Container();
    this.app.stage.addChild(this.backgroundLayer);

    // Background illustration sprite
    this.illustrationSprite = new Sprite();
    this.illustrationSprite.visible = false;
    this.backgroundLayer.addChild(this.illustrationSprite);

    // Dim overlay (black rectangle with alpha)
    this.dimOverlay = new Graphics();
    this.backgroundLayer.addChild(this.dimOverlay);

    // Line layer (sorted per frame by z_order)
    this.lineLayer = new Container();
    this.app.stage.addChild(this.lineLayer);

    // Hit effect layer (rendered on top of lines, below HUD)
    this.hitEffectLayer = new PixiHitEffectLayer();
    this.app.stage.addChild(this.hitEffectLayer);

    // HUD layer
    this.hudLayer = new PixiHud();
    this.app.stage.addChild(this.hudLayer);

    // Disable Pixi's built-in ticker — we drive rendering manually via render()
    this.app.ticker.stop();

    this.initPromise = null; // Clear so destroy() takes the sync path
    this.initComplete = true;
  }

  /**
   * Check if the renderer has been fully initialized and is ready to render.
   */
  get initialized(): boolean {
    return this.initComplete && this.app !== null && !this.destroyed;
  }

  /**
   * Reset hit effects (call when seeking or stopping playback).
   */
  resetHitEffects(): void {
    this.hitEffectLayer?.reset();
  }

  /**
   * Configure the Pixi hit effect layer with respack settings.
   */
  setHitEffectConfig(config: import("../hitEffects").HitEffectConfig | null): void {
    this.hitEffectLayer?.setConfig(config);
  }

  /**
   * Set the hit sound callback on the Pixi hit effect layer.
   */
  setHitSoundCallback(cb: ((kind: import("../../types/chart").NoteKind) => void) | null): void {
    this.hitEffectLayer?.setHitSoundCallback(cb);
  }

  /**
   * Apply post-processing shader effects to the stage.
   * Filters are cached by shader name and reused across frames.
   * Call each frame with the current effects list and beat/time.
   *
   * @param effects Array of ShaderEffects from extraConfig
   * @param currentBeat Current playback beat
   * @param currentTime Current time in seconds
   * @param canvasWidth Canvas width for screenSize uniform
   * @param canvasHeight Canvas height for screenSize uniform
   */
  applyShaderEffects(
    effects: ShaderEffect[] | undefined,
    currentBeat: number,
    currentTime: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    if (!this.app || !this.initComplete) return;

    if (!effects || effects.length === 0) {
      // No effects — clear any applied filters
      if (this.app.stage.filters && this.app.stage.filters.length > 0) {
        this.app.stage.filters = [];
      }
      return;
    }

    // Find active effects at the current beat
    const activeEffects = effects.filter(e => isEffectActive(e, currentBeat));

    if (activeEffects.length === 0) {
      if (this.app.stage.filters && this.app.stage.filters.length > 0) {
        this.app.stage.filters = [];
      }
      return;
    }

    // Build filter array for active effects
    const filters: Filter[] = [];
    for (const effect of activeEffects) {
      // Get or create the filter for this shader
      let filter = this.filterCache.get(effect.shader);
      if (!filter) {
        filter = createChartFilter(effect) ?? undefined;
        if (filter) {
          this.filterCache.set(effect.shader, filter);
        }
      }
      if (!filter) continue;

      // Update uniforms for this frame
      updateChartFilterUniforms(filter, effect, currentBeat, currentTime, canvasWidth, canvasHeight);
      filters.push(filter);
    }

    // Apply filters to the stage
    this.app.stage.filters = filters;
  }

  /**
   * Resize the renderer to match the canvas container.
   * Call when the container size changes.
   */
  resize(width: number, height: number): void {
    if (!this.app?.renderer) return;
    this.app.renderer.resize(width, height);
  }

  /**
   * Load a custom line texture into the texture cache.
   * Compatible with GameRenderer.loadLineTexture().
   */
  loadLineTexture(path: string, image: HTMLImageElement): void {
    this.textureManager.getLineTexture(path, image);
  }

  /**
   * Check if a line texture is cached.
   * Compatible with GameRenderer.hasLineTexture().
   */
  hasLineTexture(path: string): boolean {
    return this.textureManager.hasLineTexture(path);
  }

  /**
   * Render a single frame of the game preview.
   *
   * Same signature as GameRenderer.render() for drop-in compatibility.
   * Returns a RenderResult with computed screen positions for hit-testing.
   */
  render(
    lines: Line[],
    bpmList: BpmList,
    currentTime: number,
    offset: number,
    canvasWidth: number,
    canvasHeight: number,
    options: RenderOptions = {},
  ): RenderResult {
    if (this.destroyed || !this.app?.renderer || !this.backgroundLayer || !this.lineLayer || !this.hudLayer) {
      return { lines: [] };
    }

    const noteScale = options.noteSize ?? 1.0;
    const time = currentTime - offset;
    const currentBeat = bpmList.beatAtFloat(time);
    const bpmTimeAt = (beat: Beat) => bpmList.timeAt(beat);

    // ---- Update background ----
    this.updateBackground(options.illustrationImage ?? null, canvasWidth, canvasHeight, options.backgroundDim ?? 0.6);

    // ---- Pre-compute world transforms ----
    const worldTransforms = computeWorldTransforms(lines, currentBeat, canvasWidth, canvasHeight);

    // ---- Sort lines by z_order ----
    const lineOrder = lines.map((_, i) => i)
      .sort((a, b) => (lines[a].z_order ?? 0) - (lines[b].z_order ?? 0));

    // ---- Ensure we have enough line containers ----
    this.ensureLineContainers(lines.length);

    // ---- Get respack textures ----
    const respackTextures = this.textureManager.getRespackTextures(options.respack);
    const respackConfig = options.respack?.config ?? null;

    // ---- Multi-highlight set ----
    const multiBeats: Set<number> | null = options.multiHighlight
      ? getCachedMultiBeats() : null;

    // ---- FC/AP active ----
    const isFcApActive = !!(options.isPlaying && options.showFcApIndicator && options.isFcValid);

    // ---- Update each line ----
    const renderResult: RenderResult = { lines: [] };

    for (let orderIdx = 0; orderIdx < lineOrder.length; orderIdx++) {
      const lineIdx = lineOrder[orderIdx];
      const container = this.lineContainers[lineIdx];

      // Update z-order in the parent container
      this.lineLayer.setChildIndex(container, orderIdx);

      // Skip hidden lines
      if (options.hiddenLineIndices?.has(lineIdx)) {
        container.visible = false;
        renderResult.lines.push({
          lineIndex: lineIdx,
          screenX: 0, screenY: 0, rotation: 0, opacity: 0, scaleX: 1, scaleY: 1,
          notes: [],
        });
        continue;
      }

      container.visible = true;

      // Handle pre-beat-0 opacity (RPE spec)
      const state = worldTransforms[lineIdx].localState;
      if (currentBeat < 0 && !lines[lineIdx].attach_ui) {
        const hasAlphaEvents = lines[lineIdx].event_layers && lines[lineIdx].event_layers!.length > 0
          ? lines[lineIdx].event_layers!.some(l => l.alpha_events.length > 0)
          : lines[lineIdx].events.some(e => e.kind === "opacity");
        if (!hasAlphaEvents) {
          state.opacity = -1.0;
        }
      }

      // Get line texture
      const lineTexture = lines[lineIdx].texture
        ? this.textureManager.getLineTexture(
            lines[lineIdx].texture!,
            null, // Texture already loaded via loadLineTexture()
          )
        : null;

      // Update the line container
      container.updateLine(
        lines[lineIdx],
        worldTransforms[lineIdx],
        currentBeat,
        time,
        bpmTimeAt,
        canvasWidth,
        canvasHeight,
        noteScale,
        options.selectedLineIndex ?? null,
        options.selectedNoteIndices ?? null,
        multiBeats,
        isFcApActive,
        respackTextures,
        respackConfig ? {
          holdRepeat: respackConfig.holdRepeat,
          holdCompact: respackConfig.holdCompact,
          holdKeepHead: respackConfig.holdKeepHead,
          colorPerfect: respackConfig.colorPerfect,
        } : null,
        lineTexture,
        {
          hideNotes: options.hideNotes,
          anchorMarkerVisibility: options.anchorMarkerVisibility,
          isMultiSelected: options.multiSelectedLineIndices?.has(lineIdx) ?? false,
          chartFontFamily: options.chartFontFamily,
          pendingNote: options.pendingNote,
          pendingLineIndex: options.pendingLineIndex,
          hitEffectManager: options.hitEffectManager,
          pixiHitEffectLayer: this.hitEffectLayer,
          isPlaying: options.isPlaying,
          showHitEffects: options.showHitEffects,
        },
      );

      // Collect render result
      renderResult.lines.push({
        lineIndex: lineIdx,
        screenX: worldTransforms[lineIdx].worldX,
        screenY: worldTransforms[lineIdx].worldY,
        rotation: worldTransforms[lineIdx].worldRotation,
        opacity: state.opacity,
        scaleX: state.scale_x,
        scaleY: state.scale_y,
        notes: container.renderedNotes,
      });
    }

    // ---- Hit effects (rendered via Pixi scene graph in Phase 2) ----
    if (this.hitEffectLayer) {
      // Update hit effect config from respack (mirrors HitEffectManager setup)
      if (options.hitEffectManager) {
        // The spawning is handled by PixiLineContainer.updateNotes() which
        // calls hitEffectManager.trySpawnEffect(). The existing HitEffectManager
        // tracks the effects. We render them here via its Canvas 2D render method
        // on a temporary context, OR we can update the Pixi layer directly.
        // For now, use the Pixi-native hit effect layer which duplicates the
        // spawning logic to render directly in the scene graph.
      }

      // Update all active effects
      if (options.isPlaying && options.showHitEffects !== false) {
        this.hitEffectLayer.update(time);
        this.hitEffectLayer.visible = true;
      } else {
        this.hitEffectLayer.visible = false;
      }
    }

    // ---- HUD ----
    if (options.showHud) {
      let combo = 0;
      let totalNotes = 0;
      for (const line of lines) {
        for (const note of line.notes) {
          if (note.fake) continue;
          totalNotes++;
          if (beatToFloat(note.beat) <= currentBeat) combo++;
        }
      }
      this.hudLayer.update(
        combo, totalNotes,
        options.chartName ?? "", options.chartLevel ?? "",
        canvasWidth, canvasHeight, true,
      );
    } else {
      this.hudLayer.update(0, 0, "", "", canvasWidth, canvasHeight, false);
    }

    // ---- Render the scene ----
    // Guard: destroy may have been called between our init check and here
    // (e.g. React unmount during rAF callback). Wrap in try-catch to
    // prevent the "Cannot read properties of null" crash in _DefaultBatcher2.
    if (!this.destroyed && this.app?.renderer) {
      try {
        this.app.renderer.render(this.app.stage);
      } catch {
        // Renderer was torn down mid-frame — safe to ignore
      }
    }

    return renderResult;
  }

  /**
   * Hit-test notes using pre-computed RenderResult positions.
   * Same logic as GameRenderer.hitTestNote().
   */
  hitTestNote(
    clickX: number,
    clickY: number,
    renderResult: RenderResult,
    hitRadius: number = 12,
  ): { lineIndex: number; noteIndex: number } | null {
    for (let i = renderResult.lines.length - 1; i >= 0; i--) {
      const lineInfo = renderResult.lines[i];
      for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
        const noteInfo = lineInfo.notes[j];
        const dx = clickX - noteInfo.screenX;
        const dy = clickY - noteInfo.screenY;
        const halfW = Math.max(noteInfo.width / 2, hitRadius);
        const halfH = Math.max(noteInfo.height / 2, hitRadius);
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
          return { lineIndex: lineInfo.lineIndex, noteIndex: noteInfo.noteIndex };
        }
      }
    }
    return null;
  }

  /**
   * Hit-test lines (same logic as GameRenderer.hitTestLine()).
   * Uses evaluateLineEventsWithLayers for fresh state computation.
   */
  hitTestLine(
    lines: Line[],
    currentBeat: number,
    clickX: number,
    clickY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): number | null {
    const lineHalfW = canvasWidth * 1.5;
    const hitThreshold = 8;

    for (let i = lines.length - 1; i >= 0; i--) {
      const state = evaluateLineEventsWithLayers(lines[i].events, lines[i].event_layers, currentBeat);
      if (state.opacity <= 0) continue;
      const screenX = canvasWidth / 2 + (state.x / CANVAS_WIDTH) * canvasWidth;
      const screenY = canvasHeight / 2 - (state.y / CANVAS_HEIGHT) * canvasHeight;
      const dx = clickX - screenX;
      const dy = clickY - screenY;
      const cos = Math.cos(-state.rotation);
      const sin = Math.sin(-state.rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      if (Math.abs(localX) <= lineHalfW && Math.abs(localY) <= hitThreshold) {
        return i;
      }
    }
    return null;
  }

  // ============================================================
  // Background management
  // ============================================================

  private updateBackground(
    illustrationImage: HTMLImageElement | null,
    canvasWidth: number,
    canvasHeight: number,
    bgDim: number,
  ): void {
    if (!this.illustrationSprite || !this.dimOverlay) return;

    // Update illustration
    if (illustrationImage && illustrationImage !== this.lastIllustrationImage) {
      // Create new texture from the image using Texture.from()
      if (this.illustrationTexture) this.illustrationTexture.destroy(true);
      this.illustrationTexture = Texture.from(illustrationImage);
      this.illustrationSprite.texture = this.illustrationTexture;
      this.lastIllustrationImage = illustrationImage;
    }

    if (illustrationImage && this.illustrationTexture) {
      this.illustrationSprite.visible = true;
      // Cover-fit the illustration (same as gameRenderer.ts)
      const img = illustrationImage;
      const scale = Math.max(canvasWidth / img.width, canvasHeight / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      this.illustrationSprite.width = w;
      this.illustrationSprite.height = h;
      this.illustrationSprite.position.set((canvasWidth - w) / 2, (canvasHeight - h) / 2);
    } else {
      this.illustrationSprite.visible = false;
    }

    // Dim overlay — shape first, then fill (Pixi v8 chained API)
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, canvasWidth, canvasHeight);
    this.dimOverlay.fill({ color: 0x000000, alpha: bgDim });
  }

  // ============================================================
  // Line container management
  // ============================================================

  /**
   * Ensure we have exactly `count` line containers.
   * Creates new ones or hides excess as needed.
   */
  private ensureLineContainers(count: number): void {
    if (!this.lineLayer) return;

    // Create new containers if we need more
    while (this.lineContainers.length < count) {
      const container = new PixiLineContainer(this.lineContainers.length);
      this.lineContainers.push(container);
      this.lineLayer.addChild(container);
    }

    // Hide excess containers (don't destroy — chart may grow again)
    for (let i = count; i < this.lineContainers.length; i++) {
      this.lineContainers[i].visible = false;
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Destroy the renderer and free all GPU resources.
   * If init() is still in progress, waits for it to finish first
   * to avoid destroying a half-initialized Pixi Application.
   */
  destroy(): void {
    this.destroyed = true;
    this.initComplete = false;

    // If init() hasn't finished yet, wait for it then destroy.
    // The init() method checks this.destroyed after await and will
    // skip scene graph setup, so we just need to destroy the app.
    if (this.initPromise) {
      const promise = this.initPromise;
      this.initPromise = null;
      promise.then(() => this.destroyInternal()).catch(() => this.destroyInternal());
      return;
    }

    this.destroyInternal();
  }

  /**
   * Internal destroy — actually tears down all Pixi resources.
   * Called either directly from destroy() or after init() completes.
   */
  private destroyInternal(): void {
    // Remove Pixi's canvas from the DOM BEFORE destroying the app
    // (app.destroy with removeView=true would do this, but we want
    // to be explicit since React might re-use the container).
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }

    // IMPORTANT: Destroy the app FIRST with children: true.
    // This lets Pixi tear down Text objects, textures, and the GL context
    // in the correct order (Text.destroy needs the renderer's texture pool).
    // Do NOT manually destroy line containers before app.destroy — that
    // causes "Cannot read properties of null" crashes in the texture pool.
    if (this.app) {
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // Pixi may throw if the app was partially initialized
        // (e.g. WebGL context lost). Safe to ignore on teardown.
      }
      this.app = null;
    }

    // Clear our references (the objects are already destroyed by app.destroy)
    this.lineContainers = [];
    this.textureManager.destroy();

    if (this.illustrationTexture) {
      // Texture may already be destroyed by app.destroy, but destroy(false)
      // is safe to call and just clears internal references.
      try { this.illustrationTexture.destroy(false); } catch { /* already gone */ }
      this.illustrationTexture = null;
    }

    this.canvas = null;
    this.backgroundLayer = null;
    this.lineLayer = null;
    this.hitEffectLayer = null;
    this.hudLayer = null;
    this.illustrationSprite = null;
    this.dimOverlay = null;
    this.lastIllustrationImage = null;
  }
}

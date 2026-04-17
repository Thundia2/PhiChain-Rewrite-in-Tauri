// ============================================================
// Game Preview Component
//
// Recent change (bug audit #6): Hardened line-texture async loading.
//   - img.onerror now revokes the blob URL and drops the bookkeeping
//     entry so malformed textures don't leak their URLs forever.
//   - img.onload is guarded by a cancellation flag that flips on
//     effect cleanup, preventing a late-firing onload from calling
//     loadLineTexture() on a disposed Pixi app or stale renderer.
//
// A live canvas preview of the chart. Reads from all stores
// and renders each frame using the GameRenderer.
//
// Features:
//   - Canvas sizing (fills the panel, DPR-aware)
//   - Animation loop via requestAnimationFrame
//   - Hit effect lifecycle management
//   - Passes selection, FC/AP, multi-highlight, HUD options
// ============================================================

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { GameRenderer } from "../../canvas/gameRenderer";
// PAUSED / ON HOLD — GPU renderer, feature-flagged behind usePixiRenderer (default: false)
import { PixiGameRenderer } from "../../canvas/pixi";
import { HitEffectManager } from "../../canvas/hitEffects";
import { PostProcessPipeline } from "../../canvas/postProcess";
import { VideoBackgroundManager } from "../../canvas/videoBackground";
import { HitSoundManager } from "../../audio/hitSoundManager";
import { BpmList } from "../../utils/bpmList";

export function GamePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // Canvas 2D overlay for hit effects (Pixi mode)
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const pixiRendererRef = useRef<PixiGameRenderer | null>(null);
  const usePixiRef = useRef(false); // Tracks which renderer is active
  const hitEffectRef = useRef(new HitEffectManager());
  const postProcessRef = useRef<PostProcessPipeline>(new PostProcessPipeline());
  const videoBackgroundRef = useRef<VideoBackgroundManager>(new VideoBackgroundManager());
  const hitSoundRef = useRef<HitSoundManager>(new HitSoundManager());
  const lastRespackIdRef = useRef<string | null>(null);
  const loadedTexturesRef = useRef<Set<string>>(new Set());
  const textureUrlsRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number>(0);
  const wasPlayingRef = useRef(false);
  // Tracks the raw bpm_list reference to detect changes inside the render loop
  const bpmListDataRef = useRef<unknown>(null);

  const chart = useChartStore((s) => s.chart);
  const isLoaded = useChartStore((s) => s.isLoaded);

  // Build BpmList (memoized on bpm_list reference)
  const bpmList = useMemo(() => new BpmList(chart.bpm_list), [chart.bpm_list]);
  const bpmListRef = useRef<BpmList | null>(null);
  if (bpmListRef.current == null) {
    bpmListRef.current = bpmList;
  }
  useEffect(() => { bpmListRef.current = bpmList; }, [bpmList]);

  // ---- Canvas sizing ----
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  // ---- Initialize renderer and start animation loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if GPU renderer is enabled
    const ss = useSettingsStore.getState();
    usePixiRef.current = ss.usePixiRenderer;

    if (ss.usePixiRenderer) {
      // Initialize PixiJS GPU renderer — pass the container div, not the canvas.
      // Pixi creates its own canvas to avoid WebGL context corruption on
      // React Strict Mode double-mounts.
      const pixi = new PixiGameRenderer();
      pixiRendererRef.current = pixi;
      rendererRef.current = null; // Don't use Canvas 2D renderer

      const containerEl = containerRef.current;
      if (!containerEl) return;
      pixi.init(containerEl);
    } else {
      // Initialize Canvas 2D renderer (original path)
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      rendererRef.current = new GameRenderer(ctx);
      pixiRendererRef.current = null;
      resizeCanvas();
    }

    // Initialize WebGL post-processing overlay
    const glCanvas = glCanvasRef.current;
    if (glCanvas) {
      postProcessRef.current.initialize(glCanvas);
    }

    // Initialize hit sound manager
    hitSoundRef.current.initialize();
    hitEffectRef.current.setHitSoundCallback((kind) => {
      hitSoundRef.current.play(kind);
    });

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container) {
      observer = new ResizeObserver(() => {
        if (usePixiRef.current && pixiRendererRef.current) {
          const rect = container.getBoundingClientRect();
          pixiRendererRef.current.resize(rect.width, rect.height);
        } else {
          resizeCanvas();
        }
      });
      observer.observe(container);
    }

    // Capture ref values for cleanup (they may change before cleanup runs)
    const postProcess = postProcessRef.current;
    const videoBackground = videoBackgroundRef.current;
    const hitSound = hitSoundRef.current;
    const textureUrls = textureUrlsRef.current;
    const loadedTextures = loadedTexturesRef.current;
    const pixiRenderer = pixiRendererRef.current;

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(rafRef.current);
      postProcess.dispose();
      videoBackground.unload();
      hitSound.dispose();
      pixiRenderer?.destroy();
      // Revoke texture object URLs
      for (const url of textureUrls.values()) {
        URL.revokeObjectURL(url);
      }
      textureUrls.clear();
      loadedTextures.clear();
    };
  }, [resizeCanvas]);

  // ---- Render loop ----
  useEffect(() => {
    // At least one renderer must be available
    if (!rendererRef.current && !pixiRendererRef.current) return;

    // Bug audit #6: cancellation flag for async texture loads.
    // When the component unmounts (or re-runs this effect), any
    // in-flight Image decode must NOT call into the renderer — by
    // that point the renderer may be a destroyed Pixi app, and
    // calling loadLineTexture() on it throws a WebGL error.
    let cancelled = false;

    function frame() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const renderer = rendererRef.current;
      const pixiRenderer = pixiRendererRef.current;
      if (!canvas || !container || (!renderer && !pixiRenderer)) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Get latest store values
      const cs = useChartStore.getState();
      const as_ = useAudioStore.getState();
      const { currentTime: latestTime, isPlaying } = as_;
      const es = useEditorStore.getState();
      const ss = useSettingsStore.getState();
      const rs = useRespackStore.getState();
      const activeRespack = rs.getActiveRespack();

      // Update hit sound settings
      hitSoundRef.current.setEnabled(ss.hitSoundEnabled);
      hitSoundRef.current.setVolume(ss.hitSoundVolume);

      // Load custom sounds from respack when it changes
      const currentRespackId = activeRespack?.id ?? null;
      if (currentRespackId !== lastRespackIdRef.current) {
        lastRespackIdRef.current = currentRespackId;
        hitSoundRef.current.clearCustomSounds();
        if (activeRespack?.sounds) {
          const { sounds } = activeRespack;
          if (sounds.tap) hitSoundRef.current.loadCustomSound("tap", sounds.tap);
          if (sounds.drag) hitSoundRef.current.loadCustomSound("drag", sounds.drag);
          if (sounds.flick) hitSoundRef.current.loadCustomSound("flick", sounds.flick);
          if (sounds.ending) hitSoundRef.current.loadEndingSound(sounds.ending);
        }
      }

      // Reset hit effects on seek/stop
      if (wasPlayingRef.current && !isPlaying) {
        hitEffectRef.current.reset();
        pixiRendererRef.current?.resetHitEffects();
      }
      if (!wasPlayingRef.current && isPlaying) {
        hitEffectRef.current.reset();
        pixiRendererRef.current?.resetHitEffects();
        es.resetFcValid();
      }
      wasPlayingRef.current = isPlaying;

      // Update hit effect config from respack (both Canvas 2D manager and Pixi layer)
      if (activeRespack?.textures.hitFx && activeRespack.config.hitFx) {
        const hitEffectConfig = {
          spriteSheet: activeRespack.textures.hitFx,
          cols: activeRespack.config.hitFx[0],
          rows: activeRespack.config.hitFx[1],
          duration: activeRespack.config.hitFxDuration ?? 0.5,
          scale: activeRespack.config.hitFxScale ?? 1.0,
          rotate: activeRespack.config.hitFxRotate ?? false,
          hideParticles: activeRespack.config.hideParticles ?? false,
          tinted: activeRespack.config.hitFxTinted ?? true,
        };
        hitEffectRef.current.setConfig(hitEffectConfig);
        pixiRendererRef.current?.setHitEffectConfig(hitEffectConfig);
      } else {
        hitEffectRef.current.setConfig(null);
        pixiRendererRef.current?.setHitEffectConfig(null);
      }

      // Load line textures into the active renderer's cache.
      //
      // Bug audit #6: defensive async loading.
      //   - onload: check the `cancelled` flag and re-resolve the active
      //     renderer at callback time (the captured one may be stale).
      //   - onerror: revoke the URL and undo the bookkeeping so a
      //     malformed texture can be retried on the next frame instead
      //     of being silently stuck with a leaked URL.
      const activeRenderer = renderer || pixiRenderer;
      const lineTextures = cs.lineTextures;
      for (const [texName, texBlob] of lineTextures) {
        if (!loadedTexturesRef.current.has(texName) && activeRenderer && !activeRenderer.hasLineTexture(texName)) {
          loadedTexturesRef.current.add(texName);
          const url = URL.createObjectURL(texBlob);
          textureUrlsRef.current.set(texName, url);
          const img = new Image();
          img.onload = () => {
            if (cancelled) return;
            // Re-resolve the renderer at callback time — the one we
            // captured in `activeRenderer` may have been replaced.
            const r = rendererRef.current || pixiRendererRef.current;
            if (!r) return;
            try {
              r.loadLineTexture(texName, img);
            } catch (err) {
              // Renderer was destroyed between our guards and this call,
              // or the texture is malformed. Don't bring down the frame loop.
              console.warn(`Failed to load line texture "${texName}":`, err);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            textureUrlsRef.current.delete(texName);
            loadedTexturesRef.current.delete(texName);
          };
          img.src = url;
        }
      }

      // Rebuild BpmList if changed
      if (bpmListDataRef.current !== cs.chart.bpm_list) {
        bpmListDataRef.current = cs.chart.bpm_list;
        bpmListRef.current = new BpmList(cs.chart.bpm_list);
      }
      const bpmList = bpmListRef.current!;

      // Audio latency compensation: shift game preview visuals so notes
      // align with what the user actually hears through their hardware.
      const effectiveOffset = cs.chart.offset + ss.audioLatencyMs / 1000;

      // Compute current beat for shader effects
      const currentBeat = bpmList.beatAtFloat(latestTime - effectiveOffset);

      // Draw video background if configured (Canvas 2D mode only —
      // Pixi mode handles video via texture in a future phase)
      const extraConfig = cs.extraConfig;
      if (!pixiRenderer && extraConfig.videos && extraConfig.videos.length > 0) {
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          const dpr = window.devicePixelRatio || 1;
          videoBackgroundRef.current.sync(currentBeat, latestTime - effectiveOffset, isPlaying);
          videoBackgroundRef.current.draw(ctx2d, rect.width * dpr, rect.height * dpr, currentBeat);
        }
      }

      // Render options shared by both renderers
      const renderOptions = {
        noteSize: ss.noteSize,
        backgroundDim: ss.backgroundDim,
        illustrationImage: cs.illustrationImage,
        selectedLineIndex: es.selectedLineIndex,
        selectedNoteIndices: es.selectedNoteIndices,
        showFcApIndicator: ss.showFcApIndicator,
        isFcValid: es.isFcValid,
        multiHighlight: ss.multiHighlight,
        anchorMarkerVisibility: ss.anchorMarkerVisibility,
        showHud: ss.showHud,
        chartName: cs.meta.name,
        chartLevel: cs.meta.level,
        hitEffectManager: hitEffectRef.current,
        isPlaying,
        showHitEffects: ss.showHitEffects,
        pendingNote: es.pendingNote,
        pendingLineIndex: es.selectedLineIndex,
        respack: activeRespack,
        chartFontFamily: cs.chartFontFamily,
      };

      if (pixiRenderer && pixiRenderer.initialized) {
        // GPU renderer path
        pixiRenderer.render(
          cs.chart.lines, bpmList, latestTime, effectiveOffset,
          rect.width, rect.height, renderOptions,
        );

        // Hit effects are rendered on a Canvas 2D overlay in Pixi mode
        const overlayCanvas = overlayCanvasRef.current;
        if (overlayCanvas && isPlaying && ss.showHitEffects) {
          const dpr = window.devicePixelRatio || 1;
          overlayCanvas.width = rect.width * dpr;
          overlayCanvas.height = rect.height * dpr;
          overlayCanvas.style.width = `${rect.width}px`;
          overlayCanvas.style.height = `${rect.height}px`;
          const overlayCtx = overlayCanvas.getContext("2d");
          if (overlayCtx) {
            overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            overlayCtx.clearRect(0, 0, rect.width, rect.height);
            hitEffectRef.current.render(overlayCtx, latestTime - effectiveOffset);
          }
        }
      } else if (renderer) {
        // Canvas 2D renderer path (original)
        renderer.render(
          cs.chart.lines, bpmList, latestTime, effectiveOffset,
          rect.width, rect.height, renderOptions,
        );
      }

      // Apply post-processing shader effects
      if (pixiRenderer && pixiRenderer.initialized) {
        // Pixi mode: apply effects as stage filters (single WebGL context)
        pixiRenderer.applyShaderEffects(extraConfig.effects, currentBeat, latestTime, rect.width, rect.height);
      } else if (extraConfig.effects && extraConfig.effects.length > 0 && postProcessRef.current.initialized) {
        // Canvas 2D mode: use separate WebGL overlay
        postProcessRef.current.render(canvas, extraConfig.effects, currentBeat, latestTime);
        const glCanvas = glCanvasRef.current;
        if (glCanvas) {
          glCanvas.style.display = postProcessRef.current.active ? "block" : "none";
        }
      } else {
        const glCanvas = glCanvasRef.current;
        if (glCanvas) glCanvas.style.display = "none";
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      // Bug audit #6: flip the cancellation flag so any in-flight
      // Image decodes don't touch the renderer after unmount.
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // Empty deps — loop reads from stores directly

  // ---- Click to select line ----
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const activeRenderer = rendererRef.current || pixiRendererRef.current;
    if (!canvas || !container || !activeRenderer) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cs = useChartStore.getState();
    const { currentTime } = useAudioStore.getState();
    const bpmList = bpmListRef.current;
    if (!bpmList) return;

    // Use effectiveOffset so click-to-select matches the latency-shifted visuals
    const effectiveOffset = cs.chart.offset + useSettingsStore.getState().audioLatencyMs / 1000;
    const currentBeat = bpmList.beatAtFloat(currentTime - effectiveOffset);
    const hitIndex = activeRenderer.hitTestLine(
      cs.chart.lines, currentBeat, clickX, clickY, rect.width, rect.height,
    );

    if (hitIndex !== null) {
      useEditorStore.getState().selectLine(hitIndex);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: "#000" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onClick={handleClick}
      />
      {/* Canvas 2D overlay for hit effects when using Pixi renderer */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 pointer-events-none"
      />
      {/* WebGL overlay canvas for post-processing shader effects */}
      <canvas
        ref={glCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "none" }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            No chart loaded
          </span>
        </div>
      )}
    </div>
  );
}

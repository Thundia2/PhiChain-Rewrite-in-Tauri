// ============================================================
// Game Preview Component
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

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { GameRenderer } from "../../canvas/gameRenderer";
import { HitEffectManager } from "../../canvas/hitEffects";
import { PostProcessPipeline } from "../../canvas/postProcess";
import { VideoBackgroundManager } from "../../canvas/videoBackground";
import { HitSoundManager } from "../../audio/hitSoundManager";
import { BpmList } from "../../utils/bpmList";

export function GamePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const hitEffectRef = useRef(new HitEffectManager());
  const postProcessRef = useRef<PostProcessPipeline>(new PostProcessPipeline());
  const videoBackgroundRef = useRef<VideoBackgroundManager>(new VideoBackgroundManager());
  const hitSoundRef = useRef<HitSoundManager>(new HitSoundManager());
  const lastRespackIdRef = useRef<string | null>(null);
  const loadedTexturesRef = useRef<Set<string>>(new Set());
  const textureUrlsRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number>(0);
  const wasPlayingRef = useRef(false);

  const chart = useChartStore((s) => s.chart);
  const isLoaded = useChartStore((s) => s.isLoaded);

  // Build BpmList (memoized on bpm_list reference)
  const bpmListRef = useRef<BpmList | null>(null);
  const bpmListDataRef = useRef(chart.bpm_list);
  if (bpmListDataRef.current !== chart.bpm_list) {
    bpmListDataRef.current = chart.bpm_list;
    bpmListRef.current = new BpmList(chart.bpm_list);
  }
  if (!bpmListRef.current) {
    bpmListRef.current = new BpmList(chart.bpm_list);
  }

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

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rendererRef.current = new GameRenderer(ctx);
    resizeCanvas();

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
        resizeCanvas();
      });
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(rafRef.current);
      postProcessRef.current.dispose();
      videoBackgroundRef.current.unload();
      hitSoundRef.current.dispose();
      // Revoke texture object URLs
      for (const url of textureUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      textureUrlsRef.current.clear();
      loadedTexturesRef.current.clear();
    };
  }, [resizeCanvas]);

  // ---- Render loop ----
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    function frame() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !renderer) return;

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
      }
      if (!wasPlayingRef.current && isPlaying) {
        hitEffectRef.current.reset();
        es.resetFcValid();
      }
      wasPlayingRef.current = isPlaying;

      // Update hit effect config from respack
      if (activeRespack?.textures.hitFx && activeRespack.config.hitFx) {
        hitEffectRef.current.setConfig({
          spriteSheet: activeRespack.textures.hitFx,
          cols: activeRespack.config.hitFx[0],
          rows: activeRespack.config.hitFx[1],
          duration: activeRespack.config.hitFxDuration ?? 0.5,
          scale: activeRespack.config.hitFxScale ?? 1.0,
          rotate: activeRespack.config.hitFxRotate ?? false,
          hideParticles: activeRespack.config.hideParticles ?? false,
          tinted: activeRespack.config.hitFxTinted ?? true,
        });
      } else {
        hitEffectRef.current.setConfig(null);
      }

      // Load line textures into the renderer cache
      const lineTextures = cs.lineTextures;
      for (const [texName, texBlob] of lineTextures) {
        if (!loadedTexturesRef.current.has(texName) && !renderer.hasLineTexture(texName)) {
          loadedTexturesRef.current.add(texName);
          const url = URL.createObjectURL(texBlob);
          textureUrlsRef.current.set(texName, url);
          const img = new Image();
          img.onload = () => {
            renderer.loadLineTexture(texName, img);
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

      // Compute current beat for shader effects
      const currentBeat = bpmList.beatAtFloat(latestTime - cs.chart.offset);

      // Draw video background if configured
      const extraConfig = cs.extraConfig;
      if (extraConfig.videos && extraConfig.videos.length > 0) {
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          const dpr = window.devicePixelRatio || 1;
          videoBackgroundRef.current.sync(currentBeat, latestTime - cs.chart.offset, isPlaying);
          videoBackgroundRef.current.draw(ctx2d, rect.width * dpr, rect.height * dpr, currentBeat);
        }
      }

      renderer.render(
        cs.chart.lines,
        bpmList,
        latestTime,
        cs.chart.offset,
        rect.width,
        rect.height,
        {
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
        },
      );

      // Apply post-processing shader effects
      if (extraConfig.effects && extraConfig.effects.length > 0 && postProcessRef.current.initialized) {
        postProcessRef.current.render(canvas, extraConfig.effects, currentBeat, latestTime);
        // Show/hide GL canvas based on whether effects are active
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
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // Empty deps — loop reads from stores directly

  // ---- Click to select line ----
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !container || !renderer) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cs = useChartStore.getState();
    const { currentTime } = useAudioStore.getState();
    const bpmList = bpmListRef.current;
    if (!bpmList) return;

    const currentBeat = bpmList.beatAtFloat(currentTime - cs.chart.offset);
    const hitIndex = renderer.hitTestLine(
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

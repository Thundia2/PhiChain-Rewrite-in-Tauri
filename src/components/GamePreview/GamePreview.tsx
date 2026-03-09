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
import { BpmList } from "../../utils/bpmList";

export function GamePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const hitEffectRef = useRef(new HitEffectManager());
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
      const { currentTime: latestTime, isPlaying } = useAudioStore.getState();
      const es = useEditorStore.getState();
      const ss = useSettingsStore.getState();
      const rs = useRespackStore.getState();
      const activeRespack = rs.getActiveRespack();

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
        });
      } else {
        hitEffectRef.current.setConfig(null);
      }

      // Rebuild BpmList if changed
      if (bpmListDataRef.current !== cs.chart.bpm_list) {
        bpmListDataRef.current = cs.chart.bpm_list;
        bpmListRef.current = new BpmList(cs.chart.bpm_list);
      }
      const bpmList = bpmListRef.current!;

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
          showHitEffects: true,
          pendingNote: es.pendingNote,
          pendingLineIndex: es.selectedLineIndex,
          respack: activeRespack,
        },
      );

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

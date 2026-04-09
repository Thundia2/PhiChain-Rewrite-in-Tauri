// ============================================================
// Unified Canvas — Interactive Game Preview
//
// Recent change: Added effectiveOffset (chart.offset + audioLatencyMs)
// to 5 game preview rendering sites for audio latency compensation.
// Editor interaction paths (getCurrentBeat, click/drag/selection)
// remain on raw chart.offset.
//
// The main editing surface for the unified editor. Renders the
// game preview using the augmented GameRenderer (with RenderResult)
// and handles all mouse interaction: line/note selection, handle
// dragging, note placement, viewport zoom/pan.
//
// Overlay drawing is delegated to CanvasOverlays.ts (pure
// drawing functions). Drag state management lives in
// CanvasInteraction.ts. Coordinate math in NoteProjection.ts.
//
// Recent change: Extracted 12 mouse handler functions to
// CanvasMouseHandlers.ts (6.1 refactor) — handle drag, step
// record, pattern commit, note placement, note hit, bookmark
// hit, eraser, record capture, ghost note computations.
// ============================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { useGroupStore } from "../../stores/groupStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { GameRenderer, type RenderResult, type RenderedLineInfo } from "../../canvas/gameRenderer";
import { HitEffectManager } from "../../canvas/hitEffects";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat, floatToBeat, CANVAS_WIDTH } from "../../types/chart";
import { getXSnapPositions } from "../../utils/xSnap";

// Interaction modules
import {
  drawLineHandles,
  drawDragGhostLine,
  drawRotationSnapGuides,
  drawSelectionRect,
  hitTestTranslateHandle,
  hitTestRotationHandle,
  hitTestLineBody,
  drawBookmarkOverlay,
  drawPatternGhostNotes,
  drawXSnapGrid,
  drawLinePathPreview,
  drawRecordModeIndicator,
  drawStepRecordStatus,
  drawCursorHUD,
  drawGhostBeatLabel,
  drawBeatGrid,
  drawEraserPendingMarks,
  drawEraserCountIndicator,
} from "./CanvasOverlays";
import {
  type DragState,
  type TranslateDragState,
  type RotateDragState,
  type HoldPlacementDragState,
  type HoldResizeDragState,
  type EraserDragState,
  updateTranslateDrag,
  finishTranslateDrag,
  updateRotateDrag,
  finishRotateDrag,
  startPanDrag,
  computePanOffset,
  startDragSelect,
  updateDragSelect,
  startNoteDrag,
  updateNoteDrag,
  finishNoteDrag,
  getCursorForPosition,
} from "./CanvasInteraction";
import {
  screenToLineLocal,
  beatFromScreenDistance,
} from "./NoteProjection";
import { CanvasContextMenu } from "./CanvasContextMenu";
import {
  isPlaceTool,
  tryHandleDrag,
  tryStepRecordPlace,
  tryPatternCommit,
  tryNotePlacement,
  tryNoteHit,
  tryBookmarkHit,
  startEraserDrag,
  updateEraserDrag,
  captureRecordKeyframe,
  handleStepRecordStream,
  computeStepRecordGhost,
  computePatternGhosts,
  computePlacementGhost,
} from "./CanvasMouseHandlers";

export function UnifiedCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const hitEffectRef = useRef(new HitEffectManager());
  const rafRef = useRef<number>(0);
  const wasPlayingRef = useRef(false);
  const lastRenderResultRef = useRef<RenderResult | null>(null);
  const dragRef = useRef<DragState>(null);
  const hiddenSetRef = useRef<Set<number>>(new Set());
  const hiddenVisRef = useRef<Record<number, boolean>>({});
  const spaceDownRef = useRef(false);
  // Raw cursor position in screen pixels (for screen-space overlays like ghost beat label)
  const rawCursorRef = useRef<{ x: number; y: number } | null>(null);

  const isLoaded = useChartStore((s) => s.isLoaded);

  // Context menu state for quick event creation
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number; y: number;
    canvasX: number; canvasY: number;
    beat: number; lineIndex: number;
  } | null>(null);

  // Build BpmList (memoized on bpm_list reference)
  const chart = useChartStore((s) => s.chart);
  const bpmListRef = useRef<BpmList | null>(null);
  // Mouse position in canvas coordinates for HUD display
  const cursorInfoRef = useRef<{ canvasX: number; canvasY: number; beat: number } | null>(null);
  const bpmListDataRef = useRef(chart.bpm_list);
  /* eslint-disable react-hooks/refs -- intentional derived-value memoization via ref */
  if (bpmListDataRef.current !== chart.bpm_list) {
    bpmListDataRef.current = chart.bpm_list;
    bpmListRef.current = new BpmList(chart.bpm_list);
  }
  if (bpmListRef.current == null) {
    bpmListRef.current = new BpmList(chart.bpm_list);
  }
  /* eslint-enable react-hooks/refs */

  // ---- Get current beat ----
  const getCurrentBeat = useCallback((): number => {
    const { currentTime } = useAudioStore.getState();
    const cs = useChartStore.getState();
    const bpmList = bpmListRef.current;
    if (!bpmList) return 0;
    return bpmList.beatAtFloat(currentTime - cs.chart.offset);
  }, []);

  // ---- Get current time (offset-adjusted) ----
  const getCurrentTime = useCallback((): number => {
    const { currentTime } = useAudioStore.getState();
    const cs = useChartStore.getState();
    return currentTime - cs.chart.offset;
  }, []);

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
          tinted: activeRespack.config.hitFxTinted ?? true,
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

      // Compute hidden lines from visibility toggles (cached, only rebuild when ref changes)
      const vis = es.lineVisibility;
      if (vis !== hiddenVisRef.current) {
        hiddenVisRef.current = vis;
        hiddenSetRef.current = new Set(
          Object.entries(vis).filter(([, v]) => v === false).map(([k]) => Number(k))
        );
      }
      const hiddenLineIndices = hiddenSetRef.current;

      // ---- Load line textures into renderer cache ----
      for (const line of cs.chart.lines) {
        if (line.texture && !renderer.hasLineTexture(line.texture)) {
          const blob = cs.lineTextures.get(line.texture);
          if (blob) {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
              renderer.loadLineTexture(line.texture!, img);
              URL.revokeObjectURL(url);
            };
            img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
          }
        }
      }

      // ---- Apply viewport transform ----
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const vp = es.canvasViewport;

      if (ctx) {
        // Clear entire canvas in identity space first
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Apply DPR + viewport transform for all rendering
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(vp.offsetX, vp.offsetY);
        ctx.scale(vp.zoom, vp.zoom);
      }

      // Audio latency compensation for game preview visuals only.
      // Editor interaction helpers (getCurrentBeat/getCurrentTime) stay on raw chart.offset.
      const effectiveOffset = cs.chart.offset + ss.audioLatencyMs / 1000;

      // Render and capture result for hit-testing
      const renderResult = renderer.render(
        cs.chart.lines,
        bpmList,
        latestTime,
        effectiveOffset,
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
          hiddenLineIndices: hiddenLineIndices.size > 0 ? hiddenLineIndices : null,
          multiSelectedLineIndices: es.multiSelectedLineIndices.length > 0 ? new Set(es.multiSelectedLineIndices) : null,
          chartFontFamily: cs.chartFontFamily,
          // Group editing mode
          ...(() => {
            const gs = useGroupStore.getState();
            const activeGroup = gs.getActiveGroup();
            if (!activeGroup || activeGroup.type !== "line") return {};
            const memberIndices = new Set(activeGroup.lines.map((l: { lineIndex: number }) => l.lineIndex));
            return {
              groupMemberLineIndices: memberIndices,
              groupDimFactor: gs.groupEditMode.hideOthers ? 0 : 0.15,
              groupHideOthers: gs.groupEditMode.hideOthers,
              groupSimplifiedCanvas: gs.groupEditMode.simplifiedCanvas,
            };
          })(),
        },
      );

      // Store render result for click hit-testing
      lastRenderResultRef.current = renderResult;

      // ---- Draw overlays on top of game render (same viewport transform) ----
      if (ctx) {
        // Draw handles on the selected line
        if (es.selectedLineIndex !== null) {
          const selectedLineInfo = renderResult.lines.find(
            (l) => l.lineIndex === es.selectedLineIndex,
          );
          if (selectedLineInfo) {
            const drag = dragRef.current;

            // Draw rotation snap guides during rotation drag
            if (drag?.type === "rotate") {
              const snapDeg = ss.rotationSnapDegrees;
              if (snapDeg > 0) {
                drawRotationSnapGuides(
                  ctx,
                  selectedLineInfo.screenX,
                  selectedLineInfo.screenY,
                  rect.width,
                  snapDeg,
                );
              }
            }

            // Draw drag ghost line during translate or rotate drag
            if (drag?.type === "translate") {
              const td = drag as TranslateDragState;
              const ghostRotRad = -(td.startRotationDeg * Math.PI) / 180;
              drawDragGhostLine(
                ctx,
                td.currentCanvasX,
                td.currentCanvasY,
                ghostRotRad,
                rect.width,
                rect.height,
              );
            } else if (drag?.type === "rotate") {
              const rd = drag as RotateDragState;
              // currentRotationDeg is in Phigros space; negate to get screen rotation
              // (matching the renderer's ctx.rotate(-state.rotation) convention)
              const ghostRotRad = -(rd.currentRotationDeg * Math.PI) / 180;
              drawDragGhostLine(
                ctx,
                rd.startCanvasX,
                rd.startCanvasY,
                ghostRotRad,
                rect.width,
                rect.height,
              );
            }

            // Draw handles
            drawLineHandles(ctx, selectedLineInfo, rect.width);
          }
        }

        // ---- Bookmark diamond markers ----
        const bs = useBookmarkStore.getState();
        if (bs.bookmarks.length > 0) {
          const bmCurrentBeat = bpmList.beatAtFloat(latestTime - effectiveOffset);
          drawBookmarkOverlay(
            ctx, bs.bookmarks, bmCurrentBeat, bs.visibilityRange,
            bs.selectedBookmarkIds, renderResult.lines, rect.width,
          );
        }

        // ---- Pattern ghost note preview ----
        if (es.activeTool === "place_pattern" && es.patternGhostNotes.length > 0 && es.selectedLineIndex !== null) {
          const patternLineInfo = renderResult.lines.find(
            (l) => l.lineIndex === es.selectedLineIndex,
          );
          if (patternLineInfo) {
            drawPatternGhostNotes(ctx, es.patternGhostNotes, patternLineInfo, rect.width);
          }
        }

        // ---- X snap grid (with active lane highlight) ----
        if (es.xSnapEnabled && es.lanes > 0 && es.selectedLineIndex !== null) {
          const snapLineInfo = renderResult.lines.find(
            (l) => l.lineIndex === es.selectedLineIndex,
          );
          if (snapLineInfo) {
            drawXSnapGrid(
              ctx, getXSnapPositions(es.lanes), snapLineInfo, rect.width,
              es.pendingNote?.x ?? null, // Highlight the lane the ghost note is on
            );
          }
        }

        // ---- Beat grid perpendicular lines ----
        if (ss.showBeatGrid && es.selectedLineIndex !== null) {
          const beatGridLine = cs.chart.lines[es.selectedLineIndex];
          const beatGridLineInfo = renderResult.lines.find(
            (l) => l.lineIndex === es.selectedLineIndex,
          );
          if (beatGridLine && beatGridLineInfo && bpmListRef.current) {
            const bgCurrentBeat = bpmList.beatAtFloat(latestTime - effectiveOffset);
            drawBeatGrid(
              ctx,
              beatGridLineInfo,
              beatGridLine,
              bpmListRef.current,
              latestTime - effectiveOffset,
              bgCurrentBeat,
              es.density,
              ss.beatGridBeatsAhead,
              rect.width,
              rect.height,
            );
          }
        }

        // ---- Line path preview ----
        if (ss.showLinePath && es.selectedLineIndex !== null) {
          const line = cs.chart.lines[es.selectedLineIndex];
          if (line) {
            const currentBeat = bpmList.beatAtFloat(latestTime - effectiveOffset);
            drawLinePathPreview(
              ctx, line.events, line.event_layers, currentBeat,
              ss.linePathBeatsAhead ?? 8, ss.linePathBeatsBehind ?? 4,
              ss.linePathSampleInterval ?? 0.5, rect.width, rect.height,
            );
          }
        }

        // ---- Record mode indicator (screen-space) ----
        if (es.recordMode) {
          drawRecordModeIndicator(ctx, dpr, rect.width, rect.height);
        }

        // ---- Step record status (screen-space) ----
        if (es.stepRecordActive) {
          drawStepRecordStatus(
            ctx, es.stepRecordNoteKind, es.stepRecordStepSize,
            es.stepRecordCurrentBeat, es.density, es.stepRecordNotesPlaced,
            es.recordMode ? 36 : 20, dpr,
          );
        }

        // ---- Cursor coordinate HUD (screen-space) ----
        if (cursorInfoRef.current) {
          const ci = cursorInfoRef.current;
          drawCursorHUD(ctx, ci.canvasX, ci.canvasY, ci.beat, dpr, canvas.height / dpr);
        }

        // ---- Ghost beat label (screen-space, near cursor) ----
        // Shows the snapped beat + note kind icon when placing a note
        if (es.pendingNote && rawCursorRef.current) {
          drawGhostBeatLabel(
            ctx,
            es.pendingNote.beat,
            es.pendingNote.kind,
            rawCursorRef.current.x,
            rawCursorRef.current.y,
            dpr,
          );
        }

        // ---- Drag selection rectangle (viewport-space) ----
        if (dragRef.current?.type === "drag_select") {
          const ds = dragRef.current;
          drawSelectionRect(ctx, ds.startX, ds.startY, ds.currentX, ds.currentY);
        }

        // ---- Eraser drag pending marks (red X on hit notes + count indicator) ----
        if (dragRef.current?.type === "eraser_drag") {
          const eraserInfo = getSelectedLineInfo();
          if (eraserInfo) {
            drawEraserPendingMarks(
              ctx,
              (dragRef.current as EraserDragState).hitNoteIndices,
              eraserInfo,
            );
            // Floating "Erasing N" counter near cursor (screen-space)
            if (rawCursorRef.current) {
              drawEraserCountIndicator(
                ctx,
                (dragRef.current as EraserDragState).hitNoteIndices.size,
                rawCursorRef.current.x,
                rawCursorRef.current.y,
                dpr,
              );
            }
          }
        }

        ctx.restore(); // Restore from viewport transform
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // Empty deps — loop reads from stores directly

  // ---- Helper: Get selected line's render info ----
  const getSelectedLineInfo = useCallback((): RenderedLineInfo | null => {
    const es = useEditorStore.getState();
    const rr = lastRenderResultRef.current;
    if (!rr || es.selectedLineIndex === null) return null;
    return rr.lines.find((l) => l.lineIndex === es.selectedLineIndex) ?? null;
  }, []);

  // ---- Mouse Down Handler ----
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !container || !renderer) return;

    const rect = container.getBoundingClientRect();
    const rawMouseX = e.clientX - rect.left;
    const rawMouseY = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();

    // Convert to logical (viewport-adjusted) coordinates for hit-testing
    const vp = es.canvasViewport;
    const mouseX = (rawMouseX - vp.offsetX) / vp.zoom;
    const mouseY = (rawMouseY - vp.offsetY) / vp.zoom;

    // ---- Pan mode: middle mouse or space+drag (uses RAW screen coords) ----
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      const viewport = es.canvasViewport;
      dragRef.current = startPanDrag(rawMouseX, rawMouseY, viewport.offsetX, viewport.offsetY);
      es.setCanvasInteractionMode("panning");
      return;
    }

    // Only handle left click from here
    if (e.button !== 0) return;

    const selectedLineInfo = getSelectedLineInfo();

    // ---- Handle drag (rotation/translate) ----
    if (selectedLineInfo) {
      const chartLine = cs.chart.lines[selectedLineInfo.lineIndex];
      if (chartLine) {
        const handleResult = tryHandleDrag(
          mouseX, mouseY, selectedLineInfo, chartLine,
          getCurrentBeat(), rect.width,
        );
        if (handleResult) {
          dragRef.current = handleResult.drag;
          es.setCanvasInteractionMode(handleResult.interactionMode);
          return;
        }
      }
    }

    // ---- Step Recording Mode ----
    if (es.stepRecordActive && selectedLineInfo) {
      const stepResult = tryStepRecordPlace(
        mouseX, mouseY, selectedLineInfo,
        es.stepRecordNoteKind, es.stepRecordCurrentBeat, es.density,
        es.xSnapEnabled, es.lanes, rect.width,
      );
      if (stepResult) {
        cs.addNote(selectedLineInfo.lineIndex, stepResult.note);
        es.advanceStepBeat();
        es.setStepRecordMouseDown(true);
        es.setStepRecordLastSnapX(stepResult.snappedX);
        return;
      }
    }

    // ---- Pattern tool: commit ghost notes ----
    if (es.activeTool === "place_pattern" && es.patternGhostNotes.length > 0 && selectedLineInfo) {
      const notes = tryPatternCommit(es.patternGhostNotes, es.density);
      cs.batchAddNotes(selectedLineInfo.lineIndex, notes);
      es.setPatternGhostNotes([]);
      return;
    }

    // ---- Note placement (place tools: tap/drag/flick/hold) ----
    if (isPlaceTool(es.activeTool) && selectedLineInfo) {
      const line = cs.chart.lines[selectedLineInfo.lineIndex];
      const bpmList = bpmListRef.current;
      if (line && bpmList) {
        const placeResult = tryNotePlacement(
          mouseX, mouseY, selectedLineInfo, line,
          es.activeTool, bpmList, rect.width, rect.height,
          es.beatSyncPlacement, es.density, es.xSnapEnabled, es.lanes,
          getCurrentBeat(), getCurrentTime(),
        );
        if (placeResult) {
          cs.addNote(selectedLineInfo.lineIndex, placeResult.note);
          if (placeResult.needsHoldDrag) {
            const addedIdx = cs.chart.lines[selectedLineInfo.lineIndex].notes.length - 1;
            dragRef.current = {
              type: "hold_placement",
              lineIndex: selectedLineInfo.lineIndex,
              noteIndex: addedIdx,
              headBeat: placeResult.headBeat,
              above: placeResult.above,
            } as HoldPlacementDragState;
            es.setCanvasInteractionMode("placing_note");
          }
          return;
        }
      }
    }

    // ---- Note hit-testing (select tool) ----
    const renderResult = lastRenderResultRef.current;
    if (renderResult && es.activeTool === "select") {
      // Check notes on the selected line
      if (selectedLineInfo) {
        const line = cs.chart.lines[selectedLineInfo.lineIndex];
        const bpmList = bpmListRef.current;
        if (line && bpmList) {
          const noteAction = tryNoteHit(
            mouseX, mouseY, selectedLineInfo, line,
            es.selectedNoteIndices, bpmList, rect.width, rect.height,
            getCurrentBeat(), getCurrentTime(), e.ctrlKey || e.metaKey,
          );
          if (noteAction) {
            switch (noteAction.type) {
              case "start_note_drag":
                dragRef.current = startNoteDrag(
                  noteAction.lineIndex, noteAction.noteIndices, noteAction.notes,
                  noteAction.mouseX, noteAction.mouseY,
                  noteAction.lineScreenX, noteAction.lineScreenY, noteAction.lineRotation,
                  noteAction.canvasWidth, noteAction.canvasHeight,
                  noteAction.bpmAtCurrent, noteAction.currentSpeed,
                );
                es.setCanvasInteractionMode("dragging_translate");
                return;
              case "start_hold_resize":
                dragRef.current = {
                  type: "hold_resize",
                  lineIndex: noteAction.lineIndex,
                  noteIndex: noteAction.noteIndex,
                  headBeat: noteAction.headBeat,
                  above: noteAction.above,
                } as HoldResizeDragState;
                es.setCanvasInteractionMode("dragging_translate");
                return;
              case "select":
                es.setNoteSelection([noteAction.noteIndex]);
                es.showFloatingInspector(e.clientX, e.clientY, "note");
                return;
              case "toggle":
                es.toggleNoteSelection(noteAction.noteIndex);
                if (es.selectedNoteIndices.length > 1) {
                  es.showFloatingInspector(e.clientX, e.clientY, "multi_note");
                }
                return;
            }
          }
        }
      }

      // Check notes on other lines (stays inline — needs renderer)
      const noteHit = renderer.hitTestNote(mouseX, mouseY, renderResult);
      if (noteHit) {
        es.selectLine(noteHit.lineIndex);
        es.setNoteSelection([noteHit.noteIndex]);
        es.showFloatingInspector(e.clientX, e.clientY, "note");
        return;
      }

      // ---- Bookmark hit-testing ----
      const bsHit = useBookmarkStore.getState();
      if (bsHit.bookmarks.length > 0 && bpmListRef.current) {
        const curBeatHit = bpmListRef.current.beatAtFloat(
          useAudioStore.getState().currentTime - cs.chart.offset,
        );
        const hitId = tryBookmarkHit(
          mouseX, mouseY, bsHit.bookmarks, bsHit.visibilityRange,
          curBeatHit, renderResult.lines, rect.width,
        );
        if (hitId) {
          if (e.shiftKey) bsHit.toggleBookmarkSelection(hitId);
          else bsHit.selectBookmark(hitId);
          return;
        }
      }
    }

    // ---- Eraser tool: start drag erase ----
    // Starts a drag that accumulates hit notes — batch-deleted on mouseUp
    if (es.activeTool === "eraser" && selectedLineInfo) {
      const { drag: eraserDrag } = startEraserDrag(mouseX, mouseY, selectedLineInfo);
      dragRef.current = eraserDrag;
      es.setCanvasInteractionMode("drag_selecting"); // closest existing mode for non-idle drag cursor
      return;
    }

    // ---- Line hit-testing (falls through from above) ----
    const bpmList = bpmListRef.current;
    if (bpmList) {
      const { currentTime } = useAudioStore.getState();
      const currentBeat = bpmList.beatAtFloat(currentTime - cs.chart.offset);
      const hitIndex = renderer.hitTestLine(
        cs.chart.lines, currentBeat, mouseX, mouseY, rect.width, rect.height,
      );

      if (hitIndex !== null) {
        if (e.ctrlKey || e.metaKey) {
          es.toggleMultiSelectedLine(hitIndex);
        } else {
          es.selectLine(hitIndex);
        }
        return;
      }
    }

    // ---- Empty space with select tool → start drag selection ----
    if (es.activeTool === "select") {
      dragRef.current = startDragSelect(mouseX, mouseY);
      es.setCanvasInteractionMode("drag_selecting");
    }
  }, [getCurrentBeat, getCurrentTime, getSelectedLineInfo]);

  // ---- Mouse Move Handler ----
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const rawMouseX = e.clientX - rect.left;
    const rawMouseY = e.clientY - rect.top;
    // Store raw cursor position for screen-space overlays (ghost beat label, eraser count)
    rawCursorRef.current = { x: rawMouseX, y: rawMouseY };

    // Convert to logical (viewport-adjusted) coordinates
    const vp = useEditorStore.getState().canvasViewport;
    const mouseX = (rawMouseX - vp.offsetX) / vp.zoom;
    const mouseY = (rawMouseY - vp.offsetY) / vp.zoom;

    // Update cursor info for HUD coordinate display
    // Canvas space: X from -675 to +675, Y from -450 to +450
    const canvasX = (mouseX / rect.width - 0.5) * CANVAS_WIDTH;
    const canvasY = (0.5 - mouseY / rect.height) * (CANVAS_WIDTH * (900 / 1350));
    const cs = useChartStore.getState();
    const as_ = useAudioStore.getState();
    const curBeat = bpmListRef.current
      ? bpmListRef.current.beatAtFloat(Math.max(0, as_.currentTime - cs.chart.offset))
      : 0;
    cursorInfoRef.current = { canvasX, canvasY, beat: curBeat };

    const drag = dragRef.current;

    // ---- Active drag handling ----
    if (drag) {
      switch (drag.type) {
        case "translate": {
          dragRef.current = updateTranslateDrag(drag, mouseX, mouseY, rect.width, rect.height);
          return;
        }
        case "rotate": {
          const snapDeg = useSettingsStore.getState().rotationSnapDegrees;
          dragRef.current = updateRotateDrag(drag, mouseX, mouseY, snapDeg);
          return;
        }
        case "pan": {
          // Pan uses RAW screen coords (directly adjusts viewport offset)
          const newOffset = computePanOffset(drag, rawMouseX, rawMouseY);
          useEditorStore.getState().setCanvasViewport(newOffset);
          return;
        }
        case "drag_select": {
          dragRef.current = updateDragSelect(drag, mouseX, mouseY);
          return;
        }
        case "note_drag": {
          const density = useEditorStore.getState().density;
          dragRef.current = updateNoteDrag(drag, mouseX, mouseY, density);
          return;
        }
        case "hold_placement":
        case "hold_resize": {
          // Update hold note length based on perpendicular distance from head
          const hd = drag as HoldPlacementDragState | HoldResizeDragState;
          const lineInfo = getSelectedLineInfo();
          if (lineInfo) {
            const local = screenToLineLocal(
              mouseX, mouseY,
              lineInfo.screenX, lineInfo.screenY,
              lineInfo.rotation, rect.width,
            );
            const cs = useChartStore.getState();
            const line = cs.chart.lines[hd.lineIndex];
            if (line) {
              const bpmList = bpmListRef.current;
              const es = useEditorStore.getState();
              if (bpmList) {
                // Compute beat at cursor's perpendicular distance
                const cursorBeat = beatFromScreenDistance(
                  local.perpDistance,
                  line,
                  getCurrentTime(),
                  bpmList,
                  rect.height,
                  es.density,
                );
                const cursorBeatFloat = beatToFloat(cursorBeat);
                // hold_beat = cursor_beat - head_beat (clamped to at least 1/density)
                const holdBeats = Math.max(1 / es.density, cursorBeatFloat - hd.headBeat);
                const holdBeat = floatToBeat(holdBeats, es.density);
                cs.editNote(hd.lineIndex, hd.noteIndex, { hold_beat: holdBeat });
              }
            }
          }
          return;
        }
        case "eraser_drag": {
          // Update eraser drag — hit-test notes at current position
          const eraserDrag = drag as EraserDragState;
          const eraserLineInfo = getSelectedLineInfo();
          // Guard: only update if line selection hasn't changed mid-drag
          if (eraserLineInfo && eraserLineInfo.lineIndex === eraserDrag.lineIndex) {
            updateEraserDrag(eraserDrag, mouseX, mouseY, eraserLineInfo);
          }
          return;
        }
      }
    }

    // ---- Record mode: capture keyframes during playback ----
    {
      const es = useEditorStore.getState();
      const { isPlaying } = useAudioStore.getState();
      if (es.recordMode && isPlaying && es.selectedLineIndex !== null && bpmListRef.current) {
        const currentBeat = bpmListRef.current.beatAtFloat(
          useAudioStore.getState().currentTime - cs.chart.offset,
        );
        const lastBeat = es.recordedKeyframes.length > 0
          ? es.recordedKeyframes[es.recordedKeyframes.length - 1].beat : null;
        const kf = captureRecordKeyframe(
          mouseX, mouseY, rect.width, rect.height, currentBeat,
          es.recordModeChannels, lastBeat,
          useSettingsStore.getState().recordSnapToDensity, es.density,
        );
        if (kf) es.addRecordedKeyframe(kf);
      }
    }

    // ---- Hover: update cursor + ghost note ----
    const es = useEditorStore.getState();
    const selectedLineInfo = getSelectedLineInfo();

    if (selectedLineInfo) {
      const screenRotation = -selectedLineInfo.rotation;

      const isOverRotation = hitTestRotationHandle(
        mouseX, mouseY,
        selectedLineInfo.screenX, selectedLineInfo.screenY,
        screenRotation, rect.width,
      );
      const isOverTranslate = hitTestTranslateHandle(
        mouseX, mouseY,
        selectedLineInfo.screenX, selectedLineInfo.screenY,
      );
      const isOverLine = hitTestLineBody(
        mouseX, mouseY,
        selectedLineInfo.screenX, selectedLineInfo.screenY,
        screenRotation, rect.width,
      );

      const cursor = getCursorForPosition(
        isOverRotation, isOverTranslate, isOverLine,
        false, es.activeTool,
      );
      canvas.style.cursor = cursor;

      // ---- Step record: hold-to-stream ----
      if (es.stepRecordActive && es.stepRecordMouseDown && es.xSnapEnabled && es.lanes > 0) {
        const streamResult = handleStepRecordStream(
          mouseX, mouseY, selectedLineInfo,
          es.stepRecordNoteKind, es.stepRecordCurrentBeat, es.density,
          es.lanes, es.stepRecordLastSnapX, rect.width,
        );
        if (streamResult) {
          useChartStore.getState().addNote(selectedLineInfo.lineIndex, streamResult.note);
          es.advanceStepBeat();
          es.setStepRecordLastSnapX(streamResult.snappedX);
        }
      }

      // ---- Step record ghost note ----
      if (es.stepRecordActive) {
        const ghost = computeStepRecordGhost(
          mouseX, mouseY, selectedLineInfo,
          es.stepRecordNoteKind, es.stepRecordCurrentBeat, es.density,
          es.xSnapEnabled, es.lanes, rect.width,
        );
        es.setPendingNote(ghost);
        // Don't return — let cursor handling continue, but skip normal ghost
      }

      // ---- Pattern tool: compute ghost notes ----
      if (es.activeTool === "place_pattern") {
        const anchorBeat = bpmListRef.current
          ? bpmListRef.current.beatAtFloat(Math.max(0, useAudioStore.getState().currentTime - useChartStore.getState().chart.offset))
          : 0;
        es.setPatternGhostNotes(computePatternGhosts(es.patternConfig, anchorBeat));
      } else if (es.patternGhostNotes.length > 0) {
        // Clear ghost notes when switching away from pattern tool
        es.setPatternGhostNotes([]);
      }

      // ---- Ghost note preview for placement tools ----
      if (!es.stepRecordActive && isPlaceTool(es.activeTool) && !isOverRotation && !isOverTranslate) {
        const line = useChartStore.getState().chart.lines[selectedLineInfo.lineIndex];
        const bpmList = bpmListRef.current;
        if (line && bpmList) {
          const ghost = computePlacementGhost(
            mouseX, mouseY, selectedLineInfo, line,
            es.activeTool, bpmList, rect.width, rect.height,
            es.beatSyncPlacement, es.density, es.xSnapEnabled, es.lanes,
            getCurrentBeat(), getCurrentTime(),
          );
          es.setPendingNote(ghost);
        }
      } else {
        if (es.pendingNote) {
          es.setPendingNote(null);
        }
      }

    } else {
      canvas.style.cursor = isPlaceTool(es.activeTool) ? "crosshair" : "default";
      if (es.pendingNote) {
        es.setPendingNote(null);
      }
    }
  }, [getCurrentBeat, getCurrentTime, getSelectedLineInfo]);

  // ---- Mouse Up Handler ----
  const handleMouseUp = useCallback(() => {
    // ---- Step record: release mouse ----
    const esUp = useEditorStore.getState();
    if (esUp.stepRecordActive && esUp.stepRecordMouseDown) {
      esUp.setStepRecordMouseDown(false);
    }

    const drag = dragRef.current;
    if (!drag) return;

    const currentBeat = getCurrentBeat();
    const es = useEditorStore.getState();

    switch (drag.type) {
      case "translate": {
        finishTranslateDrag(drag, currentBeat);
        break;
      }
      case "rotate": {
        finishRotateDrag(drag, currentBeat);
        break;
      }
      case "drag_select": {
        // Find notes within the selection rectangle from RenderResult
        const rr = lastRenderResultRef.current;
        const selectedLineInfo = getSelectedLineInfo();
        if (rr && selectedLineInfo) {
          const minX = Math.min(drag.startX, drag.currentX);
          const maxX = Math.max(drag.startX, drag.currentX);
          const minY = Math.min(drag.startY, drag.currentY);
          const maxY = Math.max(drag.startY, drag.currentY);

          const hitNotes: number[] = [];
          for (const noteInfo of selectedLineInfo.notes) {
            if (
              noteInfo.screenX >= minX && noteInfo.screenX <= maxX &&
              noteInfo.screenY >= minY && noteInfo.screenY <= maxY
            ) {
              hitNotes.push(noteInfo.noteIndex);
            }
          }

          if (hitNotes.length > 0) {
            es.setNoteSelection(hitNotes);
            const targetType = hitNotes.length > 1 ? "multi_note" : "note";
            // Use drag end coordinates since the mouse event is not available in this callback
            es.showFloatingInspector(drag.currentX, drag.currentY, targetType);
          } else {
            es.clearSelection();
          }
        }
        break;
      }
      case "note_drag": {
        const density = es.density;
        finishNoteDrag(drag, density);
        break;
      }
      case "pan":
        // Pan already updated viewport during mousemove
        break;
      case "hold_placement":
      case "hold_resize":
        // Hold drag already updated note during mousemove — nothing to finalize
        break;
      case "eraser_drag": {
        // Batch-delete all notes hit during the eraser drag (single undo entry)
        const eraserDrag = drag as EraserDragState;
        if (eraserDrag.hitNoteIndices.size > 0) {
          const cs = useChartStore.getState();
          cs.removeNotes(
            eraserDrag.lineIndex,
            Array.from(eraserDrag.hitNoteIndices),
          );
        }
        break;
      }
    }

    dragRef.current = null;
    es.setCanvasInteractionMode("idle");
  }, [getCurrentBeat, getSelectedLineInfo]);

  // ---- Global mouse up listener (handles mouse release outside canvas) ----
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragRef.current) {
        handleMouseUp();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [handleMouseUp]);

  // ---- Keyboard listeners (space for panning) ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        spaceDownRef.current = true;
        const canvas = canvasRef.current;
        if (canvas && !dragRef.current) {
          canvas.style.cursor = "grab";
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        const canvas = canvasRef.current;
        if (canvas && !dragRef.current) {
          canvas.style.cursor = "default";
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ---- Scroll handler: seek time / zoom / horizontal pan ----
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const es = useEditorStore.getState();
    const audioState = useAudioStore.getState();
    const container = containerRef.current;

    if (e.ctrlKey || e.metaKey) {
      // ---- Ctrl + scroll: Zoom toward cursor ----
      const rect = container?.getBoundingClientRect();
      const rawMouseX = rect ? e.clientX - rect.left : 0;
      const rawMouseY = rect ? e.clientY - rect.top : 0;

      const vp = es.canvasViewport;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.25, Math.min(4.0, vp.zoom * zoomFactor));

      // Keep the cursor's logical position fixed on screen
      const logicalX = (rawMouseX - vp.offsetX) / vp.zoom;
      const logicalY = (rawMouseY - vp.offsetY) / vp.zoom;
      es.setCanvasViewport({
        zoom: newZoom,
        offsetX: rawMouseX - logicalX * newZoom,
        offsetY: rawMouseY - logicalY * newZoom,
      });
    } else if (e.shiftKey) {
      // ---- Shift + scroll: Horizontal pan ----
      const panAmount = e.deltaY * 0.5;
      es.setCanvasViewport({
        offsetX: es.canvasViewport.offsetX - panAmount,
      });
    } else {
      // ---- Vertical scroll: Seek through time ----
      const seekAmount = e.deltaY * 0.002; // seconds per pixel of scroll
      const newTime = Math.max(0, audioState.currentTime + seekAmount);
      audioState.seek(newTime);
    }
  }, []);

  // ---- Mouse leave: clear ghost note and screen-space cursor ref ----
  const handleMouseLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "default";
    rawCursorRef.current = null;
    const es = useEditorStore.getState();
    if (es.pendingNote) {
      es.setPendingNote(null);
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => {
          e.preventDefault();
          const canvasEl = canvasRef.current;
          const es = useEditorStore.getState();
          const cs = useChartStore.getState();
          if (!canvasEl || es.selectedLineIndex === null) return;

          // Compute canvas-space coordinates
          const rect = canvasEl.getBoundingClientRect();
          const vp = es.canvasViewport;
          const pixelX = (e.clientX - rect.left);
          const pixelY = (e.clientY - rect.top);
          const centerX = rect.width / 2 + vp.offsetX;
          const centerY = rect.height / 2 + vp.offsetY;
          const scale = (rect.width / 1350) * vp.zoom;
          const canvasX = (pixelX - centerX) / scale;
          const canvasY = -(pixelY - centerY) / scale;

          // Get current beat
          const { currentTime } = useAudioStore.getState();
          const bpmList = new BpmList(cs.chart.bpm_list);
          const beat = bpmList.beatAtFloat(Math.max(0, currentTime - cs.chart.offset));

          setCanvasContextMenu({
            x: e.clientX,
            y: e.clientY,
            canvasX,
            canvasY,
            beat,
            lineIndex: es.selectedLineIndex,
          });
        }}
        style={{ cursor: "default" }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            No chart loaded — import or create a chart first
          </span>
        </div>
      )}
      {canvasContextMenu && (
        <CanvasContextMenu
          x={canvasContextMenu.x}
          y={canvasContextMenu.y}
          canvasX={canvasContextMenu.canvasX}
          canvasY={canvasContextMenu.canvasY}
          beat={canvasContextMenu.beat}
          lineIndex={canvasContextMenu.lineIndex}
          onClose={() => setCanvasContextMenu(null)}
        />
      )}
    </div>
  );
}

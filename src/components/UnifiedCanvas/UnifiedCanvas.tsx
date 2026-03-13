// ============================================================
// Unified Canvas — Interactive Game Preview
//
// The main editing surface for the unified editor. Renders the
// game preview using the augmented GameRenderer (with RenderResult)
// and handles all mouse interaction: line/note selection, handle
// dragging, note placement, viewport zoom/pan.
//
// Phase 1: Render loop + line/note selection via click.
// Phase 2: Handles, note placement, drag selection, viewport.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { useGroupStore } from "../../stores/groupStore";
import { GameRenderer, type RenderResult, type RenderedLineInfo } from "../../canvas/gameRenderer";
import { evaluateLineEventsWithLayers } from "../../canvas/events";
import { HitEffectManager } from "../../canvas/hitEffects";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat, floatToBeat, CANVAS_WIDTH } from "../../types/chart";
import type { NoteKind, Note, Beat } from "../../types/chart";
import { snapBeat } from "../../utils/beat";

// Interaction modules
import {
  drawLineHandles,
  drawDragGhostLine,
  drawRotationSnapGuides,
  drawSelectionRect,
  hitTestTranslateHandle,
  hitTestRotationHandle,
  hitTestLineBody,
} from "./CanvasOverlays";
import {
  type DragState,
  type TranslateDragState,
  type RotateDragState,
  type HoldPlacementDragState,
  type HoldResizeDragState,
  startTranslateDrag,
  updateTranslateDrag,
  finishTranslateDrag,
  startRotateDrag,
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
  computeGhostNote,
  projectClickToNote,
  beatFromScreenDistance,
} from "./NoteProjection";

// ============================================================
// Tool → NoteKind mapping
// ============================================================
const TOOL_TO_NOTE_KIND: Record<string, NoteKind> = {
  place_tap: "tap",
  place_drag: "drag",
  place_flick: "flick",
  place_hold: "hold",
};

function isPlaceTool(tool: string): boolean {
  return tool in TOOL_TO_NOTE_KIND;
}

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

  const isLoaded = useChartStore((s) => s.isLoaded);

  // Build BpmList (memoized on bpm_list reference)
  const chart = useChartStore((s) => s.chart);
  const bpmListRef = useRef<BpmList | null>(null);
  const bpmListDataRef = useRef(chart.bpm_list);
  if (bpmListDataRef.current !== chart.bpm_list) {
    bpmListDataRef.current = chart.bpm_list;
    bpmListRef.current = new BpmList(chart.bpm_list);
  }
  if (!bpmListRef.current) {
    bpmListRef.current = new BpmList(chart.bpm_list);
  }

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

      // Render and capture result for hit-testing
      const renderResult = renderer.render(
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

        // Draw drag selection rectangle (in logical space, viewport-transformed)
        if (dragRef.current?.type === "drag_select") {
          const ds = dragRef.current;
          drawSelectionRect(ctx, ds.startX, ds.startY, ds.currentX, ds.currentY);
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

    // ---- Handle hit-testing (only when a line is selected) ----
    if (selectedLineInfo) {
      const screenRotation = -selectedLineInfo.rotation;

      // Check rotation handle first (higher priority — smaller target)
      if (hitTestRotationHandle(
        mouseX, mouseY,
        selectedLineInfo.screenX, selectedLineInfo.screenY,
        screenRotation, rect.width,
      )) {
        const rotDeg = (selectedLineInfo.rotation * 180) / Math.PI;
        dragRef.current = startRotateDrag(
          selectedLineInfo.lineIndex,
          selectedLineInfo.screenX, selectedLineInfo.screenY,
          // Get Phigros coords for ghost line
          cs.chart.lines[selectedLineInfo.lineIndex]
            ? (evaluateLineEventsWithLayers(
                cs.chart.lines[selectedLineInfo.lineIndex].events,
                cs.chart.lines[selectedLineInfo.lineIndex].event_layers,
                getCurrentBeat(),
              )).x
            : 0,
          cs.chart.lines[selectedLineInfo.lineIndex]
            ? (evaluateLineEventsWithLayers(
                cs.chart.lines[selectedLineInfo.lineIndex].events,
                cs.chart.lines[selectedLineInfo.lineIndex].event_layers,
                getCurrentBeat(),
              )).y
            : 0,
          rotDeg,
        );
        es.setCanvasInteractionMode("dragging_rotate");
        return;
      }

      // Check translate handle or line body
      if (
        hitTestTranslateHandle(mouseX, mouseY, selectedLineInfo.screenX, selectedLineInfo.screenY) ||
        hitTestLineBody(mouseX, mouseY, selectedLineInfo.screenX, selectedLineInfo.screenY, screenRotation, rect.width)
      ) {
        const line = cs.chart.lines[selectedLineInfo.lineIndex];
        if (line) {
          const currentBeat = getCurrentBeat();
          const state = evaluateLineEventsWithLayers(line.events, line.event_layers, currentBeat);
          const rotDeg = (state.rotation * 180) / Math.PI;
          dragRef.current = startTranslateDrag(
            selectedLineInfo.lineIndex,
            mouseX, mouseY,
            state.x, state.y, rotDeg,
          );
          es.setCanvasInteractionMode("dragging_translate");
        }
        return;
      }
    }

    // ---- Note placement (place tools: tap/drag/flick/hold) ----
    if (isPlaceTool(es.activeTool) && selectedLineInfo) {
      const noteKind = TOOL_TO_NOTE_KIND[es.activeTool];
      const line = cs.chart.lines[selectedLineInfo.lineIndex];
      if (line && noteKind) {
        const bpmList = bpmListRef.current;
        if (bpmList) {
          let placement: { beat: Beat; x: number; above: boolean } | null = null;

          if (es.beatSyncPlacement) {
            // Beat-sync mode: beat from playhead, X and above from click
            const local = screenToLineLocal(
              mouseX, mouseY,
              selectedLineInfo.screenX, selectedLineInfo.screenY,
              selectedLineInfo.rotation, rect.width,
            );
            const currentBeatFloat = getCurrentBeat();
            const beat = snapBeat(currentBeatFloat, es.density);
            const x = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, Math.round(local.noteX)));
            placement = { beat, x, above: local.above };
          } else {
            // Normal mode: beat from perpendicular distance
            placement = projectClickToNote(
              mouseX, mouseY,
              selectedLineInfo.screenX, selectedLineInfo.screenY,
              selectedLineInfo.rotation,
              line,
              getCurrentTime(),
              bpmList,
              rect.width, rect.height,
              es.density,
            );
          }

          if (placement) {
            const newNote: Note = {
              kind: noteKind,
              above: placement.above,
              beat: placement.beat,
              x: placement.x,
              speed: 1,
            };
            if (noteKind === "hold") {
              newNote.hold_beat = [0, 1, es.density] as Beat;
            }
            cs.addNote(selectedLineInfo.lineIndex, newNote);

            // For hold notes in normal mode, start a placement drag to set the hold length
            if (noteKind === "hold" && !es.beatSyncPlacement) {
              const addedNoteIndex = cs.chart.lines[selectedLineInfo.lineIndex].notes.length - 1;
              dragRef.current = {
                type: "hold_placement",
                lineIndex: selectedLineInfo.lineIndex,
                noteIndex: addedNoteIndex,
                headBeat: beatToFloat(placement.beat),
                above: placement.above,
              } as HoldPlacementDragState;
              es.setCanvasInteractionMode("placing_note");
            }
            return;
          }
        }
      }
    }

    // ---- Note hit-testing (select tool) ----
    const renderResult = lastRenderResultRef.current;
    if (renderResult && es.activeTool === "select") {
      // First check notes on the selected line
      if (selectedLineInfo) {
        for (let j = selectedLineInfo.notes.length - 1; j >= 0; j--) {
          const noteInfo = selectedLineInfo.notes[j];
          const dx = mouseX - noteInfo.screenX;
          const dy = mouseY - noteInfo.screenY;
          const halfW = Math.max(noteInfo.width / 2, 12);
          const halfH = Math.max(noteInfo.height / 2, 12);
          if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
            // Check if this note is already selected → start drag or hold resize
            if (es.selectedNoteIndices.includes(noteInfo.noteIndex) && !e.ctrlKey && !e.metaKey) {
              const line = cs.chart.lines[selectedLineInfo.lineIndex];
              if (line) {
                const bpmList = bpmListRef.current;
                if (bpmList) {
                  const note = line.notes[noteInfo.noteIndex];

                  // Hold note resize: if single hold note selected and click is in tail region
                  if (note && note.kind === "hold" && note.hold_beat && es.selectedNoteIndices.length === 1) {
                    // Check if click is further from line than the note head (tail region)
                    const clickLocal = screenToLineLocal(
                      mouseX, mouseY,
                      selectedLineInfo.screenX, selectedLineInfo.screenY,
                      selectedLineInfo.rotation, rect.width,
                    );
                    const headLocal = screenToLineLocal(
                      noteInfo.screenX, noteInfo.screenY,
                      selectedLineInfo.screenX, selectedLineInfo.screenY,
                      selectedLineInfo.rotation, rect.width,
                    );
                    if (clickLocal.perpDistance > headLocal.perpDistance) {
                      // Click is in tail region — start hold resize
                      dragRef.current = {
                        type: "hold_resize",
                        lineIndex: selectedLineInfo.lineIndex,
                        noteIndex: noteInfo.noteIndex,
                        headBeat: beatToFloat(note.beat),
                        above: note.above,
                      } as HoldResizeDragState;
                      es.setCanvasInteractionMode("dragging_translate");
                      return;
                    }
                  }

                  // Regular note move drag
                  const curBeat = getCurrentBeat();
                  const speedEvents = line.events.filter((ev) => ev.kind === "speed");
                  let currentSpeed = 1;
                  for (const se of speedEvents) {
                    if (beatToFloat(se.start_beat) <= curBeat && curBeat <= beatToFloat(se.end_beat)) {
                      if ("constant" in se.value) currentSpeed = se.value.constant;
                      else if ("transition" in se.value) currentSpeed = se.value.transition.start;
                      break;
                    }
                  }
                  const bpmAtCurrent = bpmList.bpmAtTime(getCurrentTime());

                  dragRef.current = startNoteDrag(
                    selectedLineInfo.lineIndex,
                    es.selectedNoteIndices,
                    line.notes,
                    mouseX, mouseY,
                    selectedLineInfo.screenX, selectedLineInfo.screenY,
                    selectedLineInfo.rotation,
                    rect.width, rect.height,
                    bpmAtCurrent,
                    currentSpeed,
                  );
                  es.setCanvasInteractionMode("dragging_translate");
                }
              }
              return;
            }

            if (e.ctrlKey || e.metaKey) {
              es.toggleNoteSelection(noteInfo.noteIndex);
            } else {
              es.setNoteSelection([noteInfo.noteIndex]);
            }
            return;
          }
        }
      }

      // Then check notes on other lines
      const noteHit = renderer.hitTestNote(mouseX, mouseY, renderResult);
      if (noteHit) {
        es.selectLine(noteHit.lineIndex);
        es.setNoteSelection([noteHit.noteIndex]);
        return;
      }
    }

    // ---- Eraser tool — delete note on click ----
    if (es.activeTool === "eraser" && renderResult && selectedLineInfo) {
      for (let j = selectedLineInfo.notes.length - 1; j >= 0; j--) {
        const noteInfo = selectedLineInfo.notes[j];
        const dx = mouseX - noteInfo.screenX;
        const dy = mouseY - noteInfo.screenY;
        const halfW = Math.max(noteInfo.width / 2, 12);
        const halfH = Math.max(noteInfo.height / 2, 12);
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
          cs.removeNotes(selectedLineInfo.lineIndex, [noteInfo.noteIndex]);
          return;
        }
      }
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

    // Convert to logical (viewport-adjusted) coordinates
    const vp = useEditorStore.getState().canvasViewport;
    const mouseX = (rawMouseX - vp.offsetX) / vp.zoom;
    const mouseY = (rawMouseY - vp.offsetY) / vp.zoom;

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

      // ---- Ghost note preview for placement tools ----
      if (isPlaceTool(es.activeTool) && !isOverRotation && !isOverTranslate) {
        const noteKind = TOOL_TO_NOTE_KIND[es.activeTool];
        const cs = useChartStore.getState();
        const line = cs.chart.lines[selectedLineInfo.lineIndex];
        const bpmList = bpmListRef.current;

        if (line && bpmList && noteKind) {
          let ghostResult: { beat: Beat; x: number; kind: string; above: boolean } | null = null;

          if (es.beatSyncPlacement) {
            // Beat-sync mode: ghost at current playhead beat
            const local = screenToLineLocal(
              mouseX, mouseY,
              selectedLineInfo.screenX, selectedLineInfo.screenY,
              selectedLineInfo.rotation, rect.width,
            );
            const currentBeatFloat = getCurrentBeat();
            const beat = snapBeat(currentBeatFloat, es.density);
            const x = Math.max(-CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH / 2, Math.round(local.noteX)));
            ghostResult = { beat, x, kind: noteKind, above: local.above };
          } else {
            // Normal mode: ghost from perpendicular distance
            ghostResult = computeGhostNote(
              mouseX, mouseY,
              selectedLineInfo.screenX, selectedLineInfo.screenY,
              selectedLineInfo.rotation,
              line,
              getCurrentTime(),
              bpmList,
              rect.width, rect.height,
              es.density,
              noteKind,
            );
          }

          if (ghostResult) {
            es.setPendingNote({
              beat: ghostResult.beat,
              x: ghostResult.x,
              kind: ghostResult.kind as NoteKind,
              above: ghostResult.above,
            });
          } else {
            es.setPendingNote(null);
          }
        }
      } else {
        // Clear ghost note when not in placement mode or hovering handles
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
  }, [getCurrentTime, getSelectedLineInfo]);

  // ---- Mouse Up Handler ----
  const handleMouseUp = useCallback(() => {
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

  // ---- Mouse leave: clear ghost note ----
  const handleMouseLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "default";
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
        onContextMenu={(e) => e.preventDefault()}
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
    </div>
  );
}

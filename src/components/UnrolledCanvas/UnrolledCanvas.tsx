// ============================================================
// Unrolled Canvas — Main React Component
//
// The core editing surface for the Unrolled Editor view.
// Renders notes as colored rectangles on a 2D grid:
//   X axis = note position on the line (-675..675)
//   Y axis = beat (linear, bottom-to-top)
//
// Supports: note placement, selection, drag-move, hold-tail
// resize, drag selection, scroll/zoom, ghost preview, and
// overlay notes from other lines.
//
// Recent change: Added override props for per-line unrolled
// editor tabs (overrideLineIndex, scrollBeatKey, followPlaybackKey).
// ============================================================

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { UnrolledRenderer } from "../../canvas/unrolledRenderer";
import type { UnrolledOverlayLine } from "../../canvas/unrolledRenderer";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../types/chart";
import { snapBeat, floatToBeat } from "../../utils/beat";
import { snapX } from "../../utils/xSnap";
import type { NoteKind, Beat } from "../../types/chart";

// ============================================================
// Props — override props allow per-line tabs to lock the canvas
// to a specific line and use independent scroll beat state.
// ============================================================
interface UnrolledCanvasProps {
  /** Lock canvas to this line index (per-line tab mode) */
  overrideLineIndex?: number;
  /** Key into editorStore.lineTabScrollBeats for per-tab scroll */
  scrollBeatKey?: number;
  /** Key into editorStore.unrolledFollowPlayback ("main" or lineIndex string) */
  followPlaybackKey?: string;
}

// ============================================================
// Note drag state — tracks note movement during drag
// ============================================================
interface NoteDragState {
  noteIndices: number[];
  startMouseX: number;
  startMouseY: number;
  originalNotes: Array<{ beat: number; x: number }>;
}

// ============================================================
// Hold tail drag state — tracks hold note tail resizing
// ============================================================
interface HoldTailDragState {
  noteIndex: number;
  startMouseY: number;
  originalHoldBeat: number;
}

// ============================================================
// Hit detection — find which note is under the cursor
// ============================================================
const NOTE_HIT_WIDTH = 28;   // slightly larger than visual for easier clicking
const NOTE_HIT_HEIGHT = 12;
const HOLD_TAIL_HIT_HEIGHT = 10;

export function UnrolledCanvas({
  overrideLineIndex,
  scrollBeatKey,
  followPlaybackKey = "main",
}: UnrolledCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<UnrolledRenderer | null>(null);
  const rafRef = useRef<number>(0);

  // Active tool for cursor display (proper subscription for re-renders)
  const activeTool = useEditorStore((s) => s.activeTool);

  // ---- Per-line tab helpers ----
  // When overrideLineIndex is set, the canvas is locked to that line
  // and uses per-tab scroll beat from lineTabScrollBeats map.
  const isPerLineTab = overrideLineIndex !== undefined;

  /** Get the effective line index (overridden or from editorStore) */
  const getLineIndex = useCallback((): number | null => {
    return isPerLineTab ? overrideLineIndex! : useEditorStore.getState().selectedLineIndex;
  }, [isPerLineTab, overrideLineIndex]);

  /** Get the effective scroll beat (per-tab or global) */
  const getScrollBeat = useCallback((): number => {
    if (isPerLineTab && scrollBeatKey !== undefined) {
      return useEditorStore.getState().lineTabScrollBeats[scrollBeatKey] ?? 0;
    }
    return useEditorStore.getState().unrolledScrollBeat;
  }, [isPerLineTab, scrollBeatKey]);

  /** Update the scroll beat (per-tab or global) */
  const updateScrollBeat = useCallback((beat: number) => {
    const clamped = Math.max(0, beat);
    if (isPerLineTab && scrollBeatKey !== undefined) {
      useEditorStore.getState().setLineTabScrollBeat(scrollBeatKey, clamped);
    } else {
      useEditorStore.getState().setUnrolledScrollBeat(clamped);
    }
  }, [isPerLineTab, scrollBeatKey]);

  // Drag state refs (not in React state to avoid re-renders during drag)
  const noteDragRef = useRef<NoteDragState | null>(null);
  const holdTailDragRef = useRef<HoldTailDragState | null>(null);
  const dragSelectStartRef = useRef<{ x: number; y: number } | null>(null);

  // Store selectors
  const chart = useChartStore((s) => s.chart);
  const isLoaded = useChartStore((s) => s.isLoaded);
  const bpmList = useMemo(() => new BpmList(chart.bpm_list), [chart.bpm_list]);
  const bpmListRef = useRef(bpmList);
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

  // ---- Initialize renderer + animation loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    rendererRef.current = new UnrolledRenderer(ctx);
    resizeCanvas();

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container) {
      observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(container);
    }

    // Animation loop — reads stores on each frame
    const animate = () => {
      const renderer = rendererRef.current;
      const cnv = canvasRef.current;
      if (!renderer || !cnv) { rafRef.current = requestAnimationFrame(animate); return; }

      const cs = useChartStore.getState();
      const es = useEditorStore.getState();
      const as_ = useAudioStore.getState();

      // Use per-tab helpers for line index and scroll beat
      const lineIdx = getLineIndex();

      if (!cs.isLoaded || lineIdx === null) {
        // Draw empty state
        const dpr = window.devicePixelRatio || 1;
        const w = cnv.width / dpr;
        const h = cnv.height / dpr;
        const cx = cnv.getContext("2d");
        if (cx) {
          cx.clearRect(0, 0, w, h);
          cx.fillStyle = "#0e1629";
          cx.fillRect(0, 0, w, h);
          cx.fillStyle = "rgba(255,255,255,0.2)";
          cx.font = "14px monospace";
          cx.textAlign = "center";
          cx.textBaseline = "middle";
          cx.fillText(
            cs.isLoaded ? "Select a line to begin editing" : "No chart loaded",
            w / 2, h / 2,
          );
        }
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const line = cs.chart.lines[lineIdx];
      if (!line) { rafRef.current = requestAnimationFrame(animate); return; }

      const bl = bpmListRef.current;
      const currentBeat = bl.beatAtFloat(Math.max(0, as_.currentTime - cs.chart.offset));
      const dpr = window.devicePixelRatio || 1;
      const w = cnv.width / dpr;
      const h = cnv.height / dpr;

      // Auto-follow playback — per-tab follow toggle
      const followPlayback = es.unrolledFollowPlayback[followPlaybackKey] ?? true;
      if (as_.isPlaying && followPlayback) {
        const scrollBeat = getScrollBeat();
        const pxPerBeat = 80 * es.timelineZoom;
        const maxVisibleBeat = scrollBeat + h / pxPerBeat;
        // If playhead is about to go off-screen, scroll to center it
        if (currentBeat > maxVisibleBeat - 1 || currentBeat < scrollBeat + 0.5) {
          const targetScroll = Math.max(0, currentBeat - h / pxPerBeat * 0.3);
          updateScrollBeat(targetScroll);
        }
      }

      // Build overlay lines
      let overlayLines: UnrolledOverlayLine[] | undefined;
      if (es.timelineOverlayEnabled && es.timelineOverlayLines.length > 0) {
        const overlayColors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181", "#aa96da"];
        overlayLines = [];
        for (let i = 0; i < es.timelineOverlayLines.length; i++) {
          const li = es.timelineOverlayLines[i];
          if (li === lineIdx) continue;
          const ol = cs.chart.lines[li];
          if (!ol) continue;
          overlayLines.push({
            notes: ol.notes,
            lineIndex: li,
            color: overlayColors[i % overlayColors.length],
          });
        }
      }

      renderer.render({
        notes: line.notes,
        curveNoteTracks: line.curve_note_tracks,
        currentBeat,
        zoom: es.timelineZoom,
        density: es.density,
        lanes: es.lanes,
        noteSideFilter: es.noteSideFilter,
        selectedNoteIndices: es.selectedNoteIndices,
        scrollBeat: getScrollBeat(),
        canvasWidth: w,
        canvasHeight: h,
        dragSelectionRect: es.dragSelectionRect,
        pendingNote: es.pendingNote,
        overlayLines,
        overlayOpacity: es.timelineOverlayOpacity,
        onsetMarkers: es.onsetMarkers,
        onsetOpacity: useSettingsStore.getState().onsetOpacity,
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (observer) observer.disconnect();
    };
  }, [isLoaded, resizeCanvas]);

  // ---- Mouse coordinate helpers ----
  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 1, h: 1 };
    const dpr = window.devicePixelRatio || 1;
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  }, []);

  /** Find the note index under the given pixel coords, or -1 */
  const hitTestNote = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { w, h } = getCanvasSize();
    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w);
    const scrollBeat = getScrollBeat();

    // Iterate in reverse so topmost (later-drawn) notes are tested first
    for (let i = line.notes.length - 1; i >= 0; i--) {
      const note = line.notes[i];
      const beat = beatToFloat(note.beat);
      const ny = UnrolledRenderer.beatToY(beat, scrollBeat, es.timelineZoom, h);
      const nx = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

      if (
        Math.abs(px - nx) <= NOTE_HIT_WIDTH / 2 &&
        Math.abs(py - ny) <= NOTE_HIT_HEIGHT / 2
      ) {
        return i;
      }
    }
    return -1;
  }, [getCanvasSize, getLineIndex, getScrollBeat]);

  /** Check if px,py hits a hold note's tail handle. Returns the note index or -1. */
  const hitTestHoldTail = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { w, h } = getCanvasSize();
    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w);
    const scrollBeat = getScrollBeat();

    for (const idx of es.selectedNoteIndices) {
      const note = line.notes[idx];
      if (!note || note.kind !== "hold" || !note.hold_beat) continue;

      const beat = beatToFloat(note.beat);
      const holdEndBeat = beat + beatToFloat(note.hold_beat);
      const tailY = UnrolledRenderer.beatToY(holdEndBeat, scrollBeat, es.timelineZoom, h);
      const nx = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

      if (
        Math.abs(px - nx) <= NOTE_HIT_WIDTH / 2 &&
        Math.abs(py - tailY) <= HOLD_TAIL_HIT_HEIGHT / 2
      ) {
        return idx;
      }
    }
    return -1;
  }, [getCanvasSize, getLineIndex, getScrollBeat]);

  // ---- Mouse handlers ----

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only handle left click
    const { x, y } = getCanvasCoords(e);
    const { w, h } = getCanvasSize();

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const ss = useSettingsStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null || !cs.isLoaded) return;
    const line = cs.chart.lines[lineIdx];
    if (!line) return;

    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w);
    const scrollBeat = getScrollBeat();
    const clickBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
    const clickNoteX = UnrolledRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);

    const tool = es.activeTool;

    // ---- Place tool: place a note ----
    if (tool.startsWith("place_")) {
      const kind = tool.replace("place_", "") as NoteKind;
      const snappedBeat = snapBeat(clickBeat, es.density);
      const snappedX = es.xSnapEnabled ? snapX(clickNoteX, es.lanes) : Math.round(clickNoteX);
      const above = e.shiftKey ? !ss.unrolledDefaultAbove : ss.unrolledDefaultAbove;

      // Step record mode: place at step beat instead of click position
      if (es.stepRecordActive) {
        const stepBeat = floatToBeat(es.stepRecordCurrentBeat);
        cs.addNote(lineIdx, {
          beat: stepBeat,
          x: snappedX,
          kind: es.stepRecordNoteKind,
          above,
          speed: 1.0,
          hold_beat: es.stepRecordNoteKind === "hold" ? [0, 1, es.density] as Beat : undefined,
        });
        es.advanceStepBeat();
        return;
      }

      cs.addNote(lineIdx, {
        beat: snappedBeat,
        x: snappedX,
        kind,
        above,
        speed: 1.0,
        hold_beat: kind === "hold" ? [0, 1, es.density] as Beat : undefined,
      });
      return;
    }

    // ---- Eraser tool: delete note under cursor ----
    if (tool === "eraser") {
      const hitIdx = hitTestNote(x, y);
      if (hitIdx >= 0) {
        cs.removeNotes(lineIdx, [hitIdx]);
      }
      return;
    }

    // ---- Select tool ----
    if (tool === "select") {
      // Check if clicking a hold tail handle first (for resize)
      const tailIdx = hitTestHoldTail(x, y);
      if (tailIdx >= 0) {
        const note = line.notes[tailIdx];
        const holdBeat = note.hold_beat ? beatToFloat(note.hold_beat) : 0;
        holdTailDragRef.current = {
          noteIndex: tailIdx,
          startMouseY: y,
          originalHoldBeat: holdBeat,
        };
        return;
      }

      // Check if clicking on an existing note
      const hitIdx = hitTestNote(x, y);
      if (hitIdx >= 0) {
        // Ctrl+click toggles multi-select
        if (e.ctrlKey || e.metaKey) {
          es.toggleNoteSelection(hitIdx);
        } else if (!es.selectedNoteIndices.includes(hitIdx)) {
          es.setNoteSelection([hitIdx]);
        }

        // Start note drag
        const selected = es.selectedNoteIndices.includes(hitIdx)
          ? es.selectedNoteIndices
          : [hitIdx];
        noteDragRef.current = {
          noteIndices: selected,
          startMouseX: x,
          startMouseY: y,
          originalNotes: selected.map((idx) => ({
            beat: beatToFloat(line.notes[idx].beat),
            x: line.notes[idx].x,
          })),
        };

        // Show floating inspector
        es.showFloatingInspector(
          e.clientX, e.clientY,
          selected.length > 1 ? "multi_note" : "note",
        );
        return;
      }

      // Clicked empty space: start drag selection
      es.clearSelection();
      es.hideFloatingInspector();
      dragSelectStartRef.current = { x, y };
      es.setDragSelectionRect({ x1: x, y1: y, x2: x, y2: y });
      return;
    }
  }, [getCanvasCoords, getCanvasSize, hitTestNote, hitTestHoldTail, getLineIndex, getScrollBeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e);
    const { w, h } = getCanvasSize();

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const ss = useSettingsStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null || !cs.isLoaded) return;

    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w);
    const scrollBeat = getScrollBeat();

    // ---- Note drag ----
    if (noteDragRef.current) {
      const drag = noteDragRef.current;
      // Compute beat delta: moving mouse UP = increasing beat
      const startBeat = UnrolledRenderer.yToBeat(drag.startMouseY, scrollBeat, es.timelineZoom, h);
      const currentBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
      const deltaBeat = currentBeat - startBeat;

      const startNoteX = UnrolledRenderer.pixelToNoteX(drag.startMouseX, noteAreaLeft, noteAreaWidth);
      const currentNoteX = UnrolledRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);
      const deltaX = currentNoteX - startNoteX;

      // Snap delta beat to density grid
      const snappedDeltaBeat = Math.round(deltaBeat * es.density) / es.density;
      // Snap delta X to lane grid if enabled
      const snappedDeltaX = es.xSnapEnabled
        ? snapX(drag.originalNotes[0].x + deltaX, es.lanes) - drag.originalNotes[0].x
        : Math.round(deltaX);

      cs.batchEditNotes(lineIdx!, drag.noteIndices.map((idx, i) => ({
        noteIndex: idx,
        changes: {
          beat: floatToBeat(Math.max(0, drag.originalNotes[i].beat + snappedDeltaBeat)),
          x: Math.round(drag.originalNotes[i].x + snappedDeltaX),
        },
      })));
      return;
    }

    // ---- Hold tail drag ----
    if (holdTailDragRef.current) {
      const drag = holdTailDragRef.current;
      const line = cs.chart.lines[lineIdx!];
      const note = line?.notes[drag.noteIndex];
      if (!note) return;

      const noteBeat = beatToFloat(note.beat);
      const currentBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
      let newHoldBeats = currentBeat - noteBeat;
      // Snap to density grid and clamp to minimum
      newHoldBeats = Math.max(1 / es.density, Math.round(newHoldBeats * es.density) / es.density);

      cs.editNote(lineIdx!, drag.noteIndex, {
        hold_beat: floatToBeat(newHoldBeats),
      });
      return;
    }

    // ---- Drag selection ----
    if (dragSelectStartRef.current) {
      const start = dragSelectStartRef.current;
      es.setDragSelectionRect({ x1: start.x, y1: start.y, x2: x, y2: y });
      return;
    }

    // ---- Ghost/pending note preview (place tool active) ----
    if (es.activeTool.startsWith("place_")) {
      const kind = es.activeTool.replace("place_", "") as NoteKind;
      const clickBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
      const clickNoteX = UnrolledRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);
      const snappedBeat = snapBeat(clickBeat, es.density);
      const snappedX = es.xSnapEnabled ? snapX(clickNoteX, es.lanes) : Math.round(clickNoteX);
      const above = e.shiftKey ? !ss.unrolledDefaultAbove : ss.unrolledDefaultAbove;

      es.setPendingNote({
        beat: snappedBeat,
        x: snappedX,
        kind,
        above,
      });
    }
  }, [getCanvasCoords, getCanvasSize, getLineIndex, getScrollBeat]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();

    // ---- Finalize note drag ----
    if (noteDragRef.current) {
      noteDragRef.current = null;
      // Notes are already mutated via batchEditNotes during mousemove
      return;
    }

    // ---- Finalize hold tail drag ----
    if (holdTailDragRef.current) {
      holdTailDragRef.current = null;
      return;
    }

    // ---- Finalize drag selection ----
    if (dragSelectStartRef.current) {
      dragSelectStartRef.current = null;
      const rect = es.dragSelectionRect;
      es.setDragSelectionRect(null);

      const lineIdx = getLineIndex();
      if (!rect || lineIdx === null) return;

      const { w, h } = getCanvasSize();
      const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w);
      const line = cs.chart.lines[lineIdx];
      if (!line) return;

      // Find all notes within the selection rectangle
      const minX = Math.min(rect.x1, rect.x2);
      const maxX = Math.max(rect.x1, rect.x2);
      const minY = Math.min(rect.y1, rect.y2);
      const maxY = Math.max(rect.y1, rect.y2);
      const scrollBeat = getScrollBeat();

      const selected: number[] = [];
      for (let i = 0; i < line.notes.length; i++) {
        const note = line.notes[i];
        const beat = beatToFloat(note.beat);
        const ny = UnrolledRenderer.beatToY(beat, scrollBeat, es.timelineZoom, h);
        const nx = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

        if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
          selected.push(i);
        }
      }

      if (selected.length > 0) {
        es.setNoteSelection(selected);
        // Show floating inspector for the selection
        es.showFloatingInspector(
          e.clientX, e.clientY,
          selected.length > 1 ? "multi_note" : "note",
        );
      }
    }
  }, [getCanvasSize, getLineIndex, getScrollBeat]);

  const handleMouseLeave = useCallback(() => {
    const es = useEditorStore.getState();
    es.setPendingNote(null);
  }, []);

  // ---- Scroll handler (wheel) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const es = useEditorStore.getState();
      const ss = useSettingsStore.getState();

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+scroll: zoom
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        es.setTimelineZoom(es.timelineZoom + zoomDelta);
      } else {
        // Normal scroll: seek through beats
        const scrollDirection = ss.invertScrollDirection ? -1 : 1;
        const beatDelta = (e.deltaY > 0 ? -1 : 1) * scrollDirection / es.density;
        updateScrollBeat(getScrollBeat() + beatDelta);
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // ---- Context menu (right-click) for curve note tracks ----
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const hitIdx = hitTestNote(x, y);
    if (hitIdx >= 0) {
      const es = useEditorStore.getState();
      // Set curve track creation state
      if (es.curveTrackCreation) {
        // Second right-click: complete the track creation
        es.setCurveTrackCreation(null);
      } else {
        es.setCurveTrackCreation({ fromNoteIndex: hitIdx });
      }
    }
  }, [getCanvasCoords, hitTestNote]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor: activeTool.startsWith("place_")
          ? "crosshair"
          : activeTool === "eraser"
            ? "not-allowed"
            : "default",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}

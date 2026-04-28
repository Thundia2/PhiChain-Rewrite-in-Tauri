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
import { UnrolledRenderer, effectiveGutterWidth, EVENT_DIAMOND_HIT_RADIUS, EVENT_GUTTER_EXTRA } from "../../canvas/unrolledRenderer";
import type { UnrolledOverlayLine } from "../../canvas/unrolledRenderer";
import { BEAT_GUTTER_WIDTH } from "../../constants/canvasConstants";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat } from "../../types/chart";
import { snapBeat, floatToBeat } from "../../utils/beat";
import { snapX } from "../../utils/xSnap";
import { placeEventAtBeats } from "../../utils/quickEventCreate";
import { EVENT_TOOL_TO_KIND } from "../../types/editor";
import type { NoteKind, Beat, LineEventKind } from "../../types/chart";

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
// Event placement drag state — tracks the click+drag flow that
// creates a constant event on mousedown and live-updates its
// `end_beat` as the user drags. Mirrors the `hold_placement` drag
// in UnifiedCanvas.tsx (see plan tingly-napping-crayon.md §5).
// ============================================================
interface EventPlacementDragState {
  lineIndex: number;
  /** Index in line.events. Stable across the drag because end_beat
   *  edits don't re-sort (sort is by start_beat). */
  eventIndex: number;
  /** Click beat — the immutable lower bound of the event. */
  startBeat: number;
  kind: LineEventKind;
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
  const eventPlacementDragRef = useRef<EventPlacementDragState | null>(null);

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

      const ss = useSettingsStore.getState();
      renderer.render({
        notes: line.notes,
        curveNoteTracks: line.curve_note_tracks,
        currentBeat,
        zoom: es.timelineZoom,
        density: es.density,
        verticalLines: es.verticalLines,
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
        onsetOpacity: ss.onsetOpacity,
        // ---- Events ----
        // Pass the active line's flat events. Future enhancement: when
        // es.eventEditorActiveLayer >= 0 and line.event_layers exists,
        // merge that layer's five sub-arrays the same way KeyframeBar
        // does (so this view stays in sync with the active layer pill).
        events: line.events,
        selectedEventIndices: es.selectedEventIndices,
        noteVisibility: es.unrolledNoteVisibility,
        eventVisibility: es.unrolledEventVisibility,
        showEventSpanTints: ss.unrolledShowEventSpanTints,
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

  /**
   * Effective gutter width — must match what the renderer uses or
   * note hit-tests skew left/right by EVENT_GUTTER_EXTRA pixels.
   * Reads `unrolledEventVisibility` directly via getState so the
   * value is always current (not memoised against a stale snapshot).
   */
  const getGutterWidth = useCallback((): number => {
    return effectiveGutterWidth(useEditorStore.getState().unrolledEventVisibility);
  }, []);

  /**
   * Find the note index under the given pixel coords, or -1.
   * Returns -1 unconditionally when notes are ghosted/hidden so the
   * "ghost = no misclicks" contract holds.
   */
  const hitTestNote = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    if (es.unrolledNoteVisibility !== "all") return -1;
    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { w, h } = getCanvasSize();
    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w, getGutterWidth());
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
  }, [getCanvasSize, getGutterWidth, getLineIndex, getScrollBeat]);

  /** Check if px,py hits a hold note's tail handle. Returns the note index or -1. */
  const hitTestHoldTail = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    if (es.unrolledNoteVisibility !== "all") return -1;
    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { w, h } = getCanvasSize();
    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w, getGutterWidth());
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
  }, [getCanvasSize, getGutterWidth, getLineIndex, getScrollBeat]);

  /**
   * Find an event diamond under the cursor and return its index in
   * line.events, or -1. Only fires when events are interactive
   * (visibility === "all"). The horizontal stack rules MUST mirror
   * the renderer's drawEventGutterMarkers — events at the same
   * start_beat occupy successive 9-px-wide slots.
   */
  const hitTestEventMarker = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    if (es.unrolledEventVisibility !== "all") return -1;
    // Only the gutter zone is interactive; ignore clicks in note area.
    if (px < BEAT_GUTTER_WIDTH || px > BEAT_GUTTER_WIDTH + EVENT_GUTTER_EXTRA) return -1;

    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { h } = getCanvasSize();
    const scrollBeat = getScrollBeat();

    const innerStart = BEAT_GUTTER_WIDTH + 3;
    const colWidth = (EVENT_GUTTER_EXTRA - 4) / 2;

    // Group by start_beat the same way the renderer does, in iteration
    // order, so slot indices line up with diamond positions.
    const byBeat = new Map<number, number[]>();
    for (let i = 0; i < line.events.length; i++) {
      const sb = beatToFloat(line.events[i].start_beat);
      const list = byBeat.get(sb);
      if (list) list.push(i); else byBeat.set(sb, [i]);
    }

    for (const [beat, idxList] of byBeat) {
      const y = UnrolledRenderer.beatToY(beat, scrollBeat, es.timelineZoom, h);
      if (Math.abs(py - y) > EVENT_DIAMOND_HIT_RADIUS) continue;
      for (let slot = 0; slot < idxList.length; slot++) {
        const cx = innerStart + slot * colWidth + colWidth / 2;
        if (Math.abs(px - cx) <= EVENT_DIAMOND_HIT_RADIUS) {
          return idxList[slot];
        }
      }
    }
    return -1;
  }, [getCanvasSize, getLineIndex, getScrollBeat]);

  /**
   * Find an event whose boundary line in the *note area* falls under
   * the cursor. Returns the event index in line.events, or -1.
   *
   * Boundary lines are the prominent solid stroke at start_beat (drawn
   * by drawEventSpansAndBoundaries in unrolledRenderer). The dashed
   * end_beat line is intentionally NOT a hit target — it's a visual
   * cue, not a primary affordance.
   *
   * Picks the closest event when several stack on the same beat
   * (Math.abs distance tiebreak), so the click lands on whichever
   * boundary is visually nearest the cursor.
   *
   * Gated by event visibility — same as hitTestEventMarker — so
   * ghosted/hidden events stay non-interactive.
   */
  const BOUNDARY_HIT_RADIUS = 4;
  const hitTestEventBoundary = useCallback((px: number, py: number): number => {
    const es = useEditorStore.getState();
    if (es.unrolledEventVisibility !== "all") return -1;
    // Note area only — gutter clicks go through hitTestEventMarker.
    const noteAreaLeft = effectiveGutterWidth(es.unrolledEventVisibility);
    if (px < noteAreaLeft) return -1;

    const cs = useChartStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null) return -1;
    const line = cs.chart.lines[lineIdx];
    if (!line) return -1;

    const { h } = getCanvasSize();
    const scrollBeat = getScrollBeat();

    let bestIdx = -1;
    let bestDist = BOUNDARY_HIT_RADIUS + 1;
    for (let i = 0; i < line.events.length; i++) {
      const sb = beatToFloat(line.events[i].start_beat);
      const y = UnrolledRenderer.beatToY(sb, scrollBeat, es.timelineZoom, h);
      const d = Math.abs(py - y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
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

    const gutterWidth = getGutterWidth();
    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w, gutterWidth);
    const scrollBeat = getScrollBeat();
    const clickBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
    const clickNoteX = UnrolledRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);

    const tool = es.activeTool;

    // ---- Event marker click (select tool only): handled before notes
    // because the gutter zone never overlaps the note area, so this is
    // an early-out rather than a priority decision. Skipped when events
    // aren't interactive — hitTestEventMarker enforces that internally.
    if (tool === "select") {
      const evtIdx = hitTestEventMarker(x, y);
      if (evtIdx >= 0) {
        if (e.ctrlKey || e.metaKey) {
          es.toggleEventSelection(evtIdx);
        } else {
          es.setEventSelection([evtIdx]);
        }
        es.showFloatingInspector(
          e.clientX, e.clientY,
          es.selectedEventIndices.length > 1 ? "multi_event" : "event",
        );
        return;
      }
    }

    // ---- Place event tool: drag-define-duration flow ----
    // Click creates a constant event with default value at the click
    // beat with the minimum duration (1/density). Mouse-move then
    // drags `end_beat` live until release. Mirrors the unified hold-
    // placement flow (CanvasMouseHandlers.ts:310 → UnifiedCanvas.tsx:736).
    // MUST be checked BEFORE the generic `tool.startsWith("place_")`
    // branch below — `place_event_x`.startsWith("place_") is true.
    if (tool.startsWith("place_event_")) {
      if (es.unrolledEventVisibility !== "all") return;
      const kind = EVENT_TOOL_TO_KIND[tool];
      if (!kind) return;

      // Snap as a float (rounded to grid), not via snapBeat() which
      // returns a Beat tuple — placeEventAtBeats wants numbers and
      // the mousemove drag also operates on float beats.
      const safeDensity = es.density > 0 ? es.density : 1;
      const startBeat = Math.max(0, Math.round(clickBeat * safeDensity) / safeDensity);
      const minDuration = 1 / safeDensity;
      const endBeat = startBeat + minDuration;

      const eventIndex = placeEventAtBeats(lineIdx, kind, startBeat, endBeat);
      if (eventIndex < 0) return;

      // Select the new event so any keyframe-bar / inspector panels
      // that key off selection update immediately.
      es.setEventSelection([eventIndex]);

      eventPlacementDragRef.current = {
        lineIndex: lineIdx,
        eventIndex,
        startBeat,
        kind,
      };
      return;
    }

    // ---- Place tool: place a note ----
    // Note-editing tools no-op when notes aren't interactive. Placing
    // a note that you can't see (visibility ghost/none) would be a
    // misclick magnet, so we just return — the cursor changes to
    // not-allowed in the container style.
    if (tool.startsWith("place_")) {
      if (es.unrolledNoteVisibility !== "all") return;
      const kind = tool.replace("place_", "") as NoteKind;
      const snappedBeat = snapBeat(clickBeat, es.density);
      const snappedX = es.xSnapEnabled ? snapX(clickNoteX, es.verticalLines) : Math.round(clickNoteX);
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
    // Same gating: hitTestNote returns -1 when notes aren't interactive,
    // so the eraser becomes a silent no-op rather than missing notes
    // that the user can faintly see in ghost mode.
    if (tool === "eraser") {
      if (es.unrolledNoteVisibility !== "all") return;
      const hitIdx = hitTestNote(x, y);
      if (hitIdx >= 0) {
        cs.removeNotes(lineIdx, [hitIdx]);
      }
      return;
    }

    // ---- Select tool ----
    if (tool === "select") {
      // Check if clicking a hold tail handle first (for resize).
      // hitTestHoldTail/hitTestNote both return -1 when notes are
      // ghosted/hidden, so this falls through to drag-selection.
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

      // Check if clicking on an event boundary line in the note area.
      // Sits AFTER note hit-test so notes win when they coincide with
      // an event start beat — boundaries span the full width and are
      // a coarse-grained hit zone, notes are point-targets.
      const boundaryIdx = hitTestEventBoundary(x, y);
      if (boundaryIdx >= 0) {
        if (e.ctrlKey || e.metaKey) {
          es.toggleEventSelection(boundaryIdx);
        } else {
          es.setEventSelection([boundaryIdx]);
        }
        es.showFloatingInspector(
          e.clientX, e.clientY,
          es.selectedEventIndices.length > 1 ? "multi_event" : "event",
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
  }, [getCanvasCoords, getCanvasSize, getGutterWidth, hitTestNote, hitTestHoldTail, hitTestEventMarker, hitTestEventBoundary, getLineIndex, getScrollBeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e);
    const { w, h } = getCanvasSize();

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const ss = useSettingsStore.getState();
    const lineIdx = getLineIndex();
    if (lineIdx === null || !cs.isLoaded) return;

    const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w, getGutterWidth());
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
        ? snapX(drag.originalNotes[0].x + deltaX, es.verticalLines) - drag.originalNotes[0].x
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

    // ---- Event placement drag ----
    // Live-update the in-progress event's `end_beat` as the cursor
    // moves. Snapped to density grid and clamped so duration is
    // always >= 1/density (no zero-length or backward events).
    if (eventPlacementDragRef.current) {
      const drag = eventPlacementDragRef.current;
      const safeDensity = es.density > 0 ? es.density : 1;
      const cursorBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
      const snappedCursor = Math.round(cursorBeat * safeDensity) / safeDensity;
      const minDuration = 1 / safeDensity;
      const newEnd = Math.max(drag.startBeat + minDuration, snappedCursor);

      // Read the current event to avoid clobbering other fields and
      // to skip writes when end_beat hasn't actually changed (cuts
      // history churn during smooth drags).
      const line = cs.chart.lines[drag.lineIndex];
      const evt = line?.events[drag.eventIndex];
      if (evt && Math.abs(beatToFloat(evt.end_beat) - newEnd) > 1e-9) {
        cs.editEvent(drag.lineIndex, drag.eventIndex, { end_beat: floatToBeat(newEnd) });
      }
      return;
    }

    // ---- Drag selection ----
    if (dragSelectStartRef.current) {
      const start = dragSelectStartRef.current;
      es.setDragSelectionRect({ x1: start.x, y1: start.y, x2: x, y2: y });
      return;
    }

    // ---- Ghost/pending note preview (place tool active) ----
    // Note-only — `place_event_*` is excluded explicitly because it
    // shares the `place_` prefix but draws no ghost (events are
    // committed live on mousedown, see drag block above).
    const isNotePlaceTool =
      es.activeTool.startsWith("place_") && !es.activeTool.startsWith("place_event_");
    if (isNotePlaceTool && es.unrolledNoteVisibility === "all") {
      const kind = es.activeTool.replace("place_", "") as NoteKind;
      const clickBeat = UnrolledRenderer.yToBeat(y, scrollBeat, es.timelineZoom, h);
      const clickNoteX = UnrolledRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);
      const snappedBeat = snapBeat(clickBeat, es.density);
      const snappedX = es.xSnapEnabled ? snapX(clickNoteX, es.verticalLines) : Math.round(clickNoteX);
      const above = e.shiftKey ? !ss.unrolledDefaultAbove : ss.unrolledDefaultAbove;

      es.setPendingNote({
        beat: snappedBeat,
        x: snappedX,
        kind,
        above,
      });
    } else if (es.pendingNote && (!isNotePlaceTool || es.unrolledNoteVisibility !== "all")) {
      // Clear any stale ghost when notes get hidden mid-hover, or
      // when the tool changed away from a note place tool.
      es.setPendingNote(null);
    }
  }, [getCanvasCoords, getCanvasSize, getGutterWidth, getLineIndex, getScrollBeat]);

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

    // ---- Finalize event placement ----
    // The event was created on mousedown and `end_beat` was edited
    // live during mousemove, so there's nothing to commit here. Just
    // pop the FloatingInspector so the user can immediately edit the
    // value (color, text, or numeric default).
    if (eventPlacementDragRef.current) {
      eventPlacementDragRef.current = null;
      es.showFloatingInspector(e.clientX, e.clientY, "event");
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
      const { noteAreaLeft, noteAreaWidth } = UnrolledRenderer.getNoteAreaBounds(w, getGutterWidth());
      const line = cs.chart.lines[lineIdx];
      if (!line) return;

      const minX = Math.min(rect.x1, rect.x2);
      const maxX = Math.max(rect.x1, rect.x2);
      const minY = Math.min(rect.y1, rect.y2);
      const maxY = Math.max(rect.y1, rect.y2);
      const scrollBeat = getScrollBeat();

      // Notes — only when notes are interactive. In ghost/none mode the
      // rect still drew (visual feedback), but committing to a note
      // selection would defeat the misclick guard.
      const selectedNotes: number[] = [];
      if (es.unrolledNoteVisibility === "all") {
        for (let i = 0; i < line.notes.length; i++) {
          const note = line.notes[i];
          const beat = beatToFloat(note.beat);
          const ny = UnrolledRenderer.beatToY(beat, scrollBeat, es.timelineZoom, h);
          const nx = UnrolledRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);
          if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
            selectedNotes.push(i);
          }
        }
      }

      // Events — only when events are interactive. Boundary lines span
      // the full note area width, so X is irrelevant; an event is in
      // the rect if its start_beat Y position is within [minY, maxY].
      const selectedEvents: number[] = [];
      if (es.unrolledEventVisibility === "all") {
        for (let i = 0; i < line.events.length; i++) {
          const sb = beatToFloat(line.events[i].start_beat);
          const ey = UnrolledRenderer.beatToY(sb, scrollBeat, es.timelineZoom, h);
          if (ey >= minY && ey <= maxY) {
            selectedEvents.push(i);
          }
        }
      }

      // Mutual-exclusion in editorStore (setNoteSelection clears events
      // and vice versa) means we have to pick one — notes win when both
      // are present, since notes are point-targets while event boundary
      // lines span the full width and are easier to accidentally include.
      // Events-only rects (drag through an event-region with no notes)
      // now select the events, addressing the "drag-select can't pick
      // events" bug the user reported.
      if (selectedNotes.length > 0) {
        es.setNoteSelection(selectedNotes);
        es.showFloatingInspector(
          e.clientX, e.clientY,
          selectedNotes.length > 1 ? "multi_note" : "note",
        );
      } else if (selectedEvents.length > 0) {
        es.setEventSelection(selectedEvents);
        es.showFloatingInspector(
          e.clientX, e.clientY,
          selectedEvents.length > 1 ? "multi_event" : "event",
        );
      }
    }
  }, [getCanvasSize, getGutterWidth, getLineIndex, getScrollBeat]);

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

  // ---- Context menu (right-click) ----
  // Two distinct flows depending on what's under the cursor:
  //   - Event marker → select event + open FloatingInspector ("event" target).
  //   - Note         → toggle curve-track creation.
  // Both gated by their visibility — ghosted/hidden layers ignore right-click.
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const es = useEditorStore.getState();

    // Event marker first — gutter zone never overlaps the note area.
    const evtIdx = hitTestEventMarker(x, y);
    if (evtIdx >= 0) {
      es.setEventSelection([evtIdx]);
      es.showFloatingInspector(e.clientX, e.clientY, "event");
      return;
    }

    // Note path — preserves the existing curve-track creation flow.
    const hitIdx = hitTestNote(x, y);
    if (hitIdx >= 0) {
      if (es.curveTrackCreation) {
        // Second right-click: complete the track creation
        es.setCurveTrackCreation(null);
      } else {
        es.setCurveTrackCreation({ fromNoteIndex: hitIdx });
      }
    }
  }, [getCanvasCoords, hitTestNote, hitTestEventMarker]);

  // Subscribe to noteVisibility so the cursor reflects the current
  // gating state without needing a force re-render trick.
  const noteVisibility = useEditorStore((s) => s.unrolledNoteVisibility);
  const eventVisibility = useEditorStore((s) => s.unrolledEventVisibility);

  // Cursor reflects whether the active tool can actually do its job:
  //   place_event_*  → gated by event visibility
  //   place_*        → gated by note visibility
  //   eraser         → not-allowed always (its own affordance)
  //   else           → default
  const isEventPlace = activeTool.startsWith("place_event_");
  const isNotePlace = activeTool.startsWith("place_") && !isEventPlace;
  const cursor = isEventPlace
    ? (eventVisibility === "all" ? "crosshair" : "not-allowed")
    : isNotePlace
      ? (noteVisibility === "all" ? "crosshair" : "not-allowed")
      : activeTool === "eraser"
        ? "not-allowed"
        : "default";

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor,
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

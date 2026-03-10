// ============================================================
// Timeline Component
//
// The central editing workspace. Renders notes and events on a
// scrollable canvas. Handles:
//   - Scroll to seek (vertical scroll adjusts the view)
//   - Ctrl+scroll to zoom
//   - Click to select notes/events
//   - Click to place notes when a placement tool is active
//   - Drag selection (box select)
//   - Hold note resize (drag handles)
//   - Pending/ghost note preview
//   - Right-click context menu (curve note tracks)
// ============================================================

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { TimelineRenderer, BASE_PX_PER_BEAT } from "../../canvas/timelineRenderer";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat, CANVAS_WIDTH } from "../../types/chart";
import { snapBeat } from "../../utils/beat";
import type { NoteKind } from "../../types/chart";
import type { EditorTool } from "../../types/editor";

/** Extra beats of padding beyond the last content */
const SCROLL_PADDING_BEATS = 8;

/** Map placement tools to note kinds */
function toolToNoteKind(tool: EditorTool): NoteKind | null {
  switch (tool) {
    case "place_tap": return "tap";
    case "place_drag": return "drag";
    case "place_flick": return "flick";
    case "place_hold": return "hold";
    default: return null;
  }
}

export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const [scrollBeat, setScrollBeat] = useState(0);

  // Drag selection refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Hold resize refs
  const isResizingRef = useRef(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteIdx: number } | null>(null);

  // Store subscriptions for reactive rendering
  const chart = useChartStore((s) => s.chart);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const zoom = useEditorStore((s) => s.timelineZoom);
  const density = useEditorStore((s) => s.density);
  const lanes = useEditorStore((s) => s.lanes);
  const noteSideFilter = useEditorStore((s) => s.noteSideFilter);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const audioDuration = useAudioStore((s) => s.duration);

  const maxBeat = useMemo(() => {
    const bl = new BpmList(chart.bpm_list);
    if (audioDuration > 0) {
      return bl.beatAtFloat(audioDuration) + SCROLL_PADDING_BEATS;
    }
    let latest = 0;
    for (const line of chart.lines) {
      for (const note of line.notes) {
        const b = beatToFloat(note.beat);
        latest = Math.max(latest, note.hold_beat ? b + beatToFloat(note.hold_beat) : b);
      }
      for (const ev of line.events) {
        const eb = beatToFloat(ev.end_beat);
        if (eb < 999) latest = Math.max(latest, eb);
      }
    }
    return Math.max(latest + SCROLL_PADDING_BEATS, 16);
  }, [chart.bpm_list, chart.lines, audioDuration]);

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
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  // ---- Initialize ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    rendererRef.current = new TimelineRenderer(ctx);
    resizeCanvas();
    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container) {
      observer = new ResizeObserver(() => resizeCanvas());
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
      const { chart: c } = useChartStore.getState();
      const { currentTime } = useAudioStore.getState();
      const es = useEditorStore.getState();
      if (bpmListDataRef.current !== c.bpm_list) {
        bpmListDataRef.current = c.bpm_list;
        bpmListRef.current = new BpmList(c.bpm_list);
      }
      const bpmList = bpmListRef.current!;
      const currentBeat = bpmList.beatAtFloat(currentTime - c.offset);

      // Auto-follow: scroll to keep current beat in view during playback
      const { isPlaying } = useAudioStore.getState();
      if (isPlaying && useSettingsStore.getState().timelineFollowPlayback) {
        const pxPerBeat = BASE_PX_PER_BEAT * es.timelineZoom;
        const visibleBeats = rect.height / pxPerBeat;
        const targetScroll = currentBeat - visibleBeats * 0.35;
        setScrollBeat(Math.max(0, Math.min(targetScroll, maxBeatRef.current)));
      }

      const line = es.selectedLineIndex !== null ? c.lines[es.selectedLineIndex] : null;

      renderer.render({
        notes: line?.notes ?? [],
        events: line?.events ?? [],
        curveNoteTracks: line?.curve_note_tracks ?? [],
        currentBeat,
        zoom: es.timelineZoom,
        density: es.density,
        lanes: es.lanes,
        noteSideFilter: es.noteSideFilter,
        selectedNoteIndices: es.selectedNoteIndices,
        scrollBeat: scrollBeatRef.current,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
        dragSelectionRect: es.dragSelectionRect,
        pendingNote: es.pendingNote,
      });

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const scrollBeatRef = useRef(scrollBeat);
  scrollBeatRef.current = scrollBeat;

  const maxBeatRef = useRef(maxBeat);
  maxBeatRef.current = maxBeat;

  // ---- Scroll handling ----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.002;
      const es = useEditorStore.getState();
      useEditorStore.getState().setTimelineZoom(es.timelineZoom + delta);
    } else {
      const invert = useSettingsStore.getState().invertScrollDirection;
      const pxPerBeat = BASE_PX_PER_BEAT * useEditorStore.getState().timelineZoom;
      const rawDelta = e.deltaY / pxPerBeat;
      const beatDelta = invert ? -rawDelta : rawDelta;
      setScrollBeat((prev) => Math.max(0, Math.min(prev + beatDelta, maxBeatRef.current)));
    }
  }, []);

  // ---- Mouse down (start drag selection or click) ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setContextMenu(null);

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const line = es.selectedLineIndex !== null ? cs.chart.lines[es.selectedLineIndex] : null;
    if (!line || es.selectedLineIndex === null) return;

    const clickBeat = TimelineRenderer.yToBeat(y, scrollBeatRef.current, es.timelineZoom, rect.height);
    const { noteAreaLeft, noteAreaWidth } = TimelineRenderer.getNoteAreaBounds(rect.width);

    // Check if clicking on note area (potential drag selection start)
    if (x >= noteAreaLeft && x < noteAreaLeft + noteAreaWidth) {
      const noteKind = toolToNoteKind(es.activeTool);

      // If placement tool active, place immediately
      if (noteKind) {
        const noteX = TimelineRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);
        const snappedBeat = snapBeat(clickBeat, es.density);
        cs.addNote(es.selectedLineIndex, {
          kind: noteKind,
          above: true,
          beat: snappedBeat,
          x: Math.round(noteX),
          speed: 1,
          ...(noteKind === "hold" ? { hold_beat: [1, 0, 1] as [number, number, number] } : {}),
        });
        return;
      }

      // Check for note hit
      const hitRadius = 12;
      let closestIdx = -1;
      let closestDist = Infinity;

      line.notes.forEach((note, idx) => {
        const noteBeat = beatToFloat(note.beat);
        const noteY = TimelineRenderer.beatToY(noteBeat, scrollBeatRef.current, es.timelineZoom, rect.height);
        const notePixelX = TimelineRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);
        const dx = x - notePixelX;
        const dy = y - noteY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitRadius && dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      // Eraser tool
      if (es.activeTool === "eraser") {
        if (closestIdx >= 0) {
          cs.removeNotes(es.selectedLineIndex, [closestIdx]);
        }
        return;
      }

      // Select tool - click on note
      if (closestIdx >= 0) {
        if (e.ctrlKey || e.metaKey) {
          es.toggleNoteSelection(closestIdx);
        } else {
          es.setNoteSelection([closestIdx]);
        }
        return;
      }

      // No note hit - start drag selection
      isDraggingRef.current = true;
      dragStartRef.current = { x, y };
      if (!e.ctrlKey && !e.metaKey) {
        es.clearSelection();
      }
      return;
    }
  }, []);

  // ---- Mouse move (drag selection + pending note) ----
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const es = useEditorStore.getState();

    // Update drag selection rectangle
    if (isDraggingRef.current) {
      es.setDragSelectionRect({
        x1: dragStartRef.current.x,
        y1: dragStartRef.current.y,
        x2: x,
        y2: y,
      });
      return;
    }

    // Update pending note for ghost preview
    const { noteAreaLeft, noteAreaWidth } = TimelineRenderer.getNoteAreaBounds(rect.width);
    const noteKind = toolToNoteKind(es.activeTool);

    if (noteKind && x >= noteAreaLeft && x < noteAreaLeft + noteAreaWidth) {
      const clickBeat = TimelineRenderer.yToBeat(y, scrollBeatRef.current, es.timelineZoom, rect.height);
      const snappedBeat = snapBeat(clickBeat, es.density);
      const noteX = TimelineRenderer.pixelToNoteX(x, noteAreaLeft, noteAreaWidth);
      es.setPendingNote({ beat: snappedBeat, x: Math.round(noteX), kind: noteKind, above: true });
    } else {
      if (es.pendingNote) es.setPendingNote(null);
    }
  }, []);

  // ---- Mouse up (finish drag selection) ----
  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const dragRect = es.dragSelectionRect;
    es.setDragSelectionRect(null);

    if (!dragRect || es.selectedLineIndex === null) return;
    const line = cs.chart.lines[es.selectedLineIndex];
    if (!line) return;

    // Find notes within the drag rectangle
    const minX = Math.min(dragRect.x1, dragRect.x2);
    const maxX = Math.max(dragRect.x1, dragRect.x2);
    const minY = Math.min(dragRect.y1, dragRect.y2);
    const maxY = Math.max(dragRect.y1, dragRect.y2);

    // If the drag distance is too small, treat as a click (clear selection)
    if (Math.abs(dragRect.x2 - dragRect.x1) < 5 && Math.abs(dragRect.y2 - dragRect.y1) < 5) {
      return;
    }

    const { noteAreaLeft, noteAreaWidth } = TimelineRenderer.getNoteAreaBounds(rect.width);
    const selected: number[] = [];

    line.notes.forEach((note, idx) => {
      const noteBeat = beatToFloat(note.beat);
      const noteY = TimelineRenderer.beatToY(noteBeat, scrollBeatRef.current, es.timelineZoom, rect.height);
      const notePixelX = TimelineRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);

      if (notePixelX >= minX && notePixelX <= maxX && noteY >= minY && noteY <= maxY) {
        selected.push(idx);
      }
    });

    if (selected.length > 0) {
      es.setNoteSelection(selected);
    }
  }, []);

  // ---- Mouse leave ----
  const handleMouseLeave = useCallback(() => {
    const es = useEditorStore.getState();
    if (es.pendingNote) es.setPendingNote(null);
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      es.setDragSelectionRect(null);
    }
  }, []);

  // ---- Right-click context menu ----
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    const line = es.selectedLineIndex !== null ? cs.chart.lines[es.selectedLineIndex] : null;
    if (!line || es.selectedLineIndex === null) return;

    const clickBeat = TimelineRenderer.yToBeat(y, scrollBeatRef.current, es.timelineZoom, rect.height);
    const { noteAreaLeft, noteAreaWidth } = TimelineRenderer.getNoteAreaBounds(rect.width);

    // Find nearest note
    const hitRadius = 16;
    let closestIdx = -1;
    let closestDist = Infinity;

    line.notes.forEach((note, idx) => {
      const noteBeat = beatToFloat(note.beat);
      const noteY = TimelineRenderer.beatToY(noteBeat, scrollBeatRef.current, es.timelineZoom, rect.height);
      const notePixelX = TimelineRenderer.noteXToPixel(note.x, noteAreaLeft, noteAreaWidth);
      const dx = x - notePixelX;
      const dy = y - noteY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRadius && dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx >= 0) {
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, noteIdx: closestIdx });
    }
  }, []);

  // ---- Context menu actions ----
  const handleStartCurveTrack = useCallback(() => {
    if (!contextMenu) return;
    const es = useEditorStore.getState();
    es.setCurveTrackCreation({ fromNoteIndex: contextMenu.noteIdx });
    setContextMenu(null);
  }, [contextMenu]);

  const handleCompleteCurveTrack = useCallback(() => {
    if (!contextMenu) return;
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (!es.curveTrackCreation || es.selectedLineIndex === null) return;

    cs.addCurveNoteTrack(es.selectedLineIndex, {
      from: es.curveTrackCreation.fromNoteIndex,
      to: contextMenu.noteIdx,
      options: { density: 4, kind: "drag", curve: "linear" },
    });
    es.setCurveTrackCreation(null);
    setContextMenu(null);
  }, [contextMenu]);

  const hasLine = selectedLineIndex !== null && chart.lines.length > 0;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: "#16213e" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />
      {!hasLine && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a line to edit
          </span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-50 rounded shadow-lg py-1 text-xs"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            minWidth: 160,
          }}
        >
          {useEditorStore.getState().curveTrackCreation ? (
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-white/10"
              style={{ color: "var(--text-primary)" }}
              onClick={handleCompleteCurveTrack}
            >
              End Curve Track Here
            </button>
          ) : (
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-white/10"
              style={{ color: "var(--text-primary)" }}
              onClick={handleStartCurveTrack}
            >
              Start Curve Track From Here
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setContextMenu(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

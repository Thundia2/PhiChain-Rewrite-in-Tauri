// ============================================================
// Keyframe Bar — Bottom bar for the Unified Editor
//
// 2-row layout:
//   Row 1 (28px): KEYFRAMES label + Layer pills + Lane badges + Zoom
//   Row 2: Multi-property keyframe diamond strip
//
// Diamond interactions:
//   - Click diamond to select event
//   - Right-click diamond for context menu (Delete, Change Easing)
//   - Double-click empty lane area to create new constant event
//   - Click empty area to seek
//   - Scroll to pan, Ctrl+scroll to zoom
//
// Ported from QuickActionBar, EventEditorToolbar, and KeyframeStrip.
// ============================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAudioStore } from "../../stores/audioStore";
import { useGroupStore } from "../../stores/groupStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import type { Bookmark } from "../../types/bookmark";
import { BpmList } from "../../utils/bpmList";
import { beatToFloat, floatToBeat } from "../../types/chart";
import type { Beat, LineEvent, LineEventKind, EasingType } from "../../types/chart";
import { EVENT_COLORS } from "../../constants/eventColors";
import { EASING_OPTIONS } from "../common/FormFields";
import { KeyframeBarHeader } from "./KeyframeBarHeader";
import { CurveGraph } from "./CurveGraph";
import { PopoutCurveEditor } from "./PopoutCurveEditor";

function CurveEditorResizeHandle() {
  const setCurveEditorHeight = useEditorStore((s) => s.setCurveEditorHeight);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = useEditorStore.getState().curveEditorHeight;

    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      setCurveEditorHeight(Math.max(150, Math.min(500, startHeight + delta)));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [setCurveEditorHeight]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        height: 4,
        cursor: "row-resize",
        backgroundColor: "var(--border-color)",
        flexShrink: 0,
      }}
    />
  );
}

// ============================================================
// Constants
// ============================================================

const KIND_SHORT: Record<string, string> = {
  x: "X", y: "Y", rotation: "R", opacity: "O", speed: "S",
  scale_x: "SX", scale_y: "SY", color: "C", text: "T", incline: "I", gif: "GIF",
};

const CORE_KINDS: LineEventKind[] = ["x", "y", "rotation", "opacity", "speed"];

const DIAMOND_SIZE = 5;
const DIAMOND_HIT_RADIUS = 7; // slightly larger than render for easier clicking

/** Default constant values when creating new events */
const DEFAULT_VALUES: Record<string, number> = {
  x: 0, y: 0, rotation: 0, opacity: 255, speed: 1,
  scale_x: 1, scale_y: 1, incline: 0, gif: 0,
};

// ============================================================
// Context menu types
// ============================================================

interface DiamondHit {
  kind: LineEventKind;
  eventIndex: number; // index within the flat events or layer events of that kind
  globalEventIndex: number; // index within displayEvents
  event: LineEvent;
}

interface ContextMenuState {
  x: number;
  y: number;
  hit?: DiamondHit;
  bookmarkHit?: Bookmark;
  showEasingSubmenu: boolean;
}

// ============================================================
// Component
// ============================================================

export function KeyframeBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isDragging = useRef(false);

  // Viewport state for the diamond strip
  const [viewStart, setViewStart] = useState(0);
  const [viewRange, setViewRange] = useState(16);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Double-click detection
  const lastClickTime = useRef(0);
  const lastClickX = useRef(0);
  const lastClickY = useRef(0);

  // ---- Store subscriptions ----
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const activeLayer = useEditorStore((s) => s.eventEditorActiveLayer);
  const setActiveLayer = useEditorStore((s) => s.setEventEditorActiveLayer);
  const inspectorOpen = useEditorStore((s) => s.unifiedInspectorOpen);
  const toggleInspector = useEditorStore((s) => s.toggleUnifiedInspector);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);

  const hasLayers = useChartStore((s) => {
    if (selectedLineIndex === null) return false;
    const line = s.chart.lines[selectedLineIndex];
    return line?.event_layers != null && line.event_layers.length > 0;
  });

  // ---- Coordinate conversion ----
  const beatToPixel = useCallback((beat: number, canvasWidth: number) => {
    return ((beat - viewStart) / viewRange) * canvasWidth;
  }, [viewStart, viewRange]);

  const pixelToBeat = useCallback((px: number, canvasWidth: number) => {
    return viewStart + (px / canvasWidth) * viewRange;
  }, [viewStart, viewRange]);

  // ---- Close context menu on outside click or Escape ----
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handleClose);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // ---- Compute display data for hit-testing (shared between render & interaction) ----
  const getDisplayData = useCallback(() => {
    const cs = useChartStore.getState();
    const es = useEditorStore.getState();
    const lineIdx = es.selectedLineIndex;
    if (lineIdx === null || lineIdx < 0 || lineIdx >= cs.chart.lines.length) return null;

    const line = cs.chart.lines[lineIdx];
    const layerIdx = es.eventEditorActiveLayer;
    const allKinds: LineEventKind[] = [
      "x", "y", "rotation", "opacity", "speed",
      "scale_x", "scale_y", "color", "text", "incline",
    ];

    let displayEvents: LineEvent[];
    if (layerIdx >= 0 && line.event_layers && line.event_layers[layerIdx]) {
      const layer = line.event_layers[layerIdx];
      displayEvents = [
        ...layer.move_x_events,
        ...layer.move_y_events,
        ...layer.rotate_events,
        ...layer.alpha_events,
        ...layer.speed_events,
      ];
    } else {
      displayEvents = line.events;
    }

    const activeKinds = allKinds.filter((kind) =>
      displayEvents.some((e) => e.kind === kind),
    );
    const kinds = [...new Set([...CORE_KINDS, ...activeKinds])];

    return { lineIdx, line, displayEvents, kinds, layerIdx };
  }, []);

  // ---- Diamond hit-testing ----
  const hitTestDiamond = useCallback((mouseX: number, mouseY: number): DiamondHit | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const data = getDisplayData();
    if (!data) return null;

    const { displayEvents, kinds } = data;
    const { height, width } = canvas;
    const laneHeight = (height - 14) / kinds.length;

    for (let ki = 0; ki < kinds.length; ki++) {
      const kind = kinds[ki];
      const cy = 4 + laneHeight * (ki + 0.5);

      // Check if mouse Y is within this lane
      if (Math.abs(mouseY - cy) > DIAMOND_HIT_RADIUS + laneHeight * 0.1) continue;

      const events = displayEvents.filter((e) => e.kind === kind);
      for (let ei = 0; ei < events.length; ei++) {
        const event = events[ei];
        const startBeat = beatToFloat(event.start_beat);
        const startPx = beatToPixel(startBeat, width);

        if (Math.abs(mouseX - startPx) <= DIAMOND_HIT_RADIUS) {
          // Find the global index in displayEvents
          const globalIdx = displayEvents.indexOf(event);
          // Find the index within that kind's events for layer-aware operations
          const kindEvents = displayEvents.filter((e) => e.kind === kind);
          const kindIdx = kindEvents.indexOf(event);

          return {
            kind,
            eventIndex: kindIdx,
            globalEventIndex: globalIdx,
            event,
          };
        }
      }
    }

    return null;
  }, [beatToPixel, getDisplayData]);

  // ---- Determine which kind lane a Y coordinate falls into ----
  const getKindAtY = useCallback((mouseY: number): LineEventKind | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const data = getDisplayData();
    if (!data) return null;

    const { kinds } = data;
    const laneHeight = (canvas.height - 14) / kinds.length;

    for (let ki = 0; ki < kinds.length; ki++) {
      const cy = 4 + laneHeight * (ki + 0.5);
      if (Math.abs(mouseY - cy) <= laneHeight * 0.5) {
        return kinds[ki];
      }
    }
    return null;
  }, [getDisplayData]);

  // ---- Bookmark hit-testing (triangles at top of strip) ----
  const hitTestBookmark = useCallback((mouseX: number, mouseY: number): Bookmark | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const es = useEditorStore.getState();
    const lineIdx = es.selectedLineIndex;
    if (lineIdx === null) return null;

    // Bookmarks are rendered as triangles in the top ~12px
    if (mouseY > 16) return null;

    const bmStore = useBookmarkStore.getState();
    const bmsForLine = bmStore.getBookmarksForLine(lineIdx);

    for (const bm of bmsForLine) {
      const bmBeat = bm.beat[0] + bm.beat[1] / bm.beat[2];
      const bmPx = beatToPixel(bmBeat, canvas.width);
      if (Math.abs(mouseX - bmPx) <= 6) {
        return bm;
      }
    }

    return null;
  }, [beatToPixel]);

  // ---- Diamond strip render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderFrame = () => {
      const container = canvasContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      const cs = useChartStore.getState();
      const es = useEditorStore.getState();
      const { currentTime } = useAudioStore.getState();

      const lineIdx = es.selectedLineIndex;
      if (lineIdx === null || lineIdx < 0 || lineIdx >= cs.chart.lines.length) {
        // No line selected — draw empty strip
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#141419";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Select a line to view events", canvas.width / 2, canvas.height / 2 + 4);

        rafRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const line = cs.chart.lines[lineIdx];
      const { width, height } = canvas;

      // ---- Clear ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#141419";
      ctx.fillRect(0, 0, width, height);

      // ---- Beat grid lines ----
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const startBeatFloor = Math.floor(viewStart);
      const endBeatCeil = Math.ceil(viewStart + viewRange);
      for (let b = startBeatFloor; b <= endBeatCeil; b++) {
        const px = beatToPixel(b, width);
        if (px < 0 || px > width) continue;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();

        // Beat number label (every 4 beats)
        if (b % 4 === 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.fillText(String(b), px, height - 2);
        }
      }

      // ---- Event keyframe diamonds (multi-property) ----
      const layerIdx = es.eventEditorActiveLayer;
      const allKinds: LineEventKind[] = [
        "x", "y", "rotation", "opacity", "speed",
        "scale_x", "scale_y", "color", "text", "incline",
      ];

      // ---- Group mode: collect events from all member lines ----
      const gs = useGroupStore.getState();
      const activeGroup = gs.getActiveGroup();

      // Tagged events: each event paired with its display color
      type TaggedEvent = { event: LineEvent; color: string; globalIdx: number };
      let displayEvents: LineEvent[];
      let taggedEvents: TaggedEvent[] | null = null;

      if (activeGroup && activeGroup.type === "line") {
        // Group mode: gather events from all member lines, filtered by visibleEventKinds
        const visibleKinds = new Set(activeGroup.visibleEventKinds);
        const memberColors = ["#ff6b6b", "#4dabf7", "#69db7c", "#ffd43b", "#da77f2", "#38d9a9", "#ffa94d", "#748ffc"];
        const allGroupEvents: TaggedEvent[] = [];
        const allGroupEventsRaw: LineEvent[] = [];

        for (let mi = 0; mi < activeGroup.lines.length; mi++) {
          const memberRef = activeGroup.lines[mi];
          const memberLine = cs.chart.lines[memberRef.lineIndex];
          if (!memberLine) continue;
          const memberColor = memberColors[mi % memberColors.length];

          for (const evt of memberLine.events) {
            if (!visibleKinds.has(evt.kind)) continue;
            const idx = allGroupEventsRaw.length;
            allGroupEventsRaw.push(evt);
            allGroupEvents.push({ event: evt, color: memberColor, globalIdx: idx });
          }
        }

        displayEvents = allGroupEventsRaw;
        taggedEvents = allGroupEvents;
      } else {
        // Normal mode: single line
        if (layerIdx >= 0 && line.event_layers && line.event_layers[layerIdx]) {
          const layer = line.event_layers[layerIdx];
          displayEvents = [
            ...layer.move_x_events,
            ...layer.move_y_events,
            ...layer.rotate_events,
            ...layer.alpha_events,
            ...layer.speed_events,
          ];
        } else {
          displayEvents = line.events;
        }
      }

      // Find which kinds have events (always show core 5)
      const activeKinds = allKinds.filter((kind) =>
        displayEvents.some((e) => e.kind === kind),
      );
      const kinds: LineEventKind[] = (activeGroup && activeGroup.type === "line")
        ? [...new Set([...activeGroup.visibleEventKinds, ...activeKinds])]
        : [...new Set([...CORE_KINDS, ...activeKinds])];
      const laneHeight = (height - 14) / kinds.length;

      // Selected event indices for highlight
      const selEvtIndices = new Set(es.selectedEventIndices);

      for (let ki = 0; ki < kinds.length; ki++) {
        const kind = kinds[ki];
        const cy = 4 + laneHeight * (ki + 0.5);
        const kindColor = EVENT_COLORS[kind] || "#888";

        // Kind label
        ctx.fillStyle = kindColor;
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "left";
        ctx.fillText(KIND_SHORT[kind] || kind.charAt(0).toUpperCase(), 3, cy + 3);

        // Draw keyframes — use tagged events in group mode for per-member coloring
        if (taggedEvents) {
          const kindTagged = taggedEvents.filter((t) => t.event.kind === kind);
          for (const tagged of kindTagged) {
            const startBeat = beatToFloat(tagged.event.start_beat);
            const endBeat = beatToFloat(tagged.event.end_beat);
            const startPx = beatToPixel(startBeat, width);
            const endPx = beatToPixel(endBeat, width);
            if (endPx < 0 || startPx > width) continue;

            const dColor = tagged.color;
            const isTransition = "transition" in tagged.event.value || "color_transition" in tagged.event.value;
            ctx.fillStyle = isTransition ? dColor + "30" : dColor + "15";
            const barStart = Math.max(startPx, 0);
            const barEnd = Math.min(endPx, width);
            ctx.fillRect(barStart, cy - laneHeight * 0.35, barEnd - barStart, laneHeight * 0.7);

            if (startPx >= -5 && startPx <= width + 5) {
              ctx.fillStyle = dColor;
              ctx.beginPath();
              ctx.moveTo(startPx, cy - DIAMOND_SIZE);
              ctx.lineTo(startPx + DIAMOND_SIZE, cy);
              ctx.lineTo(startPx, cy + DIAMOND_SIZE);
              ctx.lineTo(startPx - DIAMOND_SIZE, cy);
              ctx.closePath();
              ctx.fill();
            }
          }
        } else {
          // Normal mode rendering
          const events = displayEvents.filter((e) => e.kind === kind);
          for (const event of events) {
            const startBeat = beatToFloat(event.start_beat);
            const endBeat = beatToFloat(event.end_beat);
            const startPx = beatToPixel(startBeat, width);
            const endPx = beatToPixel(endBeat, width);

            // Cull off-screen events
            if (endPx < 0 || startPx > width) continue;

            // Check if this event is selected
            const globalIdx = displayEvents.indexOf(event);
            const isSelected = selEvtIndices.has(globalIdx);

            // Span bar
            const isTransition = "transition" in event.value || "color_transition" in event.value;
            ctx.fillStyle = isTransition ? kindColor + "30" : kindColor + "15";
            const barStart = Math.max(startPx, 0);
            const barEnd = Math.min(endPx, width);
            ctx.fillRect(barStart, cy - laneHeight * 0.35, barEnd - barStart, laneHeight * 0.7);

            // Start diamond
            if (startPx >= -5 && startPx <= width + 5) {
              // Selected highlight ring
              if (isSelected) {
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.moveTo(startPx, cy - DIAMOND_SIZE - 2);
                ctx.lineTo(startPx + DIAMOND_SIZE + 2, cy);
                ctx.lineTo(startPx, cy + DIAMOND_SIZE + 2);
                ctx.lineTo(startPx - DIAMOND_SIZE - 2, cy);
                ctx.closePath();
                ctx.fill();
              }

              ctx.fillStyle = isSelected ? "#ffffff" : kindColor;
              ctx.beginPath();
              ctx.moveTo(startPx, cy - DIAMOND_SIZE);
              ctx.lineTo(startPx + DIAMOND_SIZE, cy);
              ctx.lineTo(startPx, cy + DIAMOND_SIZE);
              ctx.lineTo(startPx - DIAMOND_SIZE, cy);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }

      // ---- Bookmark markers as colored triangles at the top ----
      const bmStore = useBookmarkStore.getState();
      const bmsForLine = bmStore.getBookmarksForLine(lineIdx);
      for (const bm of bmsForLine) {
        const bmBeat = bm.beat[0] + bm.beat[1] / bm.beat[2];
        const bmPx = beatToPixel(bmBeat, width);
        if (bmPx < -10 || bmPx > width + 10) continue;

        const isSelected = bmStore.selectedBookmarkIds.includes(bm.id);

        ctx.save();

        // Selected: draw a white outline ring and a vertical snap line
        if (isSelected) {
          // Vertical snap guide line
          ctx.strokeStyle = bm.color + "40";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(bmPx, 12);
          ctx.lineTo(bmPx, height);
          ctx.stroke();
          ctx.setLineDash([]);

          // White outline behind the triangle
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(bmPx, 11);
          ctx.lineTo(bmPx - 5, 2);
          ctx.lineTo(bmPx + 5, 2);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = bm.color;
        ctx.globalAlpha = isSelected ? 1.0 : 0.7;
        ctx.beginPath();
        ctx.moveTo(bmPx, 9);
        ctx.lineTo(bmPx - 3, 3);
        ctx.lineTo(bmPx + 3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ---- Playhead (current time) ----
      const bpmList = new BpmList(cs.chart.bpm_list);
      const curBeat = bpmList.beatAtFloat(currentTime - cs.chart.offset);
      const playheadPx = beatToPixel(curBeat, width);

      if (playheadPx >= 0 && playheadPx <= width) {
        ctx.strokeStyle = "#ff5555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadPx, 0);
        ctx.lineTo(playheadPx, height);
        ctx.stroke();

        // Playhead triangle
        ctx.fillStyle = "#ff5555";
        ctx.beginPath();
        ctx.moveTo(playheadPx - 5, 0);
        ctx.lineTo(playheadPx + 5, 0);
        ctx.lineTo(playheadPx, 6);
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [selectedLineIndex, viewStart, viewRange, beatToPixel, selectedEventIndices]);

  // ---- Seek to beat helper ----
  const seekToBeat = useCallback((beat: number) => {
    const cs = useChartStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const time = bpmList.timeAtFloat(beat) + cs.chart.offset;
    useAudioStore.getState().seek(time);
    useEditorStore.getState().setEventEditorBeat(beat);
  }, []);

  // ---- Click: diamond select or seek ----
  const handleStripMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Don't handle right-click here (context menu handles it)
    if (e.button === 2) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const now = Date.now();

    // ---- Double-click detection ----
    const isDoubleClick =
      now - lastClickTime.current < 350 &&
      Math.abs(mouseX - lastClickX.current) < 8 &&
      Math.abs(mouseY - lastClickY.current) < 8;

    lastClickTime.current = now;
    lastClickX.current = mouseX;
    lastClickY.current = mouseY;

    if (isDoubleClick) {
      // Double-click: create new constant event at this position
      handleDoubleClickCreate(mouseX, mouseY);
      return;
    }

    // ---- Single click: check bookmark hit first ----
    const bmHit = hitTestBookmark(mouseX, mouseY);
    if (bmHit) {
      const bmStore = useBookmarkStore.getState();
      if (e.ctrlKey || e.metaKey) {
        bmStore.toggleBookmarkSelection(bmHit.id);
      } else {
        bmStore.selectBookmark(bmHit.id);
      }
      // Snap/seek to bookmark beat
      const bmBeat = bmHit.beat[0] + bmHit.beat[1] / bmHit.beat[2];
      seekToBeat(bmBeat);
      return;
    }

    // ---- Single click: check diamond hit ----
    const hit = hitTestDiamond(mouseX, mouseY);
    if (hit) {
      // Select this event
      useEditorStore.getState().setEventSelection([hit.globalEventIndex]);

      // Seek to this event's beat
      const beat = beatToFloat(hit.event.start_beat);
      seekToBeat(beat);
      return;
    }

    // ---- Miss: seek to clicked beat, clear bookmark selection ----
    const beat = Math.max(0, pixelToBeat(mouseX, canvas.width));
    seekToBeat(beat);
    useEditorStore.getState().clearSelection();
    useBookmarkStore.getState().clearBookmarkSelection();

    isDragging.current = true;
  }, [pixelToBeat, hitTestDiamond, hitTestBookmark, seekToBeat]);

  // ---- Double-click: create new constant event ----
  const handleDoubleClickCreate = useCallback((mouseX: number, mouseY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const data = getDisplayData();
    if (!data) return;

    const kind = getKindAtY(mouseY);
    if (!kind) return;

    // Don't create color or text events via double-click (they need special value types)
    if (kind === "color" || kind === "text") return;

    const beat = Math.max(0, pixelToBeat(mouseX, canvas.width));
    const beatTuple: Beat = floatToBeat(beat, 32);
    const farBeat: Beat = floatToBeat(beat + 4, 32); // 4 beats duration

    const defaultVal = DEFAULT_VALUES[kind] ?? 0;

    const newEvent: LineEvent = {
      kind,
      start_beat: beatTuple,
      end_beat: farBeat,
      value: { constant: defaultVal },
    };

    const { lineIdx, layerIdx } = data;

    if (layerIdx >= 0) {
      // Layer-aware add
      useChartStore.getState().addEventToLayer(lineIdx, layerIdx, kind, newEvent);
    } else {
      useChartStore.getState().addEvent(lineIdx, newEvent);
    }

    // Seek to the new event's beat
    seekToBeat(beat);
  }, [pixelToBeat, getDisplayData, getKindAtY, seekToBeat]);

  // ---- Right-click: context menu ----
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check bookmark hit first
    const bmHit = hitTestBookmark(mouseX, mouseY);
    if (bmHit) {
      useBookmarkStore.getState().selectBookmark(bmHit.id);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        bookmarkHit: bmHit,
        showEasingSubmenu: false,
      });
      return;
    }

    const hit = hitTestDiamond(mouseX, mouseY);
    if (!hit) {
      setContextMenu(null);
      return;
    }

    // Select the hit event
    useEditorStore.getState().setEventSelection([hit.globalEventIndex]);

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hit,
      showEasingSubmenu: false,
    });
  }, [hitTestDiamond, hitTestBookmark]);

  // ---- Context menu actions ----
  const handleDeleteEvent = useCallback(() => {
    if (!contextMenu) return;
    const data = getDisplayData();
    if (!data) return;

    const { hit } = contextMenu;
    const { lineIdx, layerIdx } = data;

    if (layerIdx >= 0) {
      // Find the event index within its kind's layer events
      const line = data.line;
      if (line.event_layers && line.event_layers[layerIdx]) {
        const layer = line.event_layers[layerIdx];
        const kindFieldMap: Partial<Record<LineEventKind, LineEvent[]>> = {
          x: layer.move_x_events,
          y: layer.move_y_events,
          rotation: layer.rotate_events,
          opacity: layer.alpha_events,
          speed: layer.speed_events,
        };
        const kindEvents = kindFieldMap[hit.kind];
        if (kindEvents) {
          const idx = kindEvents.indexOf(hit.event);
          if (idx >= 0) {
            useChartStore.getState().removeEventsFromLayer(lineIdx, layerIdx, hit.kind, [idx]);
          }
        }
      }
    } else {
      // Flat events — find index in line.events
      const idx = data.line.events.indexOf(hit.event);
      if (idx >= 0) {
        useChartStore.getState().removeEvents(lineIdx, [idx]);
      }
    }

    useEditorStore.getState().clearSelection();
    setContextMenu(null);
  }, [contextMenu, getDisplayData]);

  const handleChangeEasing = useCallback((easing: EasingType) => {
    if (!contextMenu) return;
    const data = getDisplayData();
    if (!data) return;

    const { hit } = contextMenu;
    const { lineIdx, layerIdx } = data;
    const event = hit.event;

    // Build updated value with new easing
    let newValue = event.value;
    if ("transition" in event.value) {
      newValue = {
        transition: { ...event.value.transition, easing },
      };
    } else if ("color_transition" in event.value) {
      newValue = {
        color_transition: { ...event.value.color_transition, easing },
      };
    } else if ("constant" in event.value) {
      // Convert constant to transition with same start/end
      newValue = {
        transition: { start: event.value.constant, end: event.value.constant, easing },
      };
    } else if ("text_transition" in event.value) {
      newValue = {
        text_transition: { ...event.value.text_transition, easing },
      };
    } else {
      // Can't change easing on text_value or color_constant
      setContextMenu(null);
      return;
    }

    if (layerIdx >= 0) {
      const line = data.line;
      if (line.event_layers && line.event_layers[layerIdx]) {
        const layer = line.event_layers[layerIdx];
        const kindFieldMap: Partial<Record<LineEventKind, LineEvent[]>> = {
          x: layer.move_x_events,
          y: layer.move_y_events,
          rotation: layer.rotate_events,
          opacity: layer.alpha_events,
          speed: layer.speed_events,
        };
        const kindEvents = kindFieldMap[hit.kind];
        if (kindEvents) {
          const idx = kindEvents.indexOf(hit.event);
          if (idx >= 0) {
            useChartStore.getState().editEventInLayer(lineIdx, layerIdx, hit.kind, idx, { value: newValue });
          }
        }
      }
    } else {
      const idx = data.line.events.indexOf(hit.event);
      if (idx >= 0) {
        useChartStore.getState().editEvent(lineIdx, idx, { value: newValue });
      }
    }

    setContextMenu(null);
  }, [contextMenu, getDisplayData]);

  const handleStripMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const beat = Math.max(0, pixelToBeat(mouseX, canvas.width));
    seekToBeat(beat);
  }, [pixelToBeat, seekToBeat]);

  // ---- Strip scroll: pan + zoom ----
  const handleStripWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      setViewRange((prev) => Math.max(2, Math.min(200, prev * factor)));
    } else {
      const delta = (e.deltaY / 100) * (viewRange / 8);
      setViewStart((prev) => Math.max(-2, prev + delta));
    }
  }, [viewRange]);

  // Global mouse up
  useEffect(() => {
    const handler = () => { isDragging.current = false; };
    window.addEventListener("mouseup", handler);
    return () => window.removeEventListener("mouseup", handler);
  }, []);

  // Delete key to remove selected bookmarks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't intercept if user is typing in an input
        if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
        const bmStore = useBookmarkStore.getState();
        if (bmStore.selectedBookmarkIds.length > 0) {
          bmStore.deleteSelected();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-accent)",
        borderTop: "1px solid var(--border-color)",
        flexShrink: 0,
      }}
    >
      {/* ---- Row 1: Controls (28px) ---- */}
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 10px",
          borderBottom: "1px solid rgba(42, 42, 53, 0.4)",
          flexShrink: 0,
        }}
      >
        {/* Section label */}
        <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5, marginRight: 6 }}>
          KEYFRAMES
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: "var(--border-color)" }} />

        {/* Layer pills */}
        {hasLayers && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <button
                key={i}
                onClick={() => setActiveLayer(i)}
                style={{
                  padding: "2px 6px",
                  borderRadius: 6,
                  border: "none",
                  fontSize: 9,
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "all 0.15s",
                  background: activeLayer === i ? "var(--accent-primary)" : "transparent",
                  color: activeLayer === i ? "#fff" : "var(--text-secondary, #888)",
                  fontFamily: "inherit",
                }}
              >
                L{i}
              </button>
            ))}
            <button
              onClick={() => setActiveLayer(-1)}
              style={{
                padding: "2px 6px",
                borderRadius: 6,
                border: "none",
                fontSize: 9,
                cursor: "pointer",
                fontWeight: 500,
                transition: "all 0.15s",
                background: activeLayer === -1 ? "var(--accent-primary)" : "transparent",
                color: activeLayer === -1 ? "#fff" : "var(--text-secondary, #888)",
                fontFamily: "inherit",
              }}
            >
              Flat
            </button>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Event lane toggle badges */}
        <div style={{ display: "flex", gap: 3, marginRight: 4 }}>
          {CORE_KINDS.map((kind) => {
            const color = EVENT_COLORS[kind] || "#888";
            return (
              <div
                key={kind}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: `${color}25`,
                  border: `1px solid ${color}50`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 7,
                  fontWeight: 700,
                  color,
                  cursor: "pointer",
                }}
                title={`${kind} lane`}
              >
                {KIND_SHORT[kind] || kind.charAt(0).toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: "var(--border-color)" }} />

        {/* Zoom controls */}
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={() => setViewRange((prev) => Math.min(200, prev * 1.25))}
            title="Zoom out"
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            −
          </button>
          <button
            onClick={() => setViewRange((prev) => Math.max(2, prev * 0.8))}
            title="Zoom in"
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            +
          </button>
        </div>

        {/* Inspector toggle (when closed) */}
        {!inspectorOpen && (
          <button
            onClick={toggleInspector}
            style={{
              background: "none",
              border: "1px solid #333",
              borderRadius: 6,
              color: "#666",
              cursor: "pointer",
              fontSize: 9,
              padding: "2px 6px",
              fontFamily: "inherit",
            }}
          >
            Inspector {"\u25B8"}
          </button>
        )}

        {/* Close keyframe bar */}
        <button
          onClick={() => useEditorStore.getState().toggleKeyframeBar()}
          title="Close keyframe bar (K)"
          style={{
            background: "none",
            border: "none",
            color: "#555",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
            fontFamily: "inherit",
          }}
        >
          {"\u00D7"}
        </button>
      </div>

      {/* ---- Row 2: Diamond strip (64px) ---- */}
      <div
        ref={canvasContainerRef}
        style={{ flex: 1, position: "relative", cursor: "crosshair", overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          onMouseDown={handleStripMouseDown}
          onMouseMove={handleStripMouseMove}
          onWheel={handleStripWheel}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* ---- Curve Editor Header ---- */}
      <KeyframeBarHeader />

      {/* ---- Curve Graph (expanded, not popped out) ---- */}
      {useEditorStore.getState().curveEditorExpanded &&
        !useEditorStore.getState().curveEditorPoppedOut && (
        <>
          {/* Resize handle */}
          <CurveEditorResizeHandle />
          <CurveGraph />
        </>
      )}

      {/* ---- Pop-out portal ---- */}
      {useEditorStore.getState().curveEditorPoppedOut && <PopoutCurveEditor />}

      {/* ---- Context menu overlay ---- */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 4,
            padding: "4px 0",
            zIndex: 200,
            minWidth: 160,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {contextMenu.bookmarkHit ? (
            <>
              {/* Bookmark context menu */}
              <div style={{ padding: "4px 12px", fontSize: 10, color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                Bookmark {contextMenu.bookmarkHit.label || contextMenu.bookmarkHit.preset || ""}
              </div>
              <button
                onClick={() => {
                  if (!contextMenu.bookmarkHit) return;
                  // Snap to this bookmark
                  const bm = contextMenu.bookmarkHit;
                  const bmBeat = bm.beat[0] + bm.beat[1] / bm.beat[2];
                  seekToBeat(bmBeat);
                  setContextMenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "4px 12px",
                  background: "transparent",
                  border: "none",
                  color: "#ccc",
                  cursor: "pointer",
                  fontSize: 11,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
              >
                Snap to Bookmark
              </button>
              <div style={{ height: 1, background: "var(--border-color)", margin: "2px 0" }} />
              <button
                onClick={() => {
                  if (!contextMenu.bookmarkHit) return;
                  useBookmarkStore.getState().removeBookmark(contextMenu.bookmarkHit.id);
                  setContextMenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "4px 12px",
                  background: "transparent",
                  border: "none",
                  color: "#ff6b6b",
                  cursor: "pointer",
                  fontSize: 11,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
              >
                Delete Bookmark
              </button>
              {useBookmarkStore.getState().selectedBookmarkIds.length > 1 && (
                <button
                  onClick={() => {
                    useBookmarkStore.getState().deleteSelected();
                    setContextMenu(null);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "4px 12px",
                    background: "transparent",
                    border: "none",
                    color: "#ff6b6b",
                    cursor: "pointer",
                    fontSize: 11,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                >
                  Delete All Selected ({useBookmarkStore.getState().selectedBookmarkIds.length})
                </button>
              )}
            </>
          ) : contextMenu.hit ? (
            <>
              {/* Event context menu */}
              <button
                onClick={handleDeleteEvent}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "4px 12px",
                  background: "transparent",
                  border: "none",
                  color: "#ff6b6b",
                  cursor: "pointer",
                  fontSize: 11,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
              >
                Delete Event
              </button>

              {/* Divider */}
              <div style={{ height: 1, background: "var(--border-color)", margin: "2px 0" }} />

              {/* Change Easing toggle */}
              <button
                onClick={() => setContextMenu((prev) => prev ? { ...prev, showEasingSubmenu: !prev.showEasingSubmenu } : null)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "4px 12px",
                  background: contextMenu.showEasingSubmenu ? "var(--bg-active)" : "transparent",
                  border: "none",
                  color: "#ccc",
                  cursor: "pointer",
                  fontSize: 11,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; }}
                onMouseLeave={(e) => {
                  if (!contextMenu.showEasingSubmenu) {
                    (e.target as HTMLElement).style.background = "transparent";
                  }
                }}
              >
                Change Easing {contextMenu.showEasingSubmenu ? "\u25BE" : "\u25B8"}
              </button>

              {/* Easing submenu */}
              {contextMenu.showEasingSubmenu && (
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    borderTop: "1px solid var(--border-color)",
                    padding: "2px 0",
                  }}
                >
                  {EASING_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => handleChangeEasing(opt.value as EasingType)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "3px 20px",
                        background: "transparent",
                        border: "none",
                        color: "#aaa",
                        cursor: "pointer",
                        fontSize: 10,
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-active)"; (e.target as HTMLElement).style.color = "#fff"; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = "#aaa"; }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

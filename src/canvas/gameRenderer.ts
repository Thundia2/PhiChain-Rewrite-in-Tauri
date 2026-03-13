// ============================================================
// Game Preview Renderer
//
// Draws the live chart preview using Canvas2D.
// Ported from phichain-game/src/core.rs and related Bevy systems.
//
// Features:
//   - Accurate note positioning (speed-integral distance)
//   - Selected note rendering (green tint)
//   - FC/AP indicator (perfect color tinting)
//   - Multi-highlight (outline for same-beat notes)
//   - Anchor markers (circle at line origin)
//   - Background illustration support
//   - Combo & score HUD
//   - Hit effects via external HitEffectManager
//   - Curve note track rendering (semi-transparent)
//   - Pending/ghost note preview
// ============================================================

import type { Line, Note, Beat, LineEvent, NoteControlEntry, NoteKind } from "../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat } from "../types/chart";
import { evaluateLineEventsWithLayers, distanceAt, computeWorldTransforms } from "./events";
import type { WorldTransform } from "./events";
import { evaluateEasing } from "./easings";
import { BpmList } from "../utils/bpmList";
import { generateCurveNotes } from "../utils/curveNoteTrack";
import type { HitEffectManager } from "./hitEffects";
import type { PendingNote } from "../stores/editorStore";
import type { LoadedRespack, HoldTextureParts } from "../utils/respackLoader";

// ============================================================
// Render result types — screen positions for hit-testing
// ============================================================

export interface RenderedNoteInfo {
  noteIndex: number;
  screenX: number;     // absolute pixel X after line transform
  screenY: number;     // absolute pixel Y after line transform
  width: number;       // rendered width in pixels
  height: number;      // rendered height in pixels
  kind: NoteKind;
  above: boolean;
  beat: number;        // float beat value
}

export interface RenderedLineInfo {
  lineIndex: number;
  screenX: number;     // line center pixel X
  screenY: number;     // line center pixel Y
  rotation: number;    // radians
  opacity: number;     // 0.0–1.0
  scaleX: number;
  scaleY: number;
  notes: RenderedNoteInfo[];
}

export interface RenderResult {
  lines: RenderedLineInfo[];
}

// ============================================================
// Rendering constants
// ============================================================

const LINE_THICKNESS = 3;
const NOTE_WIDTH_RATIO = 989 / 8000;
const NOTE_HEIGHT_RATIO = 100 / 8000;

// ============================================================
// Note color palette
// ============================================================
const NOTE_COLORS: Record<string, string> = {
  tap: "#35b5ff",
  drag: "#f0d040",
  flick: "#ff4060",
  hold: "#35b5ff",
};

/** FC/AP "perfect" color from the original */
const PERFECT_COLOR = "#feffa9";

/** Selected note color */
const SELECTED_COLOR = "#32cd32";

/**
 * Evaluate a note control array at a given position.
 * Control entries define how a property is modified based on distance from the line.
 * Each entry: { x: normalized position 0-1, easing, value }.
 * We interpolate between entries using the specified easing.
 * Returns 1.0 (no modification) if no control entries exist.
 */
function evaluateNoteControl(controls: NoteControlEntry[] | undefined, position: number): number {
  if (!controls || controls.length === 0) return 1.0;
  if (controls.length === 1) return controls[0].value;

  // Clamp position to [0, 1]
  const t = Math.max(0, Math.min(1, position));

  // Find the two surrounding control points
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[i];
    const b = controls[i + 1];
    if (t >= a.x && t <= b.x) {
      const range = b.x - a.x;
      if (range <= 0) return a.value;
      const localT = (t - a.x) / range;
      const easedT = evaluateEasing(a.easing, localT);
      return a.value + (b.value - a.value) * easedT;
    }
  }

  // Outside range — use nearest endpoint
  if (t <= controls[0].x) return controls[0].value;
  return controls[controls.length - 1].value;
}

// ============================================================
// Renderer
// ============================================================

export interface RenderOptions {
  showHitEffects?: boolean;
  backgroundDim?: number;
  noteSize?: number;

  // Background illustration
  illustrationImage?: HTMLImageElement | null;

  // Selection
  selectedLineIndex?: number | null;
  selectedNoteIndices?: number[];

  // FC/AP indicator
  showFcApIndicator?: boolean;
  isFcValid?: boolean;

  // Multi-highlight
  multiHighlight?: boolean;

  // Anchor markers
  anchorMarkerVisibility?: "never" | "always" | "when_visible";

  // HUD
  showHud?: boolean;
  chartName?: string;
  chartLevel?: string;

  // Hit effects
  hitEffectManager?: HitEffectManager | null;
  isPlaying?: boolean;

  // Pending/ghost note
  pendingNote?: PendingNote | null;
  pendingLineIndex?: number | null;

  // Hide notes (for event preview showing only lines)
  hideNotes?: boolean;

  // Highlight a specific line (for event editor context)
  highlightLineIndex?: number | null;

  // Chart-level font family for text events
  chartFontFamily?: string | null;

  // Resource pack (note textures, hit effect sprites)
  respack?: LoadedRespack | null;

  // Lines to skip rendering (for unified editor visibility toggles)
  hiddenLineIndices?: Set<number> | null;

  // Multi-selected lines (batch editing highlight)
  multiSelectedLineIndices?: Set<number> | null;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private textureCache: Map<string, HTMLImageElement | null> = new Map();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Load a line texture into the cache. Call once per unique texture path. */
  loadLineTexture(path: string, image: HTMLImageElement): void {
    this.textureCache.set(path, image);
  }

  /** Check if a line texture is cached. */
  hasLineTexture(path: string): boolean {
    return this.textureCache.has(path);
  }

  /**
   * Render a single frame of the game preview.
   * Returns a RenderResult with computed screen positions for all lines and notes,
   * enabling post-render hit-testing without re-evaluating events.
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
    const ctx = this.ctx;
    const noteScale = options.noteSize ?? 1.0;

    const time = currentTime - offset;
    const currentBeat = bpmList.beatAtFloat(time);

    // ---- Clear + Background ----
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw illustration if available
    if (options.illustrationImage) {
      const img = options.illustrationImage;
      const scale = Math.max(canvasWidth / img.width, canvasHeight / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvasWidth - w) / 2, (canvasHeight - h) / 2, w, h);
    }

    // Dim overlay
    const bgDim = options.backgroundDim ?? 0.6;
    ctx.fillStyle = `rgba(0, 0, 0, ${bgDim})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bpmTimeAt = (beat: Beat) => bpmList.timeAt(beat);
    const distanceScale = canvasHeight * (120.0 / 900.0);
    const noteW = canvasWidth * NOTE_WIDTH_RATIO * noteScale;
    const noteH = canvasWidth * NOTE_HEIGHT_RATIO * noteScale;

    // ---- Build multi-highlight set ----
    let multiBeats: Set<number> | null = null;
    if (options.multiHighlight) {
      const beatCounts = new Map<number, number>();
      for (const line of lines) {
        for (const note of line.notes) {
          const b = beatToFloat(note.beat);
          beatCounts.set(b, (beatCounts.get(b) ?? 0) + 1);
        }
      }
      multiBeats = new Set<number>();
      for (const [b, count] of beatCounts) {
        if (count > 1) multiBeats.add(b);
      }
    }

    // ---- Count combo for HUD ----
    let combo = 0;
    let totalNotes = 0;
    if (options.showHud) {
      for (const line of lines) {
        for (const note of line.notes) {
          if (note.fake) continue;
          totalNotes++;
          if (beatToFloat(note.beat) <= currentBeat) combo++;
        }
      }
    }

    // ---- Pre-compute parent-child world transforms for all lines ----
    const worldTransforms = computeWorldTransforms(lines, currentBeat, canvasWidth, canvasHeight);

    // ---- Render each line (sorted by z_order, lower = further back) ----
    const lineOrder = lines.map((_, i) => i)
      .sort((a, b) => (lines[a].z_order ?? 0) - (lines[b].z_order ?? 0));

    const renderResult: RenderResult = { lines: [] };

    for (const lineIdx of lineOrder) {
      // Skip hidden lines (unified editor visibility toggles)
      if (options.hiddenLineIndices?.has(lineIdx)) {
        // Push placeholder to keep indices aligned
        renderResult.lines.push({
          lineIndex: lineIdx,
          screenX: 0, screenY: 0, rotation: 0, opacity: 0, scaleX: 1, scaleY: 1,
          notes: [],
        });
        continue;
      }

      const lineInfo = this.renderLine(
        ctx, lines[lineIdx], lineIdx, currentBeat, time, bpmTimeAt,
        canvasWidth, canvasHeight, distanceScale, noteW, noteH,
        options, multiBeats, worldTransforms[lineIdx],
      );
      if (lineInfo) {
        renderResult.lines.push(lineInfo);
      }
    }

    // ---- Hit effects (rendered on top of everything, in screen space) ----
    if (options.hitEffectManager && options.isPlaying) {
      options.hitEffectManager.render(ctx, time);
    }

    // ---- HUD ----
    if (options.showHud) {
      this.drawHud(ctx, combo, totalNotes,
        options.chartName ?? "", options.chartLevel ?? "",
        canvasWidth, canvasHeight);
    }

    return renderResult;
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    line: Line,
    lineIndex: number,
    currentBeat: number,
    currentTime: number,
    bpmTimeAt: (beat: Beat) => number,
    canvasWidth: number,
    canvasHeight: number,
    distanceScale: number,
    noteW: number,
    noteH: number,
    options: RenderOptions,
    multiBeats: Set<number> | null,
    worldTransform: WorldTransform,
  ): RenderedLineInfo | null {
    // FIX 1: Use pre-computed world transform (parent-child hierarchy resolved)
    const state = worldTransform.localState;

    // FIX 5: Default alpha -255 before beat 0 (RPE spec)
    if (currentBeat < 0 && !line.attach_ui) {
      const hasAlphaEvents = line.event_layers && line.event_layers.length > 0
        ? line.event_layers.some(l => l.alpha_events.length > 0)
        : line.events.some(e => e.kind === "opacity");
      if (!hasAlphaEvents) {
        state.opacity = -1.0; // -255/255
      }
    }

    // FIX 1: World-space position and rotation (includes parent transforms)
    const screenX = worldTransform.worldX;
    const screenY = worldTransform.worldY;
    const worldRotation = worldTransform.worldRotation;

    // Collect position data for RenderResult
    const renderedNotes: RenderedNoteInfo[] = [];
    const lineInfo: RenderedLineInfo = {
      lineIndex,
      screenX,
      screenY,
      rotation: worldRotation,
      opacity: state.opacity,
      scaleX: state.scale_x,
      scaleY: state.scale_y,
      notes: renderedNotes,
    };

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(-worldRotation);

    // Apply extended transforms
    if (state.scale_x !== 1 || state.scale_y !== 1) {
      ctx.scale(state.scale_x, state.scale_y);
    }
    if (state.incline !== 0) {
      ctx.transform(1, Math.tan(state.incline * Math.PI / 180), 0, 1, 0, 0);
    }

    const speedEvents = line.events.filter((e) => e.kind === "speed");
    const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);

    // FIX 2: bpmfactor — divides effective BPM for note speed on this line
    const bpmFactor = line.bpm_factor ?? 1;

    const isSelectedLine = lineIndex === options.selectedLineIndex;
    const selectedSet = isSelectedLine && options.selectedNoteIndices
      ? new Set(options.selectedNoteIndices)
      : null;

    // ---- Draw notes (skipped when hideNotes is set or line alpha is negative per RPE spec) ----
    if (!options.hideNotes && state.opacity >= 0) {
      // Regular notes
      for (let noteIdx = 0; noteIdx < line.notes.length; noteIdx++) {
        const note = line.notes[noteIdx];
        const noteBeatF = beatToFloat(note.beat);
        const noteTime = bpmTimeAt(note.beat);

        const holdBeatF = note.hold_beat ? beatToFloat(note.hold_beat) : 0;
        if (noteBeatF + holdBeatF < currentBeat) continue;

        // visibleTime: skip if note isn't visible yet
        const visibleTime = note.visible_time ?? 999999;
        if (noteTime - currentTime > visibleTime) continue;

        const noteDistance = distanceAt(speedEvents, noteTime, bpmTimeAt);
        const yOffset = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
        // FIX 2: divide distance delta by bpmFactor (affects visual approach speed only)
        const rawY = ((noteDistance - currentDistance) / bpmFactor) * note.speed * distanceScale + yOffset;
        const noteX = (note.x / CANVAS_WIDTH) * canvasWidth;

        // FIX 9: note.size controls WIDTH only; size_control controls both dimensions
        const noteWidthSize = note.size ?? 1.0;
        let sizeControlMul = 1.0;
        let noteAlpha = (note.alpha ?? 255) / 255;
        let noteXOffset = 0;

        // Apply note controls based on normalized distance from line
        const controlPos = Math.max(0, Math.min(1, rawY / (canvasHeight * 2)));
        if (line.pos_control) noteXOffset = evaluateNoteControl(line.pos_control, controlPos) - 1;
        if (line.alpha_control) noteAlpha *= evaluateNoteControl(line.alpha_control, controlPos);
        if (line.size_control) sizeControlMul = evaluateNoteControl(line.size_control, controlPos);
        if (line.y_control) {
          // y_control scales the vertical distance from line (applied via control system)
          evaluateNoteControl(line.y_control, controlPos);
        }

        const scaledNoteW = noteW * noteWidthSize * sizeControlMul;
        const scaledNoteH = noteH * sizeControlMul;

        // Determine note color
        const isSelected = selectedSet?.has(noteIdx) ?? false;
        const isMulti = multiBeats?.has(noteBeatF) ?? false;
        const color = this.getNoteColor(note, isSelected, options);

        // Apply per-note alpha
        const prevAlpha = ctx.globalAlpha;
        if (noteAlpha < 1) ctx.globalAlpha = noteAlpha;

        // Apply pos_control offset to X
        const finalNoteX = noteX + noteXOffset * canvasWidth;

        if (note.kind === "hold" && note.hold_beat) {
          this.drawHoldNote(
            ctx, note, rawY, finalNoteX, scaledNoteW, scaledNoteH, color,
            currentDistance, distanceScale, speedEvents, bpmTimeAt,
            canvasHeight, isMulti, options.respack, bpmFactor,
          );
          // Collect hold note head position for hit-testing
          const holdScreenNoteY = note.above ? -Math.max(rawY, 0) : Math.max(rawY, 0);
          const cos = Math.cos(-worldRotation);
          const sin = Math.sin(-worldRotation);
          renderedNotes.push({
            noteIndex: noteIdx,
            screenX: screenX + (finalNoteX * cos - holdScreenNoteY * sin) * state.scale_x,
            screenY: screenY + (finalNoteX * sin + holdScreenNoteY * cos) * state.scale_y,
            width: scaledNoteW,
            height: scaledNoteH,
            kind: note.kind,
            above: note.above,
            beat: noteBeatF,
          });
        } else {
          // FIX 6: isCover — only hide passed notes when is_cover is not explicitly false
          if (rawY < 0 && line.is_cover !== false) { ctx.globalAlpha = prevAlpha; continue; }
          const screenNoteY = note.above ? -rawY : rawY;
          if (Math.abs(screenNoteY) > canvasHeight * 2) { ctx.globalAlpha = prevAlpha; continue; }
          this.drawNote(ctx, note, finalNoteX, screenNoteY, scaledNoteW, scaledNoteH, color, isMulti, options.respack);

          // Collect note position for hit-testing (transform local to absolute)
          const cos = Math.cos(-worldRotation);
          const sin = Math.sin(-worldRotation);
          renderedNotes.push({
            noteIndex: noteIdx,
            screenX: screenX + (finalNoteX * cos - screenNoteY * sin) * state.scale_x,
            screenY: screenY + (finalNoteX * sin + screenNoteY * cos) * state.scale_y,
            width: scaledNoteW,
            height: scaledNoteH,
            kind: note.kind,
            above: note.above,
            beat: noteBeatF,
          });
        }

        ctx.globalAlpha = prevAlpha;

        // Hit effect spawning
        // FIX 8: Fake notes have no hit effects, no sound, no scoring
        // FIX 10: yOffset affects hit effect position — project yOffset along line's normal
        if (!note.fake && options.hitEffectManager && options.isPlaying && options.showHitEffects !== false) {
          const cos = Math.cos(-worldRotation);
          const sin = Math.sin(-worldRotation);
          const noteYOff = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
          const localHitY = (note.above ? -1 : 1) * noteYOff;
          const hitX = screenX + noteX * cos - localHitY * sin;
          const hitY = screenY + noteX * sin + localHitY * cos;
          options.hitEffectManager.trySpawnEffect(
            `${lineIndex}-${noteIdx}`, noteBeatF, currentBeat,
            hitX, hitY, currentTime,
            note.kind, state.color,
          );
        }
      }

      // Curve note track notes (semi-transparent)
      for (const track of line.curve_note_tracks) {
        if (track.from == null || track.to == null) continue;
        const fromIdx = typeof track.from === "number" ? track.from : parseInt(track.from);
        const toIdx = typeof track.to === "number" ? track.to : parseInt(track.to);
        const fromNote = line.notes[fromIdx];
        const toNote = line.notes[toIdx];
        if (!fromNote || !toNote) continue;

        const curveNotes = generateCurveNotes(fromNote, toNote, track);
        for (const cn of curveNotes) {
          const cnBeatF = beatToFloat(cn.beat);
          if (cnBeatF < currentBeat) continue;

          const cnTime = bpmTimeAt(cn.beat);
          const cnDistance = distanceAt(speedEvents, cnTime, bpmTimeAt);
          const cnRawY = ((cnDistance - currentDistance) / bpmFactor) * cn.speed * distanceScale;
          if (cnRawY < 0) continue;

          const cnX = (cn.x / CANVAS_WIDTH) * canvasWidth;
          const cnScreenY = cn.above ? -cnRawY : cnRawY;
          if (Math.abs(cnScreenY) > canvasHeight * 2) continue;

          const cnColor = NOTE_COLORS[cn.kind] ?? "#ffffff";
          ctx.globalAlpha = 100 / 255;
          this.drawNoteShape(ctx, cn, cnX, cnScreenY, noteW, noteH, cnColor, options.respack);
          ctx.globalAlpha = 1;
        }
      }
    }

    // ---- Draw pending/ghost note ----
    if (!options.hideNotes && state.opacity >= 0 && options.pendingNote && options.pendingLineIndex === lineIndex) {
      const pn = options.pendingNote;
      const pnTime = bpmTimeAt(pn.beat);
      const pnDistance = distanceAt(speedEvents, pnTime, bpmTimeAt);
      const pnRawY = ((pnDistance - currentDistance) / bpmFactor) * 1.0 * distanceScale;

      if (pnRawY >= 0) {
        const pnX = (pn.x / CANVAS_WIDTH) * canvasWidth;
        const pnScreenY = pn.above ? -pnRawY : pnRawY;
        const pnColor = NOTE_COLORS[pn.kind] ?? "#ffffff";
        ctx.globalAlpha = 40 / 255; // Very faint ghost
        this.drawNoteShape(ctx, { kind: pn.kind, above: pn.above } as Note, pnX, pnScreenY, noteW, noteH, pnColor, options.respack);
        ctx.globalAlpha = 1;
      }
    }

    // ---- Draw the judgment line (only when visible) ----
    if (state.opacity > 0) {
      const lineHalfW = canvasWidth * 1.5;
      ctx.globalAlpha = state.opacity;

      // Per RPE spec: a judgment line with ANY text events is always hidden
      // (line rect and custom texture are not drawn), only the text is displayed.
      const lineHasTextEvents = line.events.some((e) => e.kind === "text");

      if (!lineHasTextEvents) {
        // Try custom line texture first
        const lineTexture = line.texture ? this.textureCache.get(line.texture) : null;
        if (lineTexture) {
          const texAspect = lineTexture.naturalHeight / lineTexture.naturalWidth;
          const texW = lineHalfW * 2;
          const texH = texW * texAspect;
          const anchor = line.anchor ?? [0.5, 0.5];
          ctx.drawImage(lineTexture,
            -texW * anchor[0], -texH * anchor[1],
            texW, texH);
        } else {
          // Default white line (or colored)
          // FIX 15: colorPerfect/colorGood — tint line when FC/AP indicator active
          if (state.color) {
            ctx.fillStyle = `rgb(${state.color[0]}, ${state.color[1]}, ${state.color[2]})`;
          } else if (options.isPlaying && options.showFcApIndicator && options.isFcValid && options.respack?.config?.colorPerfect) {
            ctx.fillStyle = options.respack.config.colorPerfect;
          } else {
            ctx.fillStyle = "#ffffff";
          }
          ctx.fillRect(-lineHalfW, -LINE_THICKNESS / 2, lineHalfW * 2, LINE_THICKNESS);
        }
      }

      // Draw text event if present
      if (state.text) {
        const textFontSize = Math.round(canvasHeight * 40 / 900);
        // FIX 16: Per-event font field takes priority, then chart-level, then default
        const activeTextEvent = line.events.find(e =>
          e.kind === "text" &&
          beatToFloat(e.start_beat) <= currentBeat &&
          beatToFloat(e.end_beat) >= currentBeat
        );
        const fontFamily = activeTextEvent?.font || options.chartFontFamily || "sans-serif";
        ctx.font = `bold ${textFontSize}px "${fontFamily}", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Per RPE spec: when there are text events but no color events,
        // text color is always white.
        const lineHasColorEvents = line.events.some((e) => e.kind === "color");
        ctx.fillStyle = (state.color && lineHasColorEvents)
          ? `rgb(${state.color[0]}, ${state.color[1]}, ${state.color[2]})`
          : "#ffffff";
        // FIX 11: %P% interpolation — replace with easing progress of active text event
        let displayText = state.text;
        if (displayText.includes("%P%")) {
          if (activeTextEvent) {
            const tStart = beatToFloat(activeTextEvent.start_beat);
            const tEnd = beatToFloat(activeTextEvent.end_beat);
            const progress = tEnd > tStart ? (currentBeat - tStart) / (tEnd - tStart) : 0;
            displayText = displayText.replace(/%P%/g, progress.toFixed(2));
          } else {
            displayText = displayText.replace(/%P%/g, "0");
          }
        }
        // FIX 12: \n newline support — split literal "\n" and render each line
        const textLines = displayText.split("\\n");
        if (textLines.length <= 1) {
          ctx.fillText(displayText, 0, 0);
        } else {
          const lineHeight = textFontSize * 1.2;
          const totalHeight = (textLines.length - 1) * lineHeight;
          for (let tl = 0; tl < textLines.length; tl++) {
            ctx.fillText(textLines[tl], 0, -totalHeight / 2 + tl * lineHeight);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---- Draw multi-selected line highlight ----
    if (options.multiSelectedLineIndices?.has(lineIndex) && state.opacity > 0) {
      const lineHalfW = canvasWidth * 1.5;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(-lineHalfW, -6, lineHalfW * 2, 12);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ---- Draw anchor marker ----
    const anchorVis = options.anchorMarkerVisibility ?? "never";
    if (
      anchorVis === "always" ||
      (anchorVis === "when_visible" && state.opacity > 0)
    ) {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "#32cd32";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    // FIX 1: Parent-child hierarchy is now resolved via computeWorldTransforms()
    // using father_index. The old children[] recursion is removed.

    return lineInfo;
  }

  /**
   * Hit-test notes using pre-computed RenderResult positions.
   * Returns the line index and note index of the topmost note at the click position, or null.
   * Checks in reverse order (topmost/last-rendered first).
   */
  hitTestNote(
    clickX: number,
    clickY: number,
    renderResult: RenderResult,
    hitRadius: number = 12,
  ): { lineIndex: number; noteIndex: number } | null {
    // Check in reverse z-order (topmost line first)
    for (let i = renderResult.lines.length - 1; i >= 0; i--) {
      const lineInfo = renderResult.lines[i];
      // Check notes in reverse order (last drawn = on top)
      for (let j = lineInfo.notes.length - 1; j >= 0; j--) {
        const noteInfo = lineInfo.notes[j];
        const dx = clickX - noteInfo.screenX;
        const dy = clickY - noteInfo.screenY;
        // Use note dimensions for more accurate hit testing
        const halfW = Math.max(noteInfo.width / 2, hitRadius);
        const halfH = Math.max(noteInfo.height / 2, hitRadius);
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
          return { lineIndex: lineInfo.lineIndex, noteIndex: noteInfo.noteIndex };
        }
      }
    }
    return null;
  }

  /** Determine the color for a note based on selection and FC/AP state */
  private getNoteColor(note: Note, isSelected: boolean, options: RenderOptions): string {
    if (isSelected) return SELECTED_COLOR;
    if (options.isPlaying && options.showFcApIndicator && options.isFcValid) {
      return options.respack?.config?.colorPerfect ?? PERFECT_COLOR;
    }
    return NOTE_COLORS[note.kind] ?? "#ffffff";
  }

  private drawNote(
    ctx: CanvasRenderingContext2D,
    note: Note,
    noteX: number,
    noteY: number,
    noteW: number,
    noteH: number,
    color: string,
    isMultiHighlight: boolean,
    respack?: LoadedRespack | null,
  ) {
    ctx.globalAlpha = 0.9;

    if (respack) {
      const texKey = note.kind === "tap" ? "tap" : note.kind as "drag" | "flick";
      const mhKey = (texKey + "MH") as "tapMH" | "dragMH" | "flickMH";
      const texture = (isMultiHighlight && respack.textures[mhKey])
        ? respack.textures[mhKey] as HTMLImageElement
        : respack.textures[texKey] as HTMLImageElement | null;

      if (texture) {
        this.drawNoteTexture(ctx, noteX, noteY, noteW, texture);
      } else {
        this.drawNoteShape(ctx, note, noteX, noteY, noteW, noteH, color);
      }
    } else {
      this.drawNoteShape(ctx, note, noteX, noteY, noteW, noteH, color);
    }

    // Multi-highlight outline (only when no MH texture available)
    if (isMultiHighlight && !(respack?.textures[(note.kind === "tap" ? "tap" : note.kind) + "MH" as keyof typeof respack.textures])) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(noteX - noteW / 2 - 1, noteY - noteH / 2 - 1, noteW + 2, noteH + 2);
    }

    ctx.globalAlpha = 1;
  }

  /** Draw a note using a texture image, maintaining aspect ratio */
  private drawNoteTexture(
    ctx: CanvasRenderingContext2D,
    noteX: number,
    noteY: number,
    noteW: number,
    texture: HTMLImageElement,
  ) {
    const aspect = texture.naturalHeight / texture.naturalWidth;
    const texH = noteW * aspect;
    ctx.drawImage(texture, noteX - noteW / 2, noteY - texH / 2, noteW, texH);
  }

  /** Draw the shape of a note (shared between regular and ghost rendering) */
  private drawNoteShape(
    ctx: CanvasRenderingContext2D,
    note: Pick<Note, "kind">,
    noteX: number,
    noteY: number,
    noteW: number,
    noteH: number,
    color: string,
    respack?: LoadedRespack | null,
  ) {
    // Try texture rendering first
    if (respack) {
      const texKey = note.kind === "tap" ? "tap" : note.kind as "drag" | "flick";
      const texture = respack.textures[texKey] as HTMLImageElement | null;
      if (texture) {
        this.drawNoteTexture(ctx, noteX, noteY, noteW, texture);
        return;
      }
    }

    // Fallback: colored rectangles
    ctx.fillStyle = color;

    if (note.kind === "flick") {
      ctx.fillRect(noteX - noteW / 2, noteY - noteH / 2, noteW, noteH);
      ctx.beginPath();
      ctx.moveTo(noteX - noteW * 0.3, noteY - noteH);
      ctx.lineTo(noteX, noteY - noteH * 2);
      ctx.lineTo(noteX + noteW * 0.3, noteY - noteH);
      ctx.fill();
    } else if (note.kind === "drag") {
      ctx.fillRect(noteX - noteW / 2, noteY - noteH * 0.35, noteW, noteH * 0.7);
    } else {
      ctx.fillRect(noteX - noteW / 2, noteY - noteH / 2, noteW, noteH);
    }
  }

  private drawHoldNote(
    ctx: CanvasRenderingContext2D,
    note: Note,
    rawY: number,
    noteX: number,
    noteW: number,
    noteH: number,
    color: string,
    currentDistance: number,
    distanceScale: number,
    speedEvents: LineEvent[],
    bpmTimeAt: (beat: Beat) => number,
    _canvasHeight: number,
    isMultiHighlight: boolean,
    respack?: LoadedRespack | null,
    bpmFactor: number = 1,
  ) {
    if (!note.hold_beat) return;

    const endBeat: Beat = [
      note.beat[0] + note.hold_beat[0],
      note.beat[1] * note.hold_beat[2] + note.hold_beat[1] * note.beat[2],
      note.beat[2] * note.hold_beat[2],
    ];
    const holdEndTime = bpmTimeAt(endBeat);
    const holdEndDistance = distanceAt(speedEvents, holdEndTime, bpmTimeAt);
    // FIX 2: Apply bpmFactor to hold end distance
    const rawEndY = ((holdEndDistance - currentDistance) / bpmFactor) * note.speed * distanceScale;

    // FIX 13: holdKeepHead — optionally keep showing the head after it passes the line
    const holdKeepHead = respack?.config?.holdKeepHead ?? false;
    const headY = holdKeepHead ? rawY : Math.max(rawY, 0);
    const tailY = rawEndY;
    if (tailY < 0) return;

    const bodyHeight = tailY - headY;
    if (bodyHeight < 0) return;

    const dir = note.above ? -1 : 1;
    const screenHeadY = headY * dir;
    const screenTailY = tailY * dir;
    const top = Math.min(screenHeadY, screenTailY);

    // Try texture-based hold rendering
    const holdParts: HoldTextureParts | null = respack
      ? ((isMultiHighlight && respack.textures.holdMH) || respack.textures.hold)
      : null;

    if (holdParts) {
      // Texture-based hold: body, head, tail from atlas parts
      const headAspect = holdParts.head.naturalHeight / holdParts.head.naturalWidth;
      const tailAspect = holdParts.tail.naturalHeight / holdParts.tail.naturalWidth;
      const headTexH = noteW * headAspect;
      const tailTexH = noteW * tailAspect;

      // Body — FIX 13: holdRepeat tiles the body texture instead of stretching
      ctx.globalAlpha = 0.9;
      if (respack?.config?.holdRepeat && holdParts.body.naturalWidth > 0) {
        const pattern = ctx.createPattern(holdParts.body, "repeat-y");
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(noteX - noteW / 2, top, noteW, bodyHeight);
        } else {
          ctx.drawImage(holdParts.body, noteX - noteW / 2, top, noteW, bodyHeight);
        }
      } else {
        ctx.drawImage(holdParts.body, noteX - noteW / 2, top, noteW, bodyHeight);
      }

      // FIX 13: holdCompact — overlap head/tail over body edges
      if (respack?.config?.holdCompact) {
        // Compact mode: head overlaps start of body, tail overlaps end of body
        ctx.drawImage(holdParts.head, noteX - noteW / 2, top - headTexH / 2, noteW, headTexH);
        ctx.drawImage(holdParts.tail, noteX - noteW / 2, top + bodyHeight - tailTexH / 2, noteW, tailTexH);
      } else {
        // Normal: head at headY, tail at tailY
        if (rawY >= 0 || holdKeepHead) {
          ctx.drawImage(holdParts.head, noteX - noteW / 2, screenHeadY - headTexH / 2, noteW, headTexH);
        }
        ctx.drawImage(holdParts.tail, noteX - noteW / 2, screenTailY - tailTexH / 2, noteW, tailTexH);
      }
    } else {
      // Fallback: colored rectangles
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(noteX - noteW / 2, top, noteW, bodyHeight);

      if (rawY >= 0) {
        ctx.globalAlpha = 0.9;
        ctx.fillRect(noteX - noteW / 2, screenHeadY - noteH / 2, noteW, noteH);
      }

      ctx.globalAlpha = 0.7;
      ctx.fillRect(noteX - noteW / 2, screenTailY - noteH / 4, noteW, noteH / 2);
    }

    // Multi-highlight outline on head
    if (isMultiHighlight && rawY >= 0 && !holdParts) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(noteX - noteW / 2 - 1, screenHeadY - noteH / 2 - 1, noteW + 2, noteH + 2);
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Hit-test all lines to find which one (if any) was clicked.
   * Returns the line index or null.
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

    // Iterate in reverse so topmost (last-drawn) line wins
    for (let i = lines.length - 1; i >= 0; i--) {
      const state = evaluateLineEventsWithLayers(lines[i].events, lines[i].event_layers, currentBeat);
      if (state.opacity <= 0) continue;

      const screenX = canvasWidth / 2 + (state.x / CANVAS_WIDTH) * canvasWidth;
      const screenY = canvasHeight / 2 - (state.y / CANVAS_HEIGHT) * canvasHeight;

      const dx = clickX - screenX;
      const dy = clickY - screenY;
      // The renderer draws lines with ctx.rotate(-state.rotation), so we must
      // use the same negated angle to transform screen coords back to line-local space.
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

  /** Draw the HUD (combo, score, chart info) */
  private drawHud(
    ctx: CanvasRenderingContext2D,
    combo: number,
    totalNotes: number,
    chartName: string,
    chartLevel: string,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    const score = totalNotes > 0 ? Math.round(1000000 * combo / totalNotes) : 0;

    ctx.save();

    // Score (top-right)
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(score.toString().padStart(7, "0"), canvasWidth - 12, 10);

    // Combo (center-top, only when >= 3)
    if (combo >= 3) {
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(combo.toString(), canvasWidth / 2, 10);
      ctx.font = "9px sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillText("COMBO", canvasWidth / 2, 42);
    }

    // Chart name (bottom-left)
    if (chartName) {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(chartName, 10, canvasHeight - 6);
    }

    // Level (bottom-right)
    if (chartLevel) {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(chartLevel, canvasWidth - 10, canvasHeight - 6);
    }

    ctx.restore();
  }
}

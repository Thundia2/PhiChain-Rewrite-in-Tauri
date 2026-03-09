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

import type { Line, Note, Beat, LineEvent } from "../types/chart";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat } from "../types/chart";
import { evaluateLineEvents, distanceAt } from "./events";
import { BpmList } from "../utils/bpmList";
import { generateCurveNotes } from "../utils/curveNoteTrack";
import type { HitEffectManager } from "./hitEffects";
import type { PendingNote } from "../stores/editorStore";
import type { LoadedRespack, HoldTextureParts } from "../utils/respackLoader";

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

  // Resource pack (note textures, hit effect sprites)
  respack?: LoadedRespack | null;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Render a single frame of the game preview.
   */
  render(
    lines: Line[],
    bpmList: BpmList,
    currentTime: number,
    offset: number,
    canvasWidth: number,
    canvasHeight: number,
    options: RenderOptions = {},
  ) {
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

    // ---- Render each line ----
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      this.renderLine(
        ctx, lines[lineIdx], lineIdx, currentBeat, time, bpmTimeAt,
        canvasWidth, canvasHeight, distanceScale, noteW, noteH,
        options, multiBeats,
      );
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
  ) {
    const state = evaluateLineEvents(line.events, currentBeat);

    const screenX = canvasWidth / 2 + (state.x / CANVAS_WIDTH) * canvasWidth;
    const screenY = canvasHeight / 2 - (state.y / CANVAS_HEIGHT) * canvasHeight;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(-state.rotation);

    const speedEvents = line.events.filter((e) => e.kind === "speed");
    const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);

    const isSelectedLine = lineIndex === options.selectedLineIndex;
    const selectedSet = isSelectedLine && options.selectedNoteIndices
      ? new Set(options.selectedNoteIndices)
      : null;

    // ---- Draw notes (skipped when hideNotes is set) ----
    if (!options.hideNotes) {
      // Regular notes
      for (let noteIdx = 0; noteIdx < line.notes.length; noteIdx++) {
        const note = line.notes[noteIdx];
        const noteBeatF = beatToFloat(note.beat);
        const noteTime = bpmTimeAt(note.beat);

        const holdBeatF = note.hold_beat ? beatToFloat(note.hold_beat) : 0;
        if (noteBeatF + holdBeatF < currentBeat) continue;

        const noteDistance = distanceAt(speedEvents, noteTime, bpmTimeAt);
        const yOffset = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
        const rawY = (noteDistance - currentDistance) * note.speed * distanceScale + yOffset;
        const noteX = (note.x / CANVAS_WIDTH) * canvasWidth;

        // Determine note color
        const isSelected = selectedSet?.has(noteIdx) ?? false;
        const isMulti = multiBeats?.has(noteBeatF) ?? false;
        const color = this.getNoteColor(note, isSelected, options);

        if (note.kind === "hold" && note.hold_beat) {
          this.drawHoldNote(
            ctx, note, rawY, noteX, noteW, noteH, color,
            currentDistance, distanceScale, speedEvents, bpmTimeAt,
            canvasHeight, isMulti, options.respack,
          );
        } else {
          if (rawY < 0) continue;
          const screenNoteY = note.above ? -rawY : rawY;
          if (Math.abs(screenNoteY) > canvasHeight * 2) continue;
          this.drawNote(ctx, note, noteX, screenNoteY, noteW, noteH, color, isMulti, options.respack);
        }

        // Hit effect spawning
        if (options.hitEffectManager && options.isPlaying && options.showHitEffects !== false) {
          const cos = Math.cos(-state.rotation);
          const sin = Math.sin(-state.rotation);
          const hitX = screenX + noteX * cos;
          const hitY = screenY + noteX * sin;
          options.hitEffectManager.trySpawnEffect(
            `${lineIndex}-${noteIdx}`, noteBeatF, currentBeat,
            hitX, hitY, currentTime,
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
          const cnRawY = (cnDistance - currentDistance) * cn.speed * distanceScale;
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
    if (!options.hideNotes && options.pendingNote && options.pendingLineIndex === lineIndex) {
      const pn = options.pendingNote;
      const pnBeatF = beatToFloat(pn.beat);
      const pnTime = bpmTimeAt(pn.beat);
      const pnDistance = distanceAt(speedEvents, pnTime, bpmTimeAt);
      const pnRawY = (pnDistance - currentDistance) * 1.0 * distanceScale;

      if (pnRawY >= 0) {
        const pnX = (pn.x / CANVAS_WIDTH) * canvasWidth;
        const pnScreenY = -pnRawY; // Default above
        const pnColor = NOTE_COLORS[pn.kind] ?? "#ffffff";
        ctx.globalAlpha = 40 / 255; // Very faint ghost
        this.drawNoteShape(ctx, { kind: pn.kind, above: true } as Note, pnX, pnScreenY, noteW, noteH, pnColor, options.respack);
        ctx.globalAlpha = 1;
      }
    }

    // ---- Draw the judgment line (only when visible) ----
    if (state.opacity > 0) {
      const lineHalfW = canvasWidth * 1.5;
      ctx.globalAlpha = state.opacity;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-lineHalfW, -LINE_THICKNESS / 2, lineHalfW * 2, LINE_THICKNESS);
      ctx.globalAlpha = 1;
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

    // ---- Render children recursively ----
    for (const child of line.children) {
      this.renderLine(
        ctx, child, lineIndex, currentBeat, currentTime, bpmTimeAt,
        canvasWidth, canvasHeight, distanceScale, noteW, noteH,
        options, multiBeats,
      );
    }
  }

  /** Determine the color for a note based on selection and FC/AP state */
  private getNoteColor(note: Note, isSelected: boolean, options: RenderOptions): string {
    if (isSelected) return SELECTED_COLOR;
    if (options.isPlaying && options.showFcApIndicator && options.isFcValid) return PERFECT_COLOR;
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
    canvasHeight: number,
    isMultiHighlight: boolean,
    respack?: LoadedRespack | null,
  ) {
    if (!note.hold_beat) return;

    const endBeat: Beat = [
      note.beat[0] + note.hold_beat[0],
      note.beat[1] * note.hold_beat[2] + note.hold_beat[1] * note.beat[2],
      note.beat[2] * note.hold_beat[2],
    ];
    const holdEndTime = bpmTimeAt(endBeat);
    const holdEndDistance = distanceAt(speedEvents, holdEndTime, bpmTimeAt);
    const rawEndY = (holdEndDistance - currentDistance) * note.speed * distanceScale;

    const headY = Math.max(rawY, 0);
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

      // Body (stretched)
      ctx.globalAlpha = 0.9;
      ctx.drawImage(holdParts.body, noteX - noteW / 2, top, noteW, bodyHeight);

      // Head
      if (rawY >= 0) {
        ctx.drawImage(holdParts.head, noteX - noteW / 2, screenHeadY - headTexH / 2, noteW, headTexH);
      }

      // Tail
      ctx.drawImage(holdParts.tail, noteX - noteW / 2, screenTailY - tailTexH / 2, noteW, tailTexH);
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
      const state = evaluateLineEvents(lines[i].events, currentBeat);
      if (state.opacity <= 0) continue;

      const screenX = canvasWidth / 2 + (state.x / CANVAS_WIDTH) * canvasWidth;
      const screenY = canvasHeight / 2 - (state.y / CANVAS_HEIGHT) * canvasHeight;

      const dx = clickX - screenX;
      const dy = clickY - screenY;
      const cos = Math.cos(state.rotation);
      const sin = Math.sin(state.rotation);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

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

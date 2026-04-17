// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// PixiLineContainer — Per-line container for the Pixi renderer
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Each judgment line becomes a Container with transforms (position, rotation,
// scale, skew) applied from the world transform system. Notes, the line
// visual, text events, and anchor markers are children of this container.
// ============================================================

import { Container, Sprite, Graphics, Text, Texture, TextStyle } from "pixi.js";
import type { Line, Beat, LineEvent, NoteKind, NoteControlEntry } from "../../types/chart";
import type { WorldTransform, LineState } from "../events";
import type { RenderedNoteInfo } from "../gameRenderer";
import type { HitEffectManager } from "../hitEffects";
import type { PixiHitEffectLayer } from "./PixiHitEffects";
import { distanceAt } from "../events";
import { evaluateEasing } from "../easings";
import { CANVAS_WIDTH, CANVAS_HEIGHT, beatToFloat } from "../../types/chart";
import { generateCurveNotes } from "../../utils/curveNoteTrack";
import { SpritePool } from "./SpritePool";
import { PixiHoldNoteContainer } from "./PixiHoldNote";
import type { PixiRespackTextures, PixiHoldTextures } from "./PixiTextureManager";
import {
  getNoteTexture,
  configureNoteSprite,
  configureDragSprite,
  resolveNoteColor,
  drawFlickArrow,
} from "./PixiNoteSprite";

// ============================================================
// Constants (same as gameRenderer.ts)
// ============================================================

const NOTE_WIDTH_RATIO = 989 / 8000;
const NOTE_HEIGHT_RATIO = 100 / 8000;
const DISTANCE_SCALE_RATIO = 120.0 / 900.0;
const LINE_THICKNESS = 3;
const FILTERED_NOTE_ALPHA = 100 / 255;
const GHOST_NOTE_ALPHA = 40 / 255;
const TEXT_EVENT_FONT_RATIO = 40 / 900;

const NOTE_COLORS: Record<string, number> = {
  tap: 0x35b5ff, drag: 0xf0d040, flick: 0xff4060, hold: 0x35b5ff,
};

// ============================================================
// Note control evaluation (same logic as gameRenderer.ts)
// ============================================================

function evaluateNoteControl(controls: NoteControlEntry[] | undefined, position: number): number {
  if (!controls || controls.length === 0) return 1.0;
  if (controls.length === 1) return controls[0].value;
  const t = Math.max(0, Math.min(1, position));
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
  if (t <= controls[0].x) return controls[0].value;
  return controls[controls.length - 1].value;
}

// ============================================================
// PixiLineContainer
// ============================================================

/**
 * Manages all visual elements for a single judgment line:
 *   - Note sprites (pooled)
 *   - Hold note composites (pooled)
 *   - Judgment line visual (rectangle or custom texture)
 *   - Text event display
 *   - Anchor marker
 *   - Multi-selected line highlight
 *   - Flick arrow graphics (pooled)
 *
 * Updated per frame by the main PixiGameRenderer.
 */
export class PixiLineContainer extends Container {
  public lineIndex: number;

  // Child containers (ordered for z-sorting: notes behind line, line behind text)
  private notesContainer: Container;
  private lineVisual: Graphics;
  private lineTextureSprite: Sprite;
  private textDisplay: Text;
  private anchorMarker: Graphics;
  private multiSelectHighlight: Graphics;

  // Sprite pools
  private notePool: SpritePool<Sprite>;
  private holdPool: SpritePool<PixiHoldNoteContainer>;
  private flickArrowPool: SpritePool<Graphics>;

  // Collected note positions for RenderResult
  public renderedNotes: RenderedNoteInfo[] = [];

  constructor(lineIndex: number) {
    super();
    this.lineIndex = lineIndex;

    // Notes are drawn behind the judgment line
    this.notesContainer = new Container();
    this.addChild(this.notesContainer);

    // Judgment line visual (rectangle)
    this.lineVisual = new Graphics();
    this.addChild(this.lineVisual);

    // Custom line texture sprite (hidden by default)
    this.lineTextureSprite = new Sprite();
    this.lineTextureSprite.visible = false;
    this.lineTextureSprite.anchor.set(0.5, 0.5);
    this.addChild(this.lineTextureSprite);

    // Text event display (hidden by default)
    this.textDisplay = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "sans-serif",
        fontSize: 32,
        fontWeight: "bold",
        fill: "#ffffff",
        align: "center",
      }),
    });
    this.textDisplay.anchor.set(0.5, 0.5);
    this.textDisplay.visible = false;
    this.addChild(this.textDisplay);

    // Anchor marker (small circle at line origin)
    this.anchorMarker = new Graphics();
    this.anchorMarker.visible = false;
    this.addChild(this.anchorMarker);

    // Multi-selected line highlight (dashed border)
    this.multiSelectHighlight = new Graphics();
    this.multiSelectHighlight.visible = false;
    this.addChild(this.multiSelectHighlight);

    // Pools
    this.notePool = new SpritePool(this.notesContainer, () => {
      const s = new Sprite();
      s.anchor.set(0.5, 0.5);
      return s;
    });
    this.holdPool = new SpritePool(this.notesContainer, () => new PixiHoldNoteContainer());
    this.flickArrowPool = new SpritePool(this.notesContainer, () => new Graphics());
  }

  /**
   * Update all visuals for this line for the current frame.
   *
   * This is the main per-frame method called by PixiGameRenderer.
   * It applies the world transform, renders notes, the line visual,
   * text events, and other decorations.
   */
  updateLine(
    line: Line,
    worldTransform: WorldTransform,
    currentBeat: number,
    currentTime: number,
    bpmTimeAt: (beat: Beat) => number,
    canvasWidth: number,
    canvasHeight: number,
    noteScale: number,
    selectedLineIndex: number | null,
    selectedNoteIndices: number[] | null,
    multiBeats: Set<number> | null,
    isFcApActive: boolean,
    respackTextures: PixiRespackTextures | null,
    respackConfig: { holdRepeat?: boolean; holdCompact?: boolean; holdKeepHead?: boolean; colorPerfect?: string | null } | null,
    lineTexture: Texture | null,
    options: {
      hideNotes?: boolean;
      anchorMarkerVisibility?: "never" | "always" | "when_visible";
      isMultiSelected?: boolean;
      chartFontFamily?: string | null;
      pendingNote?: { beat: Beat; x: number; kind: NoteKind; above: boolean } | null;
      pendingLineIndex?: number | null;
      hitEffectManager?: HitEffectManager | null;
      pixiHitEffectLayer?: PixiHitEffectLayer | null;
      isPlaying?: boolean;
      showHitEffects?: boolean;
    },
  ): void {
    const state = worldTransform.localState;

    // ---- Apply world transform ----
    this.position.set(worldTransform.worldX, worldTransform.worldY);
    this.rotation = -worldTransform.worldRotation;
    this.scale.set(state.scale_x, state.scale_y);
    // Incline = skew on Y axis
    this.skew.set(0, state.incline !== 0 ? Math.tan(state.incline * Math.PI / 180) : 0);

    // Reset rendered notes collection
    this.renderedNotes = [];

    // Pre-compute values
    const distanceScale = canvasHeight * DISTANCE_SCALE_RATIO;
    const noteW = canvasWidth * NOTE_WIDTH_RATIO * noteScale;
    const noteH = canvasWidth * NOTE_HEIGHT_RATIO * noteScale;
    const speedEvents = line.events.filter((e) => e.kind === "speed");
    const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);
    const bpmFactor = line.bpm_factor ?? 1;
    const isSelectedLine = this.lineIndex === selectedLineIndex;
    const selectedSet = isSelectedLine && selectedNoteIndices
      ? new Set(selectedNoteIndices) : null;

    // ---- Begin pool frames ----
    this.notePool.beginFrame();
    this.holdPool.beginFrame();
    this.flickArrowPool.beginFrame();

    // ---- Draw notes ----
    if (!options.hideNotes && state.opacity >= 0) {
      this.updateNotes(
        line, currentBeat, currentTime, bpmTimeAt,
        canvasWidth, canvasHeight, distanceScale, noteW, noteH,
        speedEvents, currentDistance, bpmFactor,
        selectedSet, multiBeats, isFcApActive,
        respackTextures, respackConfig, worldTransform,
        options.hitEffectManager ?? null,
        options.pixiHitEffectLayer ?? null,
        options.isPlaying ?? false,
        options.showHitEffects !== false,
      );

      // Curve note tracks (semi-transparent)
      this.updateCurveNotes(
        line, currentBeat, bpmTimeAt,
        canvasWidth, canvasHeight, distanceScale, noteW, noteH,
        speedEvents, currentDistance, bpmFactor,
        respackTextures,
      );

      // Pending/ghost note
      if (options.pendingNote && options.pendingLineIndex === this.lineIndex) {
        this.drawPendingNote(
          options.pendingNote, bpmTimeAt,
          canvasWidth, distanceScale, noteW, noteH,
          speedEvents, currentDistance, bpmFactor,
          respackTextures,
        );
      }
    }

    // ---- End pool frames (hide unused sprites) ----
    this.notePool.endFrame();
    this.holdPool.endFrame();
    this.flickArrowPool.endFrame();

    // ---- Judgment line visual ----
    this.updateLineVisual(line, state, canvasWidth, canvasHeight, currentBeat, lineTexture, isFcApActive, respackConfig, options.chartFontFamily);

    // ---- Anchor marker ----
    this.updateAnchorMarker(state, options.anchorMarkerVisibility ?? "never");

    // ---- Multi-select highlight ----
    this.updateMultiSelectHighlight(state, canvasWidth, options.isMultiSelected ?? false);
  }

  // ============================================================
  // Note rendering
  // ============================================================

  private updateNotes(
    line: Line,
    currentBeat: number,
    currentTime: number,
    bpmTimeAt: (beat: Beat) => number,
    canvasWidth: number,
    canvasHeight: number,
    distanceScale: number,
    noteW: number,
    noteH: number,
    speedEvents: LineEvent[],
    currentDistance: number,
    bpmFactor: number,
    selectedSet: Set<number> | null,
    multiBeats: Set<number> | null,
    isFcApActive: boolean,
    respackTextures: PixiRespackTextures | null,
    respackConfig: { holdRepeat?: boolean; holdCompact?: boolean; holdKeepHead?: boolean; colorPerfect?: string | null } | null,
    worldTransform: WorldTransform,
    hitEffectManager: HitEffectManager | null,
    pixiHitEffectLayer: PixiHitEffectLayer | null,
    isPlaying: boolean,
    showHitEffects: boolean,
  ): void {
    const worldRotation = worldTransform.worldRotation;
    const screenX = worldTransform.worldX;
    const screenY = worldTransform.worldY;
    const state = worldTransform.localState;

    for (let noteIdx = 0; noteIdx < line.notes.length; noteIdx++) {
      const note = line.notes[noteIdx];
      const noteBeatF = beatToFloat(note.beat);
      const noteTime = bpmTimeAt(note.beat);

      const holdBeatF = note.hold_beat ? beatToFloat(note.hold_beat) : 0;
      if (noteBeatF + holdBeatF < currentBeat) continue;

      // visibleTime check
      const visibleTime = note.visible_time ?? 999999;
      if (noteTime - currentTime > visibleTime) continue;

      const noteDistance = distanceAt(speedEvents, noteTime, bpmTimeAt);
      const yOffset = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
      const rawY = ((noteDistance - currentDistance) / bpmFactor) * note.speed * distanceScale + yOffset;
      const noteX = (note.x / CANVAS_WIDTH) * canvasWidth;

      // Note controls
      const noteWidthSize = note.size ?? 1.0;
      let sizeControlMul = 1.0;
      let noteAlpha = (note.alpha ?? 255) / 255;
      let noteXOffset = 0;
      const controlPos = Math.max(0, Math.min(1, rawY / (canvasHeight * 2)));
      if (line.pos_control) noteXOffset = evaluateNoteControl(line.pos_control, controlPos) - 1;
      if (line.alpha_control) noteAlpha *= evaluateNoteControl(line.alpha_control, controlPos);
      if (line.size_control) sizeControlMul = evaluateNoteControl(line.size_control, controlPos);

      const scaledNoteW = noteW * noteWidthSize * sizeControlMul;
      const scaledNoteH = noteH * sizeControlMul;
      const finalNoteX = noteX + noteXOffset * canvasWidth;

      // Note color
      const isSelected = selectedSet?.has(noteIdx) ?? false;
      const isMulti = multiBeats?.has(noteBeatF) ?? false;
      const color = resolveNoteColor(note.kind, isSelected, isFcApActive, respackConfig?.colorPerfect);

      if (note.kind === "hold" && note.hold_beat) {
        // Hold note
        const holdContainer = this.holdPool.acquire();
        holdContainer.visible = true;

        const endBeat: Beat = [
          note.beat[0] + note.hold_beat[0],
          note.beat[1] * note.hold_beat[2] + note.hold_beat[1] * note.beat[2],
          note.beat[2] * note.hold_beat[2],
        ];
        const holdEndTime = bpmTimeAt(endBeat);
        const holdEndDistance = distanceAt(speedEvents, holdEndTime, bpmTimeAt);
        const rawEndY = ((holdEndDistance - currentDistance) / bpmFactor) * note.speed * distanceScale;

        const holdKeepHead = respackConfig?.holdKeepHead ?? false;
        const headY = holdKeepHead ? rawY : Math.max(rawY, 0);
        const tailY = rawEndY;
        if (tailY < 0) { holdContainer.visible = false; continue; }
        const bodyHeight = tailY - headY;
        if (bodyHeight < 0) { holdContainer.visible = false; continue; }

        const dir = note.above ? -1 : 1;
        const screenHeadY = headY * dir;
        const screenTailY = tailY * dir;
        const top = Math.min(screenHeadY, screenTailY);

        // Select hold textures (multi-highlight variant if available)
        let holdTextures: PixiHoldTextures | null = null;
        if (respackTextures) {
          holdTextures = (isMulti && respackTextures.holdMH) || respackTextures.hold;
        }

        holdContainer.update(
          finalNoteX, scaledNoteW, scaledNoteH,
          screenHeadY, screenTailY, top, bodyHeight,
          color, holdTextures,
          respackConfig?.holdRepeat ?? false,
          respackConfig?.holdCompact ?? false,
          holdKeepHead, rawY,
        );

        // Collect position for RenderResult (hold head position)
        const holdScreenNoteY = note.above ? -Math.max(rawY, 0) : Math.max(rawY, 0);
        const cos = Math.cos(-worldRotation);
        const sin = Math.sin(-worldRotation);
        const holdNoteScreenX = screenX + (finalNoteX * cos - holdScreenNoteY * sin) * state.scale_x;
        const holdNoteScreenY = screenY + (finalNoteX * sin + holdScreenNoteY * cos) * state.scale_y;
        this.renderedNotes.push({
          noteIndex: noteIdx,
          screenX: holdNoteScreenX,
          screenY: holdNoteScreenY,
          width: scaledNoteW,
          height: scaledNoteH,
          kind: note.kind,
          above: note.above,
          beat: noteBeatF,
        });

        // Hit effect spawning for hold notes
        if (!note.fake && isPlaying && showHitEffects && (pixiHitEffectLayer || hitEffectManager)) {
          const heCos = Math.cos(-worldRotation);
          const heSin = Math.sin(-worldRotation);
          const noteYOff = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
          const localHitY = (note.above ? -1 : 1) * noteYOff;
          const hitX = screenX + noteX * heCos - localHitY * heSin;
          const hitY = screenY + noteX * heSin + localHitY * heCos;
          // Prefer Pixi-native hit effects, fall back to Canvas 2D manager
          const spawner = pixiHitEffectLayer || hitEffectManager!;
          spawner.trySpawnEffect(
            `${this.lineIndex}-${noteIdx}`, noteBeatF, currentBeat,
            hitX, hitY, currentTime,
            note.kind, state.color,
          );
        }
      } else {
        // Regular note (tap, drag, flick)
        if (rawY < 0 && line.is_cover !== false) continue;
        const screenNoteY = note.above ? -rawY : rawY;
        if (Math.abs(screenNoteY) > canvasHeight * 2) continue;

        // Get texture
        const { texture, isRespack } = getNoteTexture(note.kind, isMulti, respackTextures);

        // Acquire sprite from pool
        const sprite = this.notePool.acquire();

        if (note.kind === "drag") {
          configureDragSprite(sprite, texture, finalNoteX, screenNoteY, scaledNoteW, scaledNoteH, color, noteAlpha * 0.9, isRespack);
        } else {
          configureNoteSprite(sprite, texture, finalNoteX, screenNoteY, scaledNoteW, scaledNoteH, color, noteAlpha * 0.9, isRespack);
        }

        // Flick arrow
        if (note.kind === "flick" && !isRespack) {
          const arrow = this.flickArrowPool.acquire();
          drawFlickArrow(arrow, finalNoteX, screenNoteY, scaledNoteW, scaledNoteH, color);
        }

        // Collect position for RenderResult
        const cos = Math.cos(-worldRotation);
        const sin = Math.sin(-worldRotation);
        const noteScreenX = screenX + (finalNoteX * cos - screenNoteY * sin) * state.scale_x;
        const noteScreenY = screenY + (finalNoteX * sin + screenNoteY * cos) * state.scale_y;
        this.renderedNotes.push({
          noteIndex: noteIdx,
          screenX: noteScreenX,
          screenY: noteScreenY,
          width: scaledNoteW,
          height: scaledNoteH,
          kind: note.kind,
          above: note.above,
          beat: noteBeatF,
        });

        // Hit effect spawning (same logic as gameRenderer.ts)
        if (!note.fake && isPlaying && showHitEffects && (pixiHitEffectLayer || hitEffectManager)) {
          const heCos = Math.cos(-worldRotation);
          const heSin = Math.sin(-worldRotation);
          const noteYOff = (note.y_offset ?? 0) * 2 / CANVAS_HEIGHT * note.speed * distanceScale;
          const localHitY = (note.above ? -1 : 1) * noteYOff;
          const hitX = screenX + noteX * heCos - localHitY * heSin;
          const hitY = screenY + noteX * heSin + localHitY * heCos;
          // Prefer Pixi-native hit effects, fall back to Canvas 2D manager
          const spawner = pixiHitEffectLayer || hitEffectManager!;
          spawner.trySpawnEffect(
            `${this.lineIndex}-${noteIdx}`, noteBeatF, currentBeat,
            hitX, hitY, currentTime,
            note.kind, state.color,
          );
        }
      }
    }
  }

  // ============================================================
  // Curve note tracks
  // ============================================================

  private updateCurveNotes(
    line: Line,
    currentBeat: number,
    bpmTimeAt: (beat: Beat) => number,
    canvasWidth: number,
    canvasHeight: number,
    distanceScale: number,
    noteW: number,
    noteH: number,
    speedEvents: LineEvent[],
    currentDistance: number,
    bpmFactor: number,
    respackTextures: PixiRespackTextures | null,
  ): void {
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

        const { texture, isRespack } = getNoteTexture(cn.kind, false, respackTextures);
        const sprite = this.notePool.acquire();
        const cnColor = NOTE_COLORS[cn.kind] ?? 0xffffff;
        configureNoteSprite(sprite, texture, cnX, cnScreenY, noteW, noteH, cnColor, FILTERED_NOTE_ALPHA, isRespack);
      }
    }
  }

  // ============================================================
  // Pending/ghost note
  // ============================================================

  private drawPendingNote(
    pn: { beat: Beat; x: number; kind: NoteKind; above: boolean },
    bpmTimeAt: (beat: Beat) => number,
    canvasWidth: number,
    distanceScale: number,
    noteW: number,
    noteH: number,
    speedEvents: LineEvent[],
    currentDistance: number,
    bpmFactor: number,
    respackTextures: PixiRespackTextures | null,
  ): void {
    const pnTime = bpmTimeAt(pn.beat);
    const pnDistance = distanceAt(speedEvents, pnTime, bpmTimeAt);
    const pnRawY = ((pnDistance - currentDistance) / bpmFactor) * 1.0 * distanceScale;
    if (pnRawY < 0) return;

    const pnX = (pn.x / CANVAS_WIDTH) * canvasWidth;
    const pnScreenY = pn.above ? -pnRawY : pnRawY;
    const pnColor = NOTE_COLORS[pn.kind] ?? 0xffffff;

    const { texture, isRespack } = getNoteTexture(pn.kind, false, respackTextures);
    const sprite = this.notePool.acquire();
    configureNoteSprite(sprite, texture, pnX, pnScreenY, noteW, noteH, pnColor, GHOST_NOTE_ALPHA, isRespack);
  }

  // ============================================================
  // Judgment line visual
  // ============================================================

  private updateLineVisual(
    line: Line,
    state: LineState,
    canvasWidth: number,
    canvasHeight: number,
    currentBeat: number,
    lineTexture: Texture | null,
    isFcApActive: boolean,
    respackConfig: { colorPerfect?: string | null } | null,
    chartFontFamily?: string | null,
  ): void {
    const lineHalfW = canvasWidth * 1.5;

    // Visibility
    if (state.opacity <= 0) {
      this.lineVisual.visible = false;
      this.lineTextureSprite.visible = false;
      this.textDisplay.visible = false;
      this.alpha = 0;
      return;
    }

    this.alpha = state.opacity;

    // Check if line has text events (hides the line rect per RPE spec)
    const lineHasTextEvents = line.events.some((e) => e.kind === "text");

    if (!lineHasTextEvents) {
      if (lineTexture) {
        // Custom texture
        this.lineVisual.visible = false;
        this.lineTextureSprite.visible = true;
        this.lineTextureSprite.texture = lineTexture;
        const texAspect = lineTexture.height / lineTexture.width;
        const texW = lineHalfW * 2;
        const texH = texW * texAspect;
        this.lineTextureSprite.width = texW;
        this.lineTextureSprite.height = texH;
        const anchor = line.anchor ?? [0.5, 0.5];
        this.lineTextureSprite.anchor.set(anchor[0], anchor[1]);
      } else {
        // Default line rectangle
        this.lineTextureSprite.visible = false;
        this.lineVisual.visible = true;
        this.lineVisual.clear();

        // Determine line color
        let lineColor = 0xffffff;
        if (state.color) {
          lineColor = (state.color[0] << 16) | (state.color[1] << 8) | state.color[2];
        } else if (isFcApActive && respackConfig?.colorPerfect) {
          lineColor = parseInt(respackConfig.colorPerfect.replace("#", ""), 16) || 0xfeffa9;
        }

        this.lineVisual.rect(-lineHalfW, -LINE_THICKNESS / 2, lineHalfW * 2, LINE_THICKNESS);
        this.lineVisual.fill({ color: lineColor });
      }
    } else {
      this.lineVisual.visible = false;
      this.lineTextureSprite.visible = false;
    }

    // ---- Text event ----
    if (state.text) {
      const textFontSize = Math.round(canvasHeight * TEXT_EVENT_FONT_RATIO);
      const activeTextEvent = line.events.find(e =>
        e.kind === "text" &&
        beatToFloat(e.start_beat) <= currentBeat &&
        beatToFloat(e.end_beat) >= currentBeat
      );
      const fontFamily = activeTextEvent?.font || chartFontFamily || "sans-serif";

      // Resolve %P% interpolation
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

      // Handle \n newlines
      displayText = displayText.replace(/\\n/g, "\n");

      // Determine text color
      const lineHasColorEvents = line.events.some((e) => e.kind === "color");
      let textColor = "#ffffff";
      if (state.color && lineHasColorEvents) {
        textColor = `rgb(${state.color[0]}, ${state.color[1]}, ${state.color[2]})`;
      }

      // Update text display
      this.textDisplay.visible = true;
      this.textDisplay.text = displayText;
      this.textDisplay.style.fontFamily = `"${fontFamily}", sans-serif`;
      this.textDisplay.style.fontSize = textFontSize;
      this.textDisplay.style.fill = textColor;
      this.textDisplay.style.fontWeight = "bold";
      this.textDisplay.style.align = "center";
    } else {
      this.textDisplay.visible = false;
    }
  }

  // ============================================================
  // Anchor marker
  // ============================================================

  private updateAnchorMarker(
    state: LineState,
    visibility: "never" | "always" | "when_visible",
  ): void {
    const show =
      visibility === "always" ||
      (visibility === "when_visible" && state.opacity > 0);

    if (show) {
      this.anchorMarker.visible = true;
      this.anchorMarker.clear();
      // White filled circle with green stroke
      this.anchorMarker.circle(0, 0, 6);
      this.anchorMarker.fill({ color: 0xffffff, alpha: 0.8 });
      this.anchorMarker.stroke({ width: 2, color: 0x32cd32 });
    } else {
      this.anchorMarker.visible = false;
    }
  }

  // ============================================================
  // Multi-select highlight
  // ============================================================

  private updateMultiSelectHighlight(
    state: LineState,
    canvasWidth: number,
    isMultiSelected: boolean,
  ): void {
    if (isMultiSelected && state.opacity > 0) {
      const lineHalfW = canvasWidth * 1.5;
      this.multiSelectHighlight.visible = true;
      this.multiSelectHighlight.clear();
      this.multiSelectHighlight.rect(-lineHalfW, -6, lineHalfW * 2, 12);
      this.multiSelectHighlight.stroke({ width: 3, color: 0xf59e0b, alpha: 0.6 });
      // Note: dashed lines are not natively supported in Pixi Graphics
      // This renders as a solid outline which is an acceptable visual difference
    } else {
      this.multiSelectHighlight.visible = false;
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================

  override destroy(): void {
    this.notePool.destroy();
    this.holdPool.destroy();
    this.flickArrowPool.destroy();
    super.destroy({ children: true });
  }
}

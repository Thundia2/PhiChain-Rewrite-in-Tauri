// ============================================================
// Video Background Manager
//
// Manages video element playback synchronized to chart time.
// Draws video frames to the game canvas as a background layer.
//
// Supports:
//   - Sync to chart playback time
//   - Scale modes: cropCenter, inside, fit
//   - Animated alpha and dim overlays
// ============================================================

import type { VideoBackground } from "../types/extra";
import { evaluateAnimatedVariable } from "./postProcess";

export class VideoBackgroundManager {
  private video: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private config: VideoBackground | null = null;
  private _loaded = false;

  get loaded(): boolean { return this._loaded; }

  /**
   * Load a video from a URL (object URL or file path).
   */
  async load(url: string, config: VideoBackground): Promise<void> {
    this.unload();

    this.config = config;
    this.videoUrl = url;

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => {
        this._loaded = true;
        resolve();
      };
      video.onerror = () => reject(new Error("Failed to load video background"));
    });

    this.video = video;
  }

  /**
   * Sync video playback time to the chart time.
   * @param currentBeat - Current chart beat
   * @param bpmTimeAt - Function to convert beat to seconds
   * @param isPlaying - Whether playback is active
   */
  sync(_currentBeat: number, currentTime: number, isPlaying: boolean): void {
    if (!this.video || !this.config) return;

    const videoTime = Math.max(0, currentTime);

    // Sync video time (only correct if drift > 0.1s)
    if (Math.abs(this.video.currentTime - videoTime) > 0.1) {
      this.video.currentTime = videoTime;
    }

    if (isPlaying && this.video.paused && videoTime >= 0) {
      this.video.play().catch(() => { /* autoplay may be blocked */ });
    } else if (!isPlaying && !this.video.paused) {
      this.video.pause();
    }
  }

  /**
   * Draw the video frame to the canvas context.
   * Call this before drawing the game scene.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    currentBeat: number,
  ): void {
    if (!this.video || !this.config || !this._loaded) return;
    if (this.video.readyState < 2) return; // Not enough data

    // Evaluate alpha
    let alpha = 1.0;
    if (this.config.alpha != null) {
      if (typeof this.config.alpha === "number") {
        alpha = this.config.alpha;
      } else {
        alpha = evaluateAnimatedVariable(this.config.alpha, currentBeat);
      }
    }

    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) { ctx.restore(); return; }

    const scaleMode = this.config.scale ?? "cropCenter";

    let dx = 0, dy = 0, dw = canvasWidth, dh = canvasHeight;

    if (scaleMode === "cropCenter") {
      // Fill canvas, crop overflow (cover)
      const scale = Math.max(canvasWidth / vw, canvasHeight / vh);
      dw = vw * scale;
      dh = vh * scale;
      dx = (canvasWidth - dw) / 2;
      dy = (canvasHeight - dh) / 2;
    } else if (scaleMode === "inside") {
      // Fit inside canvas (contain), letterbox
      const scale = Math.min(canvasWidth / vw, canvasHeight / vh);
      dw = vw * scale;
      dh = vh * scale;
      dx = (canvasWidth - dw) / 2;
      dy = (canvasHeight - dh) / 2;
    }
    // "fit" = stretch to fill exactly

    ctx.drawImage(this.video, dx, dy, dw, dh);

    // Apply dim overlay
    let dim = 0;
    if (this.config.dim != null) {
      if (typeof this.config.dim === "number") {
        dim = this.config.dim;
      } else {
        dim = evaluateAnimatedVariable(this.config.dim, currentBeat);
      }
    }
    if (dim > 0) {
      ctx.globalAlpha = dim;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    ctx.restore();
  }

  /**
   * Unload the video and free resources.
   */
  unload(): void {
    if (this.video) {
      this.video.pause();
      this.video.src = "";
      this.video.load();
      this.video = null;
    }
    if (this.videoUrl) {
      // Don't revoke — caller manages the URL lifetime
      this.videoUrl = null;
    }
    this.config = null;
    this._loaded = false;
  }
}

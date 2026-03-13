// ============================================================
// Hit Sound Manager — Web Audio API
//
// Plays short audio clips when notes are "hit" during preview.
// Supports:
//   - Default synthesized sounds (tap/drag/flick)
//   - Custom sounds loaded from respack (click.ogg/drag.ogg/flick.ogg)
//   - Volume control
// ============================================================

import type { NoteKind } from "../types/chart";

export class HitSoundManager {
  private ctx: AudioContext | null = null;
  private defaultBuffers: Map<NoteKind, AudioBuffer> = new Map();
  private customBuffers: Map<NoteKind, AudioBuffer> = new Map();
  private endingBuffer: AudioBuffer | null = null;
  private endingSource: AudioBufferSourceNode | null = null;
  private volume = 0.5;
  private enabled = true;

  /** Initialize the AudioContext (must be called after user interaction) */
  initialize(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.synthesizeDefaults();
  }

  /** Set whether hit sounds are enabled */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Set volume (0-1) */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Load a custom sound from an audio blob (e.g. from respack).
   */
  async loadCustomSound(kind: NoteKind, blob: Blob): Promise<void> {
    if (!this.ctx) this.initialize();
    const ctx = this.ctx!;
    const arrayBuf = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuf);
    this.customBuffers.set(kind, audioBuffer);
  }

  /**
   * Load the ending/results screen BGM from an audio blob (from respack).
   */
  async loadEndingSound(blob: Blob): Promise<void> {
    if (!this.ctx) this.initialize();
    const ctx = this.ctx!;
    const arrayBuf = await blob.arrayBuffer();
    this.endingBuffer = await ctx.decodeAudioData(arrayBuf);
  }

  /**
   * Play the ending/results screen BGM. Loops until stopEnding() is called.
   */
  playEnding(): void {
    if (!this.ctx || !this.endingBuffer) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.stopEnding();
    const source = this.ctx.createBufferSource();
    source.buffer = this.endingBuffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
    this.endingSource = source;
  }

  /** Stop the ending BGM if playing */
  stopEnding(): void {
    if (this.endingSource) {
      try { this.endingSource.stop(); } catch { /* already stopped */ }
      this.endingSource = null;
    }
  }

  /** Whether an ending sound is available */
  hasEndingSound(): boolean {
    return this.endingBuffer !== null;
  }

  /** Clear all custom sounds (e.g. when respack changes) */
  clearCustomSounds(): void {
    this.customBuffers.clear();
    this.endingBuffer = null;
    this.stopEnding();
  }

  /**
   * Play the hit sound for a given note kind.
   * Uses custom sound if available, otherwise the default synthesized sound.
   */
  play(kind: NoteKind): void {
    if (!this.enabled || !this.ctx) return;

    // Resume context if suspended (autoplay policy)
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const buffer = this.customBuffers.get(kind) ?? this.defaultBuffers.get(kind);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  /** Dispose of the AudioContext */
  dispose(): void {
    this.stopEnding();
    this.ctx?.close();
    this.ctx = null;
    this.defaultBuffers.clear();
    this.customBuffers.clear();
    this.endingBuffer = null;
  }

  // ---- Synthesize default sounds ----

  private synthesizeDefaults(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const duration = 0.08; // 80ms
    const length = Math.ceil(sampleRate * duration);

    // Tap: 800Hz sine click
    this.defaultBuffers.set("tap", this.synthSine(sampleRate, length, 800));

    // Hold: same as tap
    this.defaultBuffers.set("hold", this.synthSine(sampleRate, length, 800));

    // Drag: 600Hz sine (softer feel)
    this.defaultBuffers.set("drag", this.synthSine(sampleRate, length, 600));

    // Flick: 1000Hz sine (brighter)
    this.defaultBuffers.set("flick", this.synthSine(sampleRate, length, 1000));
  }

  private synthSine(sampleRate: number, length: number, freq: number): AudioBuffer {
    const buffer = this.ctx!.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = 1 - i / length; // linear decay
      data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.6;
    }
    return buffer;
  }
}

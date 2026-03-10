// ============================================================
// Audio Engine — Howler.js wrapper
//
// Manages music playback: load, play, pause, seek, rate control.
// Syncs playback state to the audioStore so the UI stays updated.
//
// When no music is loaded, playback still works via a manual
// timer so the timeline/preview can be previewed without audio.
// ============================================================

import { Howl } from "howler";
import { useAudioStore } from "../stores/audioStore";
import { useSettingsStore } from "../stores/settingsStore";

class AudioEngine {
  private howl: Howl | null = null;
  private rafId = 0;
  private _loaded = false;
  private _volume = 1.0;

  /** For timer-based playback when no audio is loaded */
  private lastFrameTime = 0;

  /** Whether a music file is currently loaded */
  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * Load a music file from a URL or object URL.
   * @param src - URL or blob URL to load
   * @param format - Audio format hint (e.g., "mp3", "wav"). Required for blob URLs
   *                 since they have no file extension for Howler to detect from.
   */
  load(src: string, format?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.unload();

      // Read current music volume from settings
      this._volume = useSettingsStore.getState().musicVolume;

      this.howl = new Howl({
        src: [src],
        ...(format ? { format: [format] } : {}),
        html5: true, // Stream from disk — don't decode entire file into memory
        preload: true,
        volume: this._volume * this._volume * this._volume,
        onload: () => {
          this._loaded = true;
          const duration = this.howl?.duration() ?? 0;
          useAudioStore.getState().setDuration(duration);
          resolve();
        },
        onloaderror: (_id, err) => {
          this._loaded = false;
          reject(new Error(`Failed to load audio: ${err}`));
        },
        onend: () => {
          useAudioStore.getState().pause();
          this.stopTimeSync();
        },
      });
    });
  }

  /** Unload the current music file */
  unload(): void {
    this.stopTimeSync();
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
    this._loaded = false;
    const store = useAudioStore.getState();
    store.setDuration(0);
    store.setCurrentTime(0);
    store.pause();
  }

  /** Start or resume playback */
  play(): void {
    if (this.howl && this._loaded) {
      this.howl.play();
      this.howl.rate(useAudioStore.getState().playbackRate);
    }
    this.lastFrameTime = performance.now();
    useAudioStore.getState().play();
    this.startTimeSync();
  }

  /** Pause playback */
  pause(): void {
    if (this.howl) {
      this.howl.pause();
    }
    useAudioStore.getState().pause();
    this.stopTimeSync();
  }

  /** Toggle play/pause */
  togglePlayPause(): void {
    if (useAudioStore.getState().isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Stop playback and reset to beginning */
  stop(): void {
    if (this.howl) {
      this.howl.stop();
    }
    useAudioStore.getState().stop();
    this.stopTimeSync();
  }

  /** Seek to a specific time in seconds */
  seek(time: number): void {
    if (this.howl) {
      this.howl.seek(time);
    }
    useAudioStore.getState().setCurrentTime(time);
  }

  /** Set playback rate (0.25 - 2.0) */
  setRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(2.0, rate));
    if (this.howl) {
      this.howl.rate(clamped);
    }
    // Use internal setter to avoid circular call:
    // setPlaybackRate → setRate → setPlaybackRate → ...
    useAudioStore.getState()._setPlaybackRateInternal(clamped);
  }

  /**
   * Set music volume (0.0 - 1.0, linear slider value).
   * Applies a cubic curve so low slider values produce much quieter
   * output, matching human perception of loudness:
   *   5% → 0.0001, 10% → 0.001, 50% → 0.125, 100% → 1.0
   */
  setVolume(volume: number): void {
    const linear = Math.max(0, Math.min(1, volume));
    this._volume = linear;
    const actual = linear * linear * linear;
    if (this.howl) {
      this.howl.volume(actual);
    }
  }

  /** Get current playback position in seconds */
  getCurrentTime(): number {
    if (this.howl && this._loaded) {
      const pos = this.howl.seek();
      return typeof pos === "number" ? pos : 0;
    }
    return useAudioStore.getState().currentTime;
  }

  /** Continuously sync playback time to the store while playing */
  private startTimeSync(): void {
    this.stopTimeSync();
    this.lastFrameTime = performance.now();

    const tick = () => {
      const store = useAudioStore.getState();
      if (!store.isPlaying) {
        this.rafId = 0;
        return;
      }

      if (this.howl && this._loaded) {
        // Audio-driven: read position from Howler
        const time = this.getCurrentTime();
        store.setCurrentTime(time);

        // Stop at end of audio
        if (store.duration > 0 && time >= store.duration) {
          this.pause();
          return;
        }
      } else {
        // Timer-driven: advance time manually using playback rate
        const now = performance.now();
        const delta = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        const newTime = store.currentTime + delta * store.playbackRate;
        store.setCurrentTime(newTime);
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTimeSync(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}

/** Singleton audio engine instance */
export const audioEngine = new AudioEngine();

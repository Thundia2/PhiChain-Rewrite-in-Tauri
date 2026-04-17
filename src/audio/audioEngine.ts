// ============================================================
// Audio Engine — Howler.js wrapper
//
// Manages music playback: load, play, pause, seek, rate control.
// Syncs playback state to the audioStore so the UI stays updated.
//
// When no music is loaded, playback still works via a manual
// timer so the timeline/preview can be previewed without audio.
//
// Recent change (bug audit #7): Removed leftover DEBUG `console.warn`
// statements (with full stack traces) from load() and unload().
// They were left from a "ghost song" debugging session and were
// spamming the console on every load/unload, costing stack-capture
// overhead and masking real warnings.
// ============================================================

import { Howl } from "howler";
import { useAudioStore } from "../stores/audioStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useChartStore } from "../stores/chartStore";
import { getCachedBpmList } from "../stores/chartStore";

class AudioEngine {
  private howl: Howl | null = null;
  private rafId = 0;
  private _loaded = false;
  private _volume = 1.0;
  private _soundId: number | null = null;
  /** URL of the currently loaded audio file (for onset detection) */
  private _currentUrl: string | null = null;

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
    // Blob URLs (from zip/pez imports) have the entire file in memory.
    // Use Web Audio API (html5: false) for these — it fully decodes the
    // audio buffer, so duration is always accurate. HTML5 audio elements
    // may report a truncated duration before metadata finishes loading,
    // causing playback to stop prematurely.
    const preferHtml5 = !src.startsWith("blob:");
    return this._loadWithMode(src, format, preferHtml5).catch(() => {
      console.warn("[AudioEngine] Audio load failed, retrying with alternate mode…");
      return this._loadWithMode(src, format, !preferHtml5);
    });
  }

  /** Internal: attempt to load with the given html5 mode. */
  private _loadWithMode(src: string, format: string | undefined, html5: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.unload();

      // Read current music volume from settings
      this._volume = useSettingsStore.getState().musicVolume;

      this.howl = new Howl({
        src: [src],
        ...(format ? { format: [format] } : {}),
        html5, // true = stream via <audio>; false = full decode via Web Audio API
        preload: true,
        volume: this._volume * this._volume * this._volume,
        onload: () => {
          this._loaded = true;
          this._currentUrl = src; // Set after successful load (not before unload() clears it)
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
    this._soundId = null;
    this._loaded = false;
    this._currentUrl = null;
    const store = useAudioStore.getState();
    store.setDuration(0);
    store.setCurrentTime(0);
    store.pause();
  }

  /** Start or resume playback */
  play(): void {
    if (this.howl && this._loaded) {
      if (this._soundId !== null) {
        this.howl.play(this._soundId);
      } else {
        this._soundId = this.howl.play();
      }
      this.howl.rate(useAudioStore.getState().playbackRate, this._soundId!);
    }
    this.lastFrameTime = performance.now();
    useAudioStore.getState().play();
    this.startTimeSync();
  }

  /** Pause playback */
  pause(): void {
    if (this.howl && this._soundId !== null) {
      this.howl.pause(this._soundId);
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
      if (this._soundId !== null) {
        this.howl.stop(this._soundId);
      } else {
        this.howl.stop();
      }
      this._soundId = null;
    }
    useAudioStore.getState().stop();
    this.stopTimeSync();
  }

  /** Seek to a specific time in seconds */
  seek(time: number): void {
    if (this.howl) {
      this.howl.seek(time, this._soundId ?? undefined);
    }
    useAudioStore.getState().setCurrentTime(time);
  }

  /** Set playback rate (0.25 - 2.0) */
  setRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(2.0, rate));
    if (this.howl) {
      this.howl.rate(clamped, this._soundId ?? undefined);
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
      if (this._soundId !== null) {
        this.howl.volume(actual, this._soundId);
      } else {
        this.howl.volume(actual);
      }
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

      let time: number;
      if (this.howl && this._loaded) {
        // Audio-driven: read position from Howler.
        // Howler's onend callback handles natural end-of-audio (pause + stopTimeSync).
        // No manual duration check here — Howler may report an inaccurate duration
        // for blob URLs, which would cause playback to stop prematurely.
        time = this.getCurrentTime();
      } else {
        // Timer-driven: advance time manually using playback rate
        const now = performance.now();
        const delta = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        time = store.currentTime + delta * store.playbackRate;
      }

      // ---- Loop region: seek back to loop start when we reach loop end ----
      if (store.loopEnabled && store.loopStartBeat !== null && store.loopEndBeat !== null) {
        try {
          const cs = useChartStore.getState();
          // Use cached BpmList — avoids O(n) construction 60x/sec in loop mode
          const bpmList = getCachedBpmList();
          const loopEndSec = bpmList.timeAtFloat(store.loopEndBeat) + cs.chart.offset;
          if (time >= loopEndSec) {
            const loopStartSec = bpmList.timeAtFloat(store.loopStartBeat) + cs.chart.offset;
            this.seek(loopStartSec);
            store.setCurrentTime(loopStartSec);
            this.rafId = requestAnimationFrame(tick);
            return;
          }
        } catch {
          // BpmList construction may fail if chart isn't loaded — ignore silently
        }
      }

      store.setCurrentTime(time);
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

  /** Get the URL of the currently loaded audio (for onset detection analysis). */
  getCurrentUrl(): string | null {
    return this._currentUrl;
  }
}

/** Singleton audio engine instance */
export const audioEngine = new AudioEngine();

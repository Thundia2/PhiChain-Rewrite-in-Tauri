// ============================================================
// Audio Store — Zustand
//
// Playback state synced with the AudioEngine (Howler.js).
// The engine pushes time updates here; UI reads from here.
//
// Important: play/pause/stop are internal setters called by the
// engine only. UI components use togglePlayPause/seek which
// delegate to the engine (engine then calls setters back).
// This avoids circular calls.
//
// Recent change: Added loop region state (loopEnabled,
// loopStartBeat, loopEndBeat) and actions (setLoopStart,
// setLoopEnd, toggleLoop, clearLoop) for A/B loop playback.
//
// Usage:
//   const isPlaying = useAudioStore(s => s.isPlaying);
//   const togglePlayPause = useAudioStore(s => s.togglePlayPause);
// ============================================================

import { create } from "zustand";
import { audioEngine } from "../audio/audioEngine";

export interface AudioState {
  isPlaying: boolean;
  currentTime: number; // seconds
  duration: number; // seconds
  playbackRate: number;
  metronomeEnabled: boolean;
  hitSoundEnabled: boolean;
  musicLoaded: boolean;

  // ---- Loop region ----
  loopEnabled: boolean;
  loopStartBeat: number | null; // float beat value, null = not set
  loopEndBeat: number | null;   // float beat value, null = not set

  // ---- UI actions (delegate to engine) ----
  /** Toggle play/pause. Delegates to audioEngine and updates isPlaying. */
  togglePlayPause: () => void;
  /** Seek to a specific time in seconds. Clamps to [0, duration]. */
  seek: (time: number) => void;
  /** Set playback speed (0.25x to 2x). Persists to audioEngine. */
  setPlaybackRate: (rate: number) => void;
  toggleMetronome: () => void;
  toggleHitSound: () => void;

  // ---- Loop region actions ----
  /** Set the loop start beat. Pass null to clear. */
  setLoopStart: (beat: number | null) => void;
  /** Set the loop end beat. Pass null to clear. */
  setLoopEnd: (beat: number | null) => void;
  toggleLoop: () => void;
  /** Disable loop and clear both start/end beats. */
  clearLoop: () => void;

  // ---- Internal setters (called by engine, NOT by UI directly) ----
  play: () => void;
  pause: () => void;
  stop: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setMusicLoaded: (loaded: boolean) => void;
  /** Internal: set playback rate state without calling engine (avoids circular call) */
  _setPlaybackRateInternal: (rate: number) => void;
}

export const useAudioStore = create<AudioState>()((set, _get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  metronomeEnabled: false,
  hitSoundEnabled: true,
  musicLoaded: false,

  // ---- Loop region ----
  loopEnabled: false,
  loopStartBeat: null,
  loopEndBeat: null,

  // ---- UI actions (delegate to engine) ----
  togglePlayPause: () => {
    audioEngine.togglePlayPause();
  },

  seek: (time) => {
    // Don't clamp to store.duration — Howler may report an inaccurate duration
    // for blob URLs (zip imports). Howler handles out-of-range seeks internally.
    const clamped = Math.max(0, time);
    audioEngine.seek(clamped);
  },

  setPlaybackRate: (rate) => {
    audioEngine.setRate(rate);
  },

  toggleMetronome: () =>
    set((state) => ({ metronomeEnabled: !state.metronomeEnabled })),

  toggleHitSound: () =>
    set((state) => ({ hitSoundEnabled: !state.hitSoundEnabled })),

  // ---- Loop region actions ----
  setLoopStart: (beat) => set({ loopStartBeat: beat }),
  setLoopEnd: (beat) => set({ loopEndBeat: beat }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  clearLoop: () => set({ loopEnabled: false, loopStartBeat: null, loopEndBeat: null }),

  // ---- Internal setters (called by engine, NOT by UI directly) ----
  // These ONLY set state. They do NOT call back to the engine.
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setMusicLoaded: (loaded) => set({ musicLoaded: loaded }),
  _setPlaybackRateInternal: (rate: number) => set({ playbackRate: rate }),
}));

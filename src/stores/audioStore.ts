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

  // ---- UI actions (delegate to engine) ----
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  toggleMetronome: () => void;
  toggleHitSound: () => void;

  // ---- Internal setters (called by engine, NOT by UI directly) ----
  play: () => void;
  pause: () => void;
  stop: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setMusicLoaded: (loaded: boolean) => void;
}

export const useAudioStore = create<AudioState>()((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  metronomeEnabled: false,
  hitSoundEnabled: true,
  musicLoaded: false,

  // ---- UI actions (delegate to engine) ----
  togglePlayPause: () => {
    audioEngine.togglePlayPause();
  },

  seek: (time) => {
    const { duration } = get();
    const clamped = duration > 0 ? Math.max(0, Math.min(time, duration)) : Math.max(0, time);
    audioEngine.seek(clamped);
  },

  setPlaybackRate: (rate) => {
    audioEngine.setRate(rate);
  },

  toggleMetronome: () =>
    set((state) => ({ metronomeEnabled: !state.metronomeEnabled })),

  toggleHitSound: () =>
    set((state) => ({ hitSoundEnabled: !state.hitSoundEnabled })),

  // ---- Internal setters (called by engine) ----
  // These ONLY set state. They do NOT call back to the engine.
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setMusicLoaded: (loaded) => set({ musicLoaded: loaded }),
}));

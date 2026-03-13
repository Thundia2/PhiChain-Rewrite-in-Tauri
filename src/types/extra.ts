// ============================================================
// extra.json Types — prpr/Phira Extended Features
//
// These types define the structure of extra.json, which controls
// post-processing shader effects and video backgrounds in
// Phira/prpr chart players.
//
// Reference: Phira documentation (prpr extended features section)
//
// Format: extra.json sits in the root of a .pez ZIP file.
// Animation variables use RPE-style events with startTime/endTime.
// ============================================================

import type { Beat } from "./chart";

// ============================================================
// BPM Config (required in extra.json for beat timing)
// ============================================================

export interface ExtraBpmEntry {
  time: Beat;
  bpm: number;
}

// ============================================================
// Animated Variables (RPE-style events)
// ============================================================

/**
 * A single animation event (RPE format).
 * Used for shader uniform variables and video properties.
 */
export interface AnimationEvent {
  startTime: Beat;
  endTime: Beat;
  /** Easing type (RPE numeric, default 1=linear) */
  easingType?: number;
  /** Easing sub-range start (0.0-1.0) */
  easingLeft?: number;
  /** Easing sub-range end (0.0-1.0) */
  easingRight?: number;
  /** Start value (float, vec2 as [x,y], or color as [r,g,b,a]) */
  start: number | number[];
  /** End value (same type as start) */
  end: number | number[];
}

/**
 * An animated variable: either a constant number or an array of events.
 * prpr supports both formats for convenience:
 *   - number: constant value (e.g., "power": 0.5)
 *   - AnimationEvent[]: animated over time (e.g., "power": [{startTime:..., ...}])
 */
export type AnimatedVariable = number | AnimationEvent[];

// ============================================================
// Shader Effects
// ============================================================

/** Built-in shader effect names available in prpr/Phira */
export type BuiltinShaderName =
  | "chromatic"    // Chromatic aberration
  | "circleBlur"   // Circular blur
  | "fisheye"      // Fisheye lens distortion
  | "glitch"       // Digital glitch effect
  | "grayscale"    // Convert to grayscale
  | "noise"        // Noise/grain overlay
  | "pixel"        // Pixelation
  | "radialBlur"   // Radial/zoom blur
  | "shockwave"    // Shockwave ripple
  | "vignette";    // Dark edges vignette

/** A shader effect instance in the chart */
export interface ShaderEffect {
  /** Start beat of the effect (RPE format: [bar, numerator, denominator]) */
  start: Beat;
  /** End beat of the effect */
  end: Beat;
  /** Shader name — built-in name or custom path starting with "/" */
  shader: BuiltinShaderName | string;
  /** Whether the effect applies globally (including UI) or just the game scene */
  global?: boolean;
  /** Shader uniform variables (name → constant or animated value) */
  vars?: Record<string, AnimatedVariable>;
  /** Custom GLSL shader source (for non-builtin shaders) */
  customShaderSource?: string;
}

// ============================================================
// Video Background
// ============================================================

/** Video background configuration */
export interface VideoBackground {
  /** Path to the video file (relative to chart root) */
  path: string;
  /** Beat at which video playback starts (default: [0,0,1]) */
  time?: Beat;
  /** Scale/fit mode: cropCenter (default), inside, fit */
  scale?: "cropCenter" | "inside" | "fit";
  /** Video opacity (0.0-1.0, can be animated) */
  alpha?: AnimatedVariable;
  /** Video dim overlay opacity (0.0-1.0, can be animated) */
  dim?: AnimatedVariable;
}

// ============================================================
// Full extra.json Structure
// ============================================================

/** The complete extra.json configuration */
export interface ExtraConfig {
  /** BPM list for timing (required if using effects/videos) */
  bpm?: ExtraBpmEntry[];
  /** Post-processing shader effects */
  effects?: ShaderEffect[];
  /** Video background configuration */
  videos?: VideoBackground[];
  /** Global settings */
  global?: {
    /** Background dim override (0.0-1.0) */
    backgroundDim?: number;
    /** Note size multiplier */
    noteScale?: number;
  };
}

/** Default empty extra config */
export const DEFAULT_EXTRA_CONFIG: ExtraConfig = {
  effects: [],
  videos: [],
};

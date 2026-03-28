// ============================================================
// Shader Preview -- WebGL-based live preview of a single effect
//
// Renders a 200x150 WebGL canvas applying the selected shader
// to a sample image (the chart illustration if available, or a
// generated gradient). Updates in real-time as parameters change.
//
// Falls back to CSS filter approximations if WebGL is unavailable.
// ============================================================

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import type { ShaderEffect, AnimatedVariable, AnimationEvent } from "../../types/extra";
import { beatToFloat } from "../../types/chart";
import {
  VERTEX_SHADER,
  BUILTIN_SHADERS as SHADER_SOURCES,
  SHADER_DEFAULTS,
} from "../../canvas/shaders";
import { BpmList } from "../../utils/bpmList";

// ---- Constants ----
const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 150;

interface ShaderPreviewProps {
  effect: ShaderEffect;
}

// ============================================================
// Main Component
// ============================================================

export function ShaderPreview({ effect }: ShaderPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLState | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const illustrationImage = useChartStore((s) => s.illustrationImage);
  const currentTime = useAudioStore((s) => s.currentTime);
  const bpmListRaw = useChartStore((s) => s.chart.bpm_list);

  const bpmCalc = useMemo(() => new BpmList(bpmListRaw), [bpmListRaw]);
  const currentBeat = bpmCalc.beatAtFloat(currentTime);

  // Resolve current uniform values at the current beat
  const uniforms = useMemo(() => {
    return resolveUniforms(effect, currentBeat, currentTime);
  }, [effect, currentBeat, currentTime]);

  const shaderSource = SHADER_SOURCES[effect.shader] ?? null;

  // Store uniforms and currentTime in refs so the render loop doesn't
  // need to depend on them (avoids teardown/recreation 60x/sec).
  const uniformsRef = useRef(uniforms);
  uniformsRef.current = uniforms;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // ---- Initialize WebGL ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shaderSource) return;

    try {
      const state = initWebGL(canvas, shaderSource);
      if (state) {
        glRef.current = state;

        // Upload texture: illustration or fallback gradient
        const img = illustrationImage;
        if (img && img.complete && img.naturalWidth > 0) {
          uploadTexture(state, img);
        } else {
          uploadFallbackTexture(state);
        }
      } else {
        setWebglFailed(true);
      }
    } catch (_err) {
      setWebglFailed(true);
    }

    return () => {
      if (glRef.current) {
        cleanupWebGL(glRef.current);
        glRef.current = null;
      }
    };
  }, [shaderSource]); // Removed illustrationImage — handled by separate effect below

  // ---- Re-upload texture when illustration changes ----
  useEffect(() => {
    const state = glRef.current;
    if (!state) return;

    if (illustrationImage && illustrationImage.complete && illustrationImage.naturalWidth > 0) {
      uploadTexture(state, illustrationImage);
    } else {
      uploadFallbackTexture(state);
    }
  }, [illustrationImage]);

  // ---- Render loop (reads from refs, only depends on webglFailed) ----
  useEffect(() => {
    if (webglFailed) return;

    let rafId = 0;
    const render = () => {
      const state = glRef.current;
      if (state) {
        renderFrame(state, uniformsRef.current, currentTimeRef.current);
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [webglFailed]);

  // ---- CSS filter fallback ----
  if (webglFailed || !shaderSource) {
    return (
      <CSSFilterFallback
        effect={effect}
        uniforms={uniforms}
        illustrationImage={illustrationImage}
      />
    );
  }

  return (
    <div style={{
      borderRadius: 6,
      overflow: "hidden",
      border: "1px solid var(--border-color)",
      backgroundColor: "#000",
    }}>
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        style={{
          display: "block",
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
        }}
      />
      <div style={{
        fontSize: 8,
        color: "var(--text-muted)",
        padding: "2px 4px",
        backgroundColor: "var(--bg-secondary)",
        textAlign: "center",
      }}>
        {effect.shader} preview (WebGL)
      </div>
    </div>
  );
}

// ============================================================
// CSS Filter Fallback
// ============================================================

function CSSFilterFallback({
  effect,
  uniforms,
  illustrationImage,
}: {
  effect: ShaderEffect;
  uniforms: Record<string, number>;
  illustrationImage: HTMLImageElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw illustration or fallback gradient
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (illustrationImage && illustrationImage.complete && illustrationImage.naturalWidth > 0) {
      // Draw illustration scaled to fill
      const scale = Math.max(
        PREVIEW_WIDTH / illustrationImage.naturalWidth,
        PREVIEW_HEIGHT / illustrationImage.naturalHeight,
      );
      const sw = illustrationImage.naturalWidth * scale;
      const sh = illustrationImage.naturalHeight * scale;
      const sx = (PREVIEW_WIDTH - sw) / 2;
      const sy = (PREVIEW_HEIGHT - sh) / 2;
      ctx.drawImage(illustrationImage, sx, sy, sw, sh);
    } else {
      // Gradient fallback
      const grad = ctx.createLinearGradient(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      grad.addColorStop(0, "#2b2d42");
      grad.addColorStop(0.5, "#8d99ae");
      grad.addColorStop(1, "#edf2f4");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      // Add some visual elements
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(100, 75, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(239,71,111,0.3)";
      ctx.beginPath();
      ctx.arc(60, 50, 25, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [illustrationImage]);

  // Build CSS filter string based on shader type
  const cssFilter = useMemo(() => {
    switch (effect.shader) {
      case "chromatic":
        return `hue-rotate(${(uniforms.power ?? 0.01) * 500}deg)`;
      case "circleBlur":
      case "radialBlur":
        return `blur(${Math.min(10, (uniforms.size ?? uniforms.power ?? 10) * 0.5)}px)`;
      case "fisheye":
        return `contrast(${1 + Math.abs(uniforms.power ?? 0.1) * 3})`;
      case "glitch":
        return `saturate(${1 + (uniforms.colorRate ?? 0.01) * 50}) contrast(${1 + (uniforms.power ?? 0.3) * 0.5})`;
      case "grayscale":
        return `grayscale(${(uniforms.factor ?? 1) * 100}%)`;
      case "noise":
        return `contrast(${1 + (uniforms.power ?? 0.03) * 10})`;
      case "pixel":
        // No good CSS equivalent; just darken slightly
        return `brightness(${1 - (uniforms.size ?? 10) * 0.01})`;
      case "shockwave":
        return `brightness(${1 + (uniforms.distortion ?? 0.8) * 0.2})`;
      case "vignette":
        return `brightness(${1 - (uniforms.extend ?? 0.25) * 0.4})`;
      default:
        return "none";
    }
  }, [effect.shader, uniforms]);

  // Glitch animation overlay
  const isGlitch = effect.shader === "glitch";
  const glitchStyle: React.CSSProperties = isGlitch
    ? {
        animation: "glitch-shift 0.3s steps(2) infinite alternate",
        clipPath: `inset(${Math.random() * 30}% 0 ${Math.random() * 30}% 0)`,
      }
    : {};

  return (
    <div style={{
      borderRadius: 6,
      overflow: "hidden",
      border: "1px solid var(--border-color)",
      backgroundColor: "#000",
      position: "relative",
    }}>
      <div style={{ position: "relative", width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          style={{
            display: "block",
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            filter: cssFilter,
            ...glitchStyle,
          }}
        />
        {/* Vignette overlay */}
        {effect.shader === "vignette" && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent ${(1 - (uniforms.extend ?? 0.25)) * 70}%, rgba(0,0,0,${uniforms.extend ?? 0.25}) 100%)`,
            pointerEvents: "none",
          }} />
        )}
      </div>
      <div style={{
        fontSize: 8,
        color: "var(--text-muted)",
        padding: "2px 4px",
        backgroundColor: "var(--bg-secondary)",
        textAlign: "center",
      }}>
        {effect.shader} preview (CSS approx.)
      </div>
      {/* Glitch keyframes injected via style tag */}
      {isGlitch && (
        <style>{`
          @keyframes glitch-shift {
            0% { transform: translateX(-2px); }
            25% { transform: translateX(2px); }
            50% { transform: translateX(-1px) skewX(1deg); }
            75% { transform: translateX(1px); }
            100% { transform: translateX(0); }
          }
        `}</style>
      )}
    </div>
  );
}

// ============================================================
// WebGL Helpers
// ============================================================

interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  posBuffer: WebGLBuffer;
  texBuffer: WebGLBuffer;
  uniformLocations: Map<string, WebGLUniformLocation>;
}

function initWebGL(canvas: HTMLCanvasElement, fragmentSource: string): WebGLState | null {
  const gl = canvas.getContext("webgl", {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  if (!gl) return null;

  // Compile shaders
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertShader || !fragShader) return null;

  // Link program
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }

  gl.useProgram(program);

  // Fullscreen quad vertices
  const posBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, "a_position");
  if (posLoc >= 0) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  // Texture coordinates
  const texBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0,  1, 0,  0, 1,
    0, 1,  1, 0,  1, 1,
  ]), gl.STATIC_DRAW);

  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  if (texLoc >= 0) {
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  }

  // Create texture
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Cache uniform locations
  const uniformLocations = new Map<string, WebGLUniformLocation>();
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < numUniforms; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) {
      const loc = gl.getUniformLocation(program, info.name);
      if (loc) uniformLocations.set(info.name, loc);
    }
  }

  return { gl, program, texture, posBuffer, texBuffer, uniformLocations };
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function uploadTexture(state: WebGLState, image: HTMLImageElement) {
  const { gl, texture } = state;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

function uploadFallbackTexture(state: WebGLState) {
  const { gl, texture } = state;

  // Create a small gradient texture
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const fx = x / size;
      const fy = y / size;
      pixels[idx + 0] = Math.floor(43 + fx * 100);   // R
      pixels[idx + 1] = Math.floor(45 + fy * 80);    // G
      pixels[idx + 2] = Math.floor(66 + (fx + fy) * 50); // B
      pixels[idx + 3] = 255;                          // A
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
}

function renderFrame(
  state: WebGLState,
  uniforms: Record<string, number>,
  time: number,
) {
  const { gl, program, uniformLocations } = state;

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(program);

  // Bind texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  const screenTexLoc = uniformLocations.get("screenTexture");
  if (screenTexLoc) gl.uniform1i(screenTexLoc, 0);

  // Screen size
  const screenSizeLoc = uniformLocations.get("screenSize");
  if (screenSizeLoc) gl.uniform2f(screenSizeLoc, gl.canvas.width, gl.canvas.height);

  // Time
  const timeLoc = uniformLocations.get("time");
  if (timeLoc) gl.uniform1f(timeLoc, time);

  // Shader-specific uniforms
  for (const [name, value] of Object.entries(uniforms)) {
    const loc = uniformLocations.get(name);
    if (!loc) continue;

    gl.uniform1f(loc, value);
  }

  // Handle vec4 color uniform for vignette
  const colorLoc = uniformLocations.get("color");
  if (colorLoc) {
    // Default vignette color is black with full alpha
    gl.uniform4f(colorLoc, 0, 0, 0, 1);
  }

  // Rebind position buffer for draw
  gl.bindBuffer(gl.ARRAY_BUFFER, state.posBuffer);
  const posLoc = gl.getAttribLocation(program, "a_position");
  if (posLoc >= 0) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  // Rebind tex coord buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, state.texBuffer);
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  if (texLoc >= 0) {
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function cleanupWebGL(state: WebGLState) {
  const { gl, program, texture, posBuffer, texBuffer } = state;
  gl.deleteTexture(texture);
  gl.deleteBuffer(posBuffer);
  gl.deleteBuffer(texBuffer);
  gl.deleteProgram(program);
}

// ============================================================
// Uniform Resolution
// ============================================================

/** Resolve all shader uniforms to concrete numbers at a given beat */
function resolveUniforms(
  effect: ShaderEffect,
  currentBeat: number,
  _currentTime: number,
): Record<string, number> {
  const defaults = SHADER_DEFAULTS[effect.shader] ?? {};
  const vars = effect.vars ?? {};
  const result: Record<string, number> = {};

  for (const [name, defVal] of Object.entries(defaults)) {
    // Skip non-numeric defaults (like vec4 arrays)
    if (Array.isArray(defVal)) continue;
    const defaultNum = defVal as number;

    const varVal: AnimatedVariable | undefined = vars[name];

    if (varVal === undefined || varVal === null) {
      result[name] = defaultNum;
    } else if (typeof varVal === "number") {
      result[name] = varVal;
    } else if (Array.isArray(varVal)) {
      // Animated: evaluate at current beat
      result[name] = evaluateAnimatedVar(varVal, currentBeat, defaultNum);
    }
  }

  return result;
}

/** Evaluate an AnimationEvent[] at a given beat, returning the interpolated value */
function evaluateAnimatedVar(
  events: AnimationEvent[],
  beat: number,
  fallback: number,
): number {
  if (events.length === 0) return fallback;

  // Find the active event (whose startTime <= beat <= endTime)
  for (const ev of events) {
    const sb = beatToFloat(ev.startTime);
    const eb = beatToFloat(ev.endTime);
    const startVal = typeof ev.start === "number" ? ev.start : fallback;
    const endVal = typeof ev.end === "number" ? ev.end : fallback;

    if (beat >= sb && beat <= eb) {
      const duration = eb - sb;
      if (duration <= 0) return startVal;
      const t = (beat - sb) / duration;
      // Simple linear interpolation (easing would require RPE easing eval)
      return startVal + (endVal - startVal) * Math.max(0, Math.min(1, t));
    }
  }

  // If past all events, return the end value of the last event
  const lastEvent = events[events.length - 1];
  const lastEnd = beatToFloat(lastEvent.endTime);
  if (beat > lastEnd) {
    return typeof lastEvent.end === "number" ? lastEvent.end : fallback;
  }

  // Before all events, return the start value of the first event
  const firstStart = beatToFloat(events[0].startTime);
  if (beat < firstStart) {
    return typeof events[0].start === "number" ? events[0].start : fallback;
  }

  return fallback;
}

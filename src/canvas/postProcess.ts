// ============================================================
// WebGL Post-Processing Pipeline
//
// Takes a 2D canvas as input, applies shader effects, and
// renders the result to a WebGL canvas overlay.
//
// Pipeline:
//   1. Copy 2D canvas content to a WebGL texture
//   2. For each active shader effect:
//      a. Bind the texture
//      b. Set shader uniforms (including animated variables)
//      c. Draw a fullscreen quad
//      d. If more effects follow, ping-pong to another texture
//   3. Final result is on the WebGL canvas
// ============================================================

import { VERTEX_SHADER, PASSTHROUGH_SHADER, BUILTIN_SHADERS, SHADER_DEFAULTS } from "./shaders";
import type { ShaderEffect, AnimatedVariable, AnimationEvent } from "../types/extra";
import { beatToFloat } from "../types/chart";

// ============================================================
// Compiled Shader Program
// ============================================================

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  shaderName: string;
}

// ============================================================
// Post-Processing Manager
// ============================================================

export class PostProcessPipeline {
  private gl: WebGLRenderingContext | null = null;
  private glCanvas: HTMLCanvasElement | null = null;

  // WebGL resources
  private vertexBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private sourceTexture: WebGLTexture | null = null;

  // Ping-pong framebuffers for multi-pass effects
  private fbTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private framebuffers: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  // fbWidth / fbHeight tracked implicitly via fbTextures

  // Compiled shader programs (cached by shader source hash)
  private programs = new Map<string, CompiledProgram>();
  private passthroughProgram: CompiledProgram | null = null;

  // Current state
  private _initialized = false;
  private _active = false;

  get initialized(): boolean { return this._initialized; }
  get active(): boolean { return this._active; }

  /**
   * Initialize the WebGL pipeline with a canvas element.
   * The canvas should overlay the 2D game canvas.
   */
  initialize(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.warn("PostProcess: WebGL not available");
      return false;
    }

    this.gl = gl;
    this.glCanvas = canvas;

    // Create fullscreen quad geometry
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]), gl.STATIC_DRAW);

    // Create source texture (will hold the 2D canvas content)
    this.sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Compile passthrough program
    this.passthroughProgram = this.compileProgram("__passthrough__", PASSTHROUGH_SHADER);

    this._initialized = true;
    return true;
  }

  /**
   * Apply shader effects to the source 2D canvas and render to the GL canvas.
   *
   * @param source2D - The 2D canvas containing the rendered game scene
   * @param effects - Active shader effects to apply
   * @param currentBeat - Current playback beat (for variable evaluation)
   * @param currentTime - Current time in seconds (for time-based uniforms)
   */
  render(
    source2D: HTMLCanvasElement,
    effects: ShaderEffect[],
    currentBeat: number,
    currentTime: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.glCanvas) return;

    // Filter to only active effects at the current beat
    const activeEffects = effects.filter(e => {
      const start = beatToFloat(e.start);
      const end = beatToFloat(e.end);
      return currentBeat >= start && currentBeat <= end;
    });

    if (activeEffects.length === 0) {
      this._active = false;
      // Clear the GL canvas to be fully transparent
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    this._active = true;

    // Resize GL canvas to match source
    const w = source2D.width;
    const h = source2D.height;
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.glCanvas.width = w;
      this.glCanvas.height = h;
      this.setupFramebuffers(w, h);
    }

    gl.viewport(0, 0, w, h);

    // Upload 2D canvas content as texture (flip Y — Canvas2D is top-down, WebGL is bottom-up)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source2D);

    if (activeEffects.length === 1) {
      // Single effect: render directly to screen
      this.renderEffect(activeEffects[0], this.sourceTexture!, w, h, currentBeat, currentTime, null);
    } else {
      // Multi-pass: ping-pong between framebuffers
      let inputTexture = this.sourceTexture!;

      for (let i = 0; i < activeEffects.length; i++) {
        const isLast = i === activeEffects.length - 1;
        const outputFb = isLast ? null : this.framebuffers[i % 2];
        const outputTexture = isLast ? null : this.fbTextures[i % 2];

        this.renderEffect(activeEffects[i], inputTexture, w, h, currentBeat, currentTime, outputFb);

        if (outputTexture) {
          inputTexture = outputTexture;
        }
      }
    }
  }

  /**
   * Render a single shader effect pass.
   */
  private renderEffect(
    effect: ShaderEffect,
    inputTexture: WebGLTexture,
    width: number,
    height: number,
    currentBeat: number,
    currentTime: number,
    outputFramebuffer: WebGLFramebuffer | null,
  ): void {
    const gl = this.gl!;

    // Get or compile the shader program
    const shaderSource = effect.customShaderSource ?? BUILTIN_SHADERS[effect.shader];
    if (!shaderSource) return;

    const program = this.getOrCompileProgram(effect.shader, shaderSource);
    if (!program) return;

    gl.useProgram(program.program);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    const texLoc = gl.getUniformLocation(program.program, "screenTexture");
    if (texLoc) gl.uniform1i(texLoc, 0);

    // Set standard uniforms (prpr convention: screenSize, time)
    const screenSizeLoc = gl.getUniformLocation(program.program, "screenSize");
    if (screenSizeLoc) gl.uniform2f(screenSizeLoc, width, height);

    const timeLoc = gl.getUniformLocation(program.program, "time");
    if (timeLoc) gl.uniform1f(timeLoc, currentTime);

    // Set effect-specific uniforms from vars
    const defaults = SHADER_DEFAULTS[effect.shader] ?? {};
    if (effect.vars) {
      for (const [name, value] of Object.entries(effect.vars)) {
        const loc = gl.getUniformLocation(program.program, name);
        if (!loc) continue;

        if (typeof value === "number") {
          gl.uniform1f(loc, value);
        } else {
          // Check if this is a vector uniform by looking at the default
          const defVal = defaults[name];
          if (Array.isArray(defVal)) {
            // Vector uniform — evaluate each component
            const vec = evaluateAnimatedVariableVec(value, currentBeat, defVal.length);
            // RPE stores RGBA colors as 0-255 integers; GLSL expects 0.0-1.0
            // Normalize vec4 (color) values if any component exceeds 1.0
            if (vec.length === 4 && vec.some(v => v > 1.0)) {
              for (let i = 0; i < vec.length; i++) vec[i] /= 255.0;
            }
            if (vec.length === 2) gl.uniform2f(loc, vec[0], vec[1]);
            else if (vec.length === 3) gl.uniform3f(loc, vec[0], vec[1], vec[2]);
            else if (vec.length === 4) gl.uniform4f(loc, vec[0], vec[1], vec[2], vec[3]);
          } else {
            const numValue = evaluateAnimatedVariable(value, currentBeat);
            gl.uniform1f(loc, numValue);
          }
        }
      }
    }

    // Set default values for vars not explicitly set
    for (const [name, defaultVal] of Object.entries(defaults)) {
      if (effect.vars && name in effect.vars) continue;
      const loc = gl.getUniformLocation(program.program, name);
      if (!loc) continue;
      if (Array.isArray(defaultVal)) {
        if (defaultVal.length === 2) gl.uniform2f(loc, defaultVal[0], defaultVal[1]);
        else if (defaultVal.length === 3) gl.uniform3f(loc, defaultVal[0], defaultVal[1], defaultVal[2]);
        else if (defaultVal.length === 4) gl.uniform4f(loc, defaultVal[0], defaultVal[1], defaultVal[2], defaultVal[3]);
      } else {
        gl.uniform1f(loc, defaultVal);
      }
    }

    // Set up vertex attributes
    const posLoc = gl.getAttribLocation(program.program, "a_position");
    const texCoordLoc = gl.getAttribLocation(program.program, "a_texCoord");

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind output
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
    if (!outputFramebuffer) {
      gl.viewport(0, 0, width, height);
    }

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Get an existing compiled program or compile a new one.
   */
  private getOrCompileProgram(key: string, fragmentSource: string): CompiledProgram | null {
    let existing = this.programs.get(key);
    if (existing) return existing;

    const compiled = this.compileProgram(key, fragmentSource);
    if (compiled) {
      this.programs.set(key, compiled);
    }
    return compiled;
  }

  /**
   * Compile a vertex + fragment shader program.
   */
  private compileProgram(name: string, fragmentSource: string): CompiledProgram | null {
    const gl = this.gl!;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error(`PostProcess: vertex shader compile error:`, gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) { gl.deleteShader(vs); return null; }
    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(`PostProcess: fragment shader "${name}" compile error:`, gl.getShaderInfoLog(fs));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }

    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vs); gl.deleteShader(fs); return null; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`PostProcess: program "${name}" link error:`, gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }

    // Clean up individual shaders (they're linked into the program now)
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return {
      program,
      uniforms: {},
      shaderName: name,
    };
  }

  /**
   * Set up ping-pong framebuffers for multi-pass rendering.
   */
  private setupFramebuffers(width: number, height: number): void {
    const gl = this.gl!;

    // Clean up old framebuffers
    for (let i = 0; i < 2; i++) {
      if (this.fbTextures[i]) gl.deleteTexture(this.fbTextures[i]);
      if (this.framebuffers[i]) gl.deleteFramebuffer(this.framebuffers[i]);
    }

    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

      this.fbTextures[i] = tex;
      this.framebuffers[i] = fb;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Clean up all WebGL resources.
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    for (const [, prog] of this.programs) {
      gl.deleteProgram(prog.program);
    }
    this.programs.clear();

    if (this.passthroughProgram) {
      gl.deleteProgram(this.passthroughProgram.program);
      this.passthroughProgram = null;
    }

    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);

    for (let i = 0; i < 2; i++) {
      if (this.fbTextures[i]) gl.deleteTexture(this.fbTextures[i]);
      if (this.framebuffers[i]) gl.deleteFramebuffer(this.framebuffers[i]);
    }

    this._initialized = false;
    this._active = false;
    this.gl = null;
  }
}

// ============================================================
// Animated Variable Evaluation
// ============================================================

/**
 * Evaluate an animated variable at a given beat.
 *
 * AnimatedVariable is either:
 *   - number: constant value
 *   - AnimationEvent[]: RPE-style event list with startTime/endTime
 *
 * Returns a float value. For multi-component values (vec2, color),
 * only the first component is returned (use evaluateAnimatedVariableVec for those).
 */
export function evaluateAnimatedVariable(variable: AnimatedVariable, beat: number): number {
  if (typeof variable === "number") {
    return variable;
  }

  if (!Array.isArray(variable) || variable.length === 0) {
    return 0;
  }

  const events = variable as AnimationEvent[];

  // Find the best event: the latest one whose startTime <= beat
  let bestValue: number | null = null;

  for (const event of events) {
    const startBeat = beatToFloat(event.startTime);
    const endBeat = beatToFloat(event.endTime);

    if (beat < startBeat) continue;

    const startVal = typeof event.start === "number" ? event.start : event.start[0] ?? 0;
    const endVal = typeof event.end === "number" ? event.end : event.end[0] ?? 0;

    if (beat >= endBeat) {
      // After event — hold end value
      bestValue = endVal;
    } else {
      // During event — interpolate (linear for now, easing can be extended)
      const duration = endBeat - startBeat;
      if (duration <= 0) {
        bestValue = startVal;
      } else {
        const progress = (beat - startBeat) / duration;
        bestValue = startVal + (endVal - startVal) * progress;
      }
    }
  }

  return bestValue ?? 0;
}

/**
 * Evaluate an animated variable that produces a vector value (vec2/vec3/vec4).
 * Each animation event may have array start/end values — interpolates each component.
 */
function evaluateAnimatedVariableVec(variable: AnimatedVariable, beat: number, components: number): number[] {
  if (typeof variable === "number") {
    return Array(components).fill(variable);
  }

  if (!Array.isArray(variable) || variable.length === 0) {
    return Array(components).fill(0);
  }

  const events = variable as AnimationEvent[];
  let bestValue: number[] | null = null;

  for (const event of events) {
    const startBeat = beatToFloat(event.startTime);
    const endBeat = beatToFloat(event.endTime);
    if (beat < startBeat) continue;

    const startArr = Array.isArray(event.start) ? event.start : [event.start];
    const endArr = Array.isArray(event.end) ? event.end : [event.end];

    if (beat >= endBeat) {
      bestValue = [];
      for (let c = 0; c < components; c++) {
        bestValue.push(endArr[c] ?? startArr[c] ?? 0);
      }
    } else {
      const duration = endBeat - startBeat;
      const progress = duration <= 0 ? 0 : (beat - startBeat) / duration;
      bestValue = [];
      for (let c = 0; c < components; c++) {
        const s = startArr[c] ?? 0;
        const e = endArr[c] ?? s;
        bestValue.push(s + (e - s) * progress);
      }
    }
  }

  return bestValue ?? Array(components).fill(0);
}

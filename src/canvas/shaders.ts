// ============================================================
// Built-in Shader Programs (GLSL Fragment Shaders)
//
// These fragment shaders implement the prpr/Phira built-in
// post-processing effects. Parameters and defaults match the
// official Phira documentation exactly.
//
// prpr convention:
//   varying vec2 uv          — UV texture coordinate
//   uniform sampler2D screenTexture — the rendered scene
//   uniform vec2 screenSize  — canvas size in pixels
//   uniform float time        — current chart time in seconds
//
// Custom shaders in prpr use: uniform type name; // %default% min..max
// ============================================================

/** Vertex shader shared by all post-processing effects */
export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  uv = a_texCoord;
}
`;

/** Pass-through fragment shader (no effect) */
export const PASSTHROUGH_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;

void main() {
  gl_FragColor = texture2D(screenTexture, uv);
}
`;

/** Chromatic aberration — separates RGB channels
 *  Params: sampleCount (int, default 3, 1-64), power (float, default 0.01) */
export const CHROMATIC_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform vec2 screenSize;
uniform float sampleCount; // %3%
uniform float power;       // %0.01%

void main() {
  vec2 dir = uv - 0.5;
  int samples = int(max(1.0, sampleCount));
  vec4 color = vec4(0.0);
  vec4 base = texture2D(screenTexture, uv);
  for (int i = 0; i < 64; i++) {
    if (i >= samples) break;
    float t = float(i) / max(1.0, float(samples) - 1.0);
    vec2 offset = dir * power * (t - 0.5);
    color.r += texture2D(screenTexture, uv + offset).r;
    color.g += texture2D(screenTexture, uv).g;
    color.b += texture2D(screenTexture, uv - offset).b;
  }
  color.rgb /= float(samples);
  color.a = base.a;
  gl_FragColor = color;
}
`;

/** Circular blur — dot blur with highlight effect
 *  Params: size (float, default 10.0) in pixels */
export const CIRCLE_BLUR_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform vec2 screenSize;
uniform float size; // %10.0%

void main() {
  vec2 texelSize = 1.0 / screenSize;
  vec4 color = vec4(0.0);
  float total = 0.0;
  float rad = max(1.0, size);
  for (float x = -10.0; x <= 10.0; x += 1.0) {
    for (float y = -10.0; y <= 10.0; y += 1.0) {
      if (x * x + y * y > 100.0) continue;
      float s = rad / 10.0;
      vec2 offset = vec2(x * s, y * s) * texelSize;
      color += texture2D(screenTexture, uv + offset);
      total += 1.0;
    }
  }
  gl_FragColor = color / total;
}
`;

/** Fisheye lens distortion — negative=tunnel, positive=bulge
 *  Params: power (float, default -0.1) */
export const FISHEYE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float power; // %-0.1%

void main() {
  vec2 p = uv - 0.5;
  float r = length(p);
  float theta = atan(p.y, p.x);
  float distorted = pow(r, 1.0 + power) * 2.0;
  vec2 newUV = 0.5 + vec2(cos(theta), sin(theta)) * distorted;
  if (newUV.x < 0.0 || newUV.x > 1.0 || newUV.y < 0.0 || newUV.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    gl_FragColor = texture2D(screenTexture, newUV);
  }
}
`;

/** Digital glitch — indeterminate flicker effect
 *  Params: power (0.3), rate (0.6, 0-1), speed (5.0), blockCount (30.5), colorRate (0.01, 0-1) */
export const GLITCH_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float time;
uniform float power;      // %0.3%
uniform float rate;       // %0.6% 0..1
uniform float speed;      // %5.0%
uniform float blockCount; // %30.5%
uniform float colorRate;  // %0.01% 0..1

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float t = floor(time * speed);
  float blockY = floor(uv.y * blockCount);
  float shouldGlitch = step(1.0 - rate, rand(vec2(t, blockY * 0.1)));
  float offset = (rand(vec2(t, blockY)) - 0.5) * power * shouldGlitch;
  vec2 g = vec2(uv.x + offset, uv.y);
  float r = texture2D(screenTexture, g + vec2(colorRate, 0.0)).r;
  float gr = texture2D(screenTexture, g).g;
  float b = texture2D(screenTexture, g - vec2(colorRate, 0.0)).b;
  float a = texture2D(screenTexture, g).a;
  gl_FragColor = vec4(r, gr, b, a);
}
`;

/** Grayscale conversion
 *  Params: factor (float, default 1.0, 0=color, 1=grayscale) */
export const GRAYSCALE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float factor; // %1.0% 0..1

void main() {
  vec4 color = texture2D(screenTexture, uv);
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(mix(color.rgb, vec3(gray), factor), color.a);
}
`;

/** Noise — random grain overlay
 *  Params: seed (81.0), power (0.03, 0-1) */
export const NOISE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float time;
uniform float seed;  // %81.0%
uniform float power; // %0.03% 0..1

float rand(vec2 co) {
  return fract(sin(dot(co + seed, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture2D(screenTexture, uv);
  float noise = (rand(uv * 1000.0 + fract(time)) - 0.5) * power * 2.0;
  gl_FragColor = vec4(clamp(color.rgb + noise, 0.0, 1.0), color.a);
}
`;

/** Pixelation effect
 *  Params: size (float, default 10.0) pixel block size */
export const PIXEL_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform vec2 screenSize;
uniform float size; // %10.0%

void main() {
  float s = max(1.0, size);
  vec2 pixelCoord = floor(uv * screenSize / s) * s / screenSize;
  gl_FragColor = texture2D(screenTexture, pixelCoord);
}
`;

/** Radial/zoom blur
 *  Params: centerX (0.5, 0-1), centerY (0.5, 0-1), power (0.01, 0-1), sampleCount (3, 1-64) */
export const RADIAL_BLUR_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float centerX;    // %0.5% 0..1
uniform float centerY;    // %0.5% 0..1
uniform float power;      // %0.01% 0..1
uniform float sampleCount;// %3%

void main() {
  vec2 center = vec2(centerX, centerY);
  vec2 dir = uv - center;
  vec4 color = vec4(0.0);
  int samples = int(max(1.0, sampleCount));
  for (int i = 0; i < 64; i++) {
    if (i >= samples) break;
    float t = float(i) / max(1.0, float(samples) - 1.0);
    float scale = 1.0 - power * t;
    color += texture2D(screenTexture, center + dir * scale);
  }
  gl_FragColor = color / float(samples);
}
`;

/** Shockwave ripple — use with animated progress
 *  Params: progress (0.2, 0-1), centerX (0.5), centerY (0.5), width (0.1), distortion (0.8), expand (10.0) */
export const SHOCKWAVE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform float progress;   // %0.2% 0..1
uniform float centerX;    // %0.5% 0..1
uniform float centerY;    // %0.5% 0..1
uniform float width;      // %0.1%
uniform float distortion; // %0.8%
uniform float expand;     // %10.0%

void main() {
  vec2 center = vec2(centerX, centerY);
  vec2 diff = uv - center;
  float dist = length(diff);
  float radius = progress * expand / 10.0;
  float w = width * 0.5;
  float edge = smoothstep(radius - w, radius, dist) *
               (1.0 - smoothstep(radius, radius + w, dist));
  vec2 offset = normalize(diff + 0.0001) * edge * distortion * 0.1 * (1.0 - progress);
  gl_FragColor = texture2D(screenTexture, uv + offset);
}
`;

/** Vignette — darkens/tints screen edges
 *  Params: color (vec4 RGBA, default black), extend (0.25, 0-1), radius (15.0) */
export const VIGNETTE_SHADER = `
precision mediump float;
varying vec2 uv;
uniform sampler2D screenTexture;
uniform vec4 color;   // default (0.0, 0.0, 0.0, 1.0)
uniform float extend; // %0.25% 0..1
uniform float radius; // %15.0%

void main() {
  vec4 texColor = texture2D(screenTexture, uv);
  vec2 p = uv - 0.5;
  float dist = length(p);
  float vignette = 1.0 - smoothstep(1.0 / radius, 0.5 - extend, dist);
  texColor.rgb = mix(texColor.rgb, color.rgb, vignette * color.a);
  gl_FragColor = texColor;
}
`;

/** Map of built-in shader names to their GLSL source */
export const BUILTIN_SHADERS: Record<string, string> = {
  chromatic: CHROMATIC_SHADER,
  circleBlur: CIRCLE_BLUR_SHADER,
  fisheye: FISHEYE_SHADER,
  glitch: GLITCH_SHADER,
  grayscale: GRAYSCALE_SHADER,
  noise: NOISE_SHADER,
  pixel: PIXEL_SHADER,
  radialBlur: RADIAL_BLUR_SHADER,
  shockwave: SHOCKWAVE_SHADER,
  vignette: VIGNETTE_SHADER,
};

/** Default uniform values for each built-in shader (matching Phira docs) */
export const SHADER_DEFAULTS: Record<string, Record<string, number | number[]>> = {
  chromatic: { sampleCount: 3, power: 0.01 },
  circleBlur: { size: 10.0 },
  fisheye: { power: -0.1 },
  glitch: { power: 0.3, rate: 0.6, speed: 5.0, blockCount: 30.5, colorRate: 0.01 },
  grayscale: { factor: 1.0 },
  noise: { seed: 81.0, power: 0.03 },
  pixel: { size: 10.0 },
  radialBlur: { centerX: 0.5, centerY: 0.5, power: 0.01, sampleCount: 3 },
  shockwave: { progress: 0.2, centerX: 0.5, centerY: 0.5, width: 0.1, distortion: 0.8, expand: 10.0 },
  vignette: { color: [0, 0, 0, 1], extend: 0.25, radius: 15.0 },
};

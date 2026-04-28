// ============================================================
// Tauri IPC Wrappers
//
// These functions call the Rust backend via Tauri's invoke system.
// Each function corresponds to a #[tauri::command] in commands.rs.
//
// When running in the browser during development (npm run dev
// without Tauri), these will fail since there's no Rust backend.
// The isTauri() helper lets components check for this and show
// appropriate fallback behavior.
// ============================================================

import type { ProjectData, ProjectMeta } from "../types/chart";

/**
 * Check if we're running inside Tauri (vs a plain browser tab).
 * During development, you can run just the frontend with `npm run dev`
 * to work on layout/styling without the Rust backend — but project
 * load/save won't work in that mode.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Call a Tauri backend command.
 * This is the low-level wrapper — prefer the typed functions below.
 */
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `Cannot call Tauri command "${command}" — not running inside Tauri. ` +
      `Start with "npm run tauri:dev" instead of "npm run dev".`
    );
  }
  // @ts-expect-error — __TAURI__ is injected by Tauri at runtime
  return window.__TAURI__.core.invoke(command, args);
}

// ============================================================
// Project commands
// ============================================================

/**
 * Load a project from a directory path.
 *
 * The directory must contain chart.json, meta.json, and a music file.
 * The Rust backend reads the files, runs any needed migrations
 * (the chart format has evolved through 5 versions), and returns
 * the chart data plus metadata.
 *
 * @param path - Absolute path to the project directory
 * @returns The project data (chart JSON, metadata, file paths)
 */
export async function loadProject(path: string): Promise<ProjectData> {
  return invoke<ProjectData>("load_project", { path });
}

/**
 * Save the chart to disk.
 *
 * @param projectPath - Absolute path to the project directory
 * @param chartJson - The full chart as a JSON string
 */
export async function saveProject(projectPath: string, chartJson: string): Promise<void> {
  return invoke<void>("save_project", { projectPath, chartJson });
}

/**
 * Create a new empty project.
 *
 * Creates the project directory, copies the music/illustration files
 * into it, writes a default chart.json and meta.json.
 *
 * @param path - Where to create the project directory
 * @param meta - Song metadata (name, composer, charter, etc.)
 * @param musicSource - Path to the source music file to copy in
 * @param illustrationSource - Optional path to the illustration image
 */
export async function createProject(
  path: string,
  meta: ProjectMeta,
  musicSource: string,
  illustrationSource?: string,
): Promise<void> {
  return invoke<void>("create_project", {
    path,
    metaJson: JSON.stringify(meta),
    musicSource,
    illustrationSource: illustrationSource ?? null,
  });
}

/**
 * Export the chart in Official (Phigros) format.
 *
 * The Rust backend compiles the chart (merges child lines,
 * evaluates curve note tracks) and converts it to the Official
 * format used by the original game.
 *
 * @param chartJson - The current chart as a JSON string
 * @returns The Official format chart as a JSON string
 */
export async function exportAsOfficial(chartJson: string): Promise<string> {
  return invoke<string>("export_as_official", { chartJson });
}

/**
 * Get the application version string.
 */
export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

// ============================================================
// AI generation proxy
// ============================================================

export interface AiGenerateRequest {
  endpoint: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
  apiKey?: string;   // Optional API key for remote endpoints (sent as Bearer token)
}

export interface AiGenerateResponse {
  content: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Proxy an AI chat completion request through the Tauri backend (non-streaming).
 */
export async function generateAi(request: AiGenerateRequest): Promise<AiGenerateResponse> {
  return invoke<AiGenerateResponse>("ai_generate", { request });
}

/** Payload for each streaming chunk emitted by the Rust backend */
export interface AiStreamChunk {
  content: string;
  done: boolean;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

/**
 * Streaming AI generation — tokens arrive via Tauri events as they generate.
 *
 * Sets up a listener for "ai-stream-chunk" events BEFORE invoking the command
 * (so no early chunks are missed). Returns the final assembled response.
 *
 * @param request  - Same request payload as generateAi
 * @param onChunk  - Called for each streaming chunk (token, done signal, or error)
 * @returns The fully assembled response (same shape as generateAi)
 */
export async function generateAiStream(
  request: AiGenerateRequest,
  onChunk: (chunk: AiStreamChunk) => void,
): Promise<AiGenerateResponse> {
  if (!isTauri()) {
    throw new Error(
      `Cannot call Tauri streaming command — not running inside Tauri. ` +
      `Start with "npm run tauri:dev" instead of "npm run dev".`
    );
  }

  // Dynamic import to match the project's existing pattern
  const { listen } = await import("@tauri-apps/api/event");

  // Start listening BEFORE invoking — guarantees no chunks are missed
  const unlisten = await listen<AiStreamChunk>("ai-stream-chunk", (event) => {
    onChunk(event.payload);
  });

  try {
    const result = await invoke<AiGenerateResponse>("ai_generate_stream", { request });
    return result;
  } finally {
    // Always clean up the listener
    unlisten();
  }
}

// ============================================================
// File dialog helpers (using Tauri's dialog plugin)
// ============================================================

/**
 * Open a folder picker dialog.
 * Returns the selected path or null if cancelled.
 */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  // @ts-expect-error — Tauri plugin API
  const result = await window.__TAURI__.dialog.open({ directory: true });
  return result as string | null;
}

/**
 * Open a file picker dialog with optional filters.
 * Returns the selected path or null if cancelled.
 */
export async function pickFile(
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  if (!isTauri()) return null;
  // @ts-expect-error — Tauri plugin API
  const result = await window.__TAURI__.dialog.open({ filters });
  return result as string | null;
}

// ============================================================
// File-to-blob helpers
// ============================================================

const MIME_AUDIO: Record<string, string> = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4" };
const MIME_IMAGE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp" };

/**
 * Read a file from the filesystem via Tauri's fs plugin and return
 * a blob object URL. This replaces convertFileSrc which requires the
 * asset protocol (not configured in this app).
 */
export async function readFileAsObjectUrl(
  filePath: string,
  mimeMap: Record<string, string> = {},
): Promise<string> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const data = await readFile(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeMap[ext] ?? "application/octet-stream";
  const blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}

/** Shorthand: read an audio file and return a blob URL with correct MIME */
export function readAudioFileAsUrl(filePath: string): Promise<string> {
  return readFileAsObjectUrl(filePath, MIME_AUDIO);
}

/** Shorthand: read an image file and return a blob URL with correct MIME */
export function readImageFileAsUrl(filePath: string): Promise<string> {
  return readFileAsObjectUrl(filePath, MIME_IMAGE);
}

// ---- ML onset detection commands ----

/** Per-frame onset detection result from the Rust CNN pipeline. */
export interface OnsetResult {
  /** Time in seconds from the start of the audio file. */
  time: number;
  /** CNN onset probability 0.0–1.0 (higher = more confident). */
  probability: number;
}

/** Versioned envelope returned by `detect_onsets_ml` (Phase B of onset plan,
 *  2026-04-20). The `version` field lets the frontend detect shape skew on
 *  upgrades and bust its salience cache rather than reading garbage. Must
 *  match `ONSET_PIPELINE_VERSION` in src-tauri/src/onset_ml.rs. */
export interface OnsetBundle {
  version: number;
  frames: OnsetResult[];
}

/** The frontend's compiled-in expectation of the Rust pipeline version.
 *  Bump this alongside `ONSET_PIPELINE_VERSION` on the Rust side; mismatch
 *  surfaces a dev-mode warning + clears the cached results. */
export const EXPECTED_ONSET_PIPELINE_VERSION = 2;

/** Run ML onset detection on an audio file. musicPath must be absolute.
 *  Returns the whole song's per-frame salience plus a version stamp. */
export async function detectOnsetsMl(musicPath: string): Promise<OnsetBundle> {
  return invoke<OnsetBundle>("detect_onsets_ml", { musicPath });
}

/**
 * Write audio bytes to a temp file for onset detection of imported charts.
 * Tauri 2 IPC serializes Uint8Array as raw bytes (Vec<u8>) — pass directly,
 * do NOT wrap in Array.from().
 */
export async function writeTempAudio(audioBytes: Uint8Array, extension: string): Promise<string> {
  return invoke<string>("write_temp_audio", { audioBytes, extension });
}

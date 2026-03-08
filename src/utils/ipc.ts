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

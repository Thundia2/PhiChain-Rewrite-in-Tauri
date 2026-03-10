// ============================================================
// App Storage — Persistent JSON file storage
//
// Stores JSON files in %appdata%/PhiChain_Tauri/ using Tauri's
// filesystem plugin with BaseDirectory.AppData. Falls back to
// localStorage when running without Tauri (browser dev mode).
//
// Usage:
//   await writeJson("settings.json", { musicVolume: 0.8 });
//   const data = await readJson<Settings>("settings.json");
// ============================================================

import { isTauri } from "./ipc";

/** Directory name within %appdata% */
const APP_DIR = "PhiChain_Tauri";

/**
 * Read a JSON file from app storage.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export async function readJson<T>(filename: string): Promise<T | null> {
  if (!isTauri()) {
    return readJsonLocalStorage<T>(filename);
  }
  try {
    const { readTextFile, exists, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");

    const dirPath = APP_DIR;
    const filePath = `${APP_DIR}/${filename}`;

    // Ensure directory exists
    if (!(await exists(dirPath, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(dirPath, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    if (!(await exists(filePath, { baseDir: BaseDirectory.AppData }))) return null;

    const text = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[appStorage] Failed to read ${filename}:`, err);
    return null;
  }
}

/**
 * Write a JSON file to app storage.
 */
export async function writeJson(filename: string, data: unknown): Promise<void> {
  if (!isTauri()) {
    writeJsonLocalStorage(filename, data);
    return;
  }
  try {
    const { writeTextFile, exists, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");

    const dirPath = APP_DIR;
    const filePath = `${APP_DIR}/${filename}`;

    // Ensure directory exists
    if (!(await exists(dirPath, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(dirPath, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    const json = JSON.stringify(data, null, 2);
    await writeTextFile(filePath, json, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.warn(`[appStorage] Failed to write ${filename}:`, err);
  }
}

// ---- localStorage fallback for browser dev mode ----

function readJsonLocalStorage<T>(filename: string): T | null {
  try {
    const key = `phichain:${filename}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonLocalStorage(filename: string, data: unknown): void {
  try {
    const key = `phichain:${filename}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

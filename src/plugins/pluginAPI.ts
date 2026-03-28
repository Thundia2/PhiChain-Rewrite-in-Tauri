// ============================================================
// Plugin API — Foundation
//
// Defines the interface that plugins can use to extend PhiChain.
// This is the public contract for plugin authors.
//
// Currently a foundation — no plugins are loaded yet, but the
// API shape is defined for future extensibility.
// ============================================================

import type { PhichainChart, LineEvent } from "../types/chart";

/** An event preset that a plugin can register.
 *  Renamed to PluginEventPreset to avoid conflict with types/preset.ts EventPreset. */
export interface PluginEventPreset {
  id: string;
  name: string;
  category: string;
  events: Omit<LineEvent, "kind">[];
  description?: string;
}

/** A command that a plugin can register */
export interface PluginCommand {
  name: string;
  label: string;
  action: () => void;
}

/**
 * The API surface exposed to plugins.
 *
 * Plugins receive an instance of this interface and can use it to:
 * - Register commands (appear in the command palette)
 * - Register event presets (appear in the preset panel)
 * - Read (but not directly mutate) chart and editor state
 */
export interface PluginAPI {
  /** Register a command that appears in the command palette */
  registerCommand(name: string, label: string, action: () => void): void;

  /** Register an event preset */
  registerPreset(preset: PluginEventPreset): void;

  /** Get a readonly snapshot of the current chart */
  getChartState(): Readonly<PhichainChart>;

  /** Get basic editor state */
  getEditorState(): {
    selectedLineIndex: number | null;
    currentBeat: number;
  };

  /** Log a message visible in the dev console with plugin prefix */
  log(message: string): void;
}

/** Plugin definition that a plugin module must export */
export interface PluginDefinition {
  /** Unique plugin ID */
  id: string;
  /** Display name */
  name: string;
  /** Semantic version */
  version: string;
  /** Called when the plugin is loaded */
  activate(api: PluginAPI): void;
  /** Called when the plugin is unloaded (optional) */
  deactivate?(): void;
}

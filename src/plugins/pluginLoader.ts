// ============================================================
// Plugin Loader — Stub
//
// Foundation for the plugin system. Maintains a registry of
// loaded plugins, their commands, and presets. Currently no
// plugins are actually loaded — this provides the scaffolding.
//
// Usage:
//   import { pluginRegistry } from "./pluginLoader";
//   pluginRegistry.getCommands(); // => []
// ============================================================

import type { PluginAPI, PluginDefinition, PluginCommand, PluginEventPreset } from "./pluginAPI";
import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { useAudioStore } from "../stores/audioStore";
import { BpmList } from "../utils/bpmList";

class PluginRegistry {
  private plugins: Map<string, PluginDefinition> = new Map();
  private commands: PluginCommand[] = [];
  private presets: PluginEventPreset[] = [];

  /** Create a sandboxed API instance for a plugin */
  private createAPI(pluginId: string): PluginAPI {
    return {
      registerCommand: (name, label, action) => {
        this.commands.push({ name: `${pluginId}.${name}`, label, action });
      },

      registerPreset: (preset) => {
        this.presets.push({ ...preset, id: `${pluginId}.${preset.id}` });
      },

      getChartState: () => {
        return Object.freeze(structuredClone(useChartStore.getState().chart));
      },

      getEditorState: () => {
        const es = useEditorStore.getState();
        const as = useAudioStore.getState();
        const cs = useChartStore.getState();
        const bl = new BpmList(cs.chart.bpm_list);
        const currentBeat = bl.beatAtFloat(as.currentTime - cs.chart.offset);
        return {
          selectedLineIndex: es.selectedLineIndex,
          currentBeat,
        };
      },

      log: (message) => {
        console.log(`[Plugin:${pluginId}] ${message}`);
      },
    };
  }

  /** Load and activate a plugin */
  loadPlugin(definition: PluginDefinition): void {
    if (this.plugins.has(definition.id)) {
      console.warn(`Plugin "${definition.id}" is already loaded`);
      return;
    }

    const api = this.createAPI(definition.id);
    try {
      definition.activate(api);
      this.plugins.set(definition.id, definition);
      console.log(`Plugin "${definition.name}" v${definition.version} loaded`);
    } catch (err) {
      console.error(`Failed to load plugin "${definition.id}":`, err);
    }
  }

  /** Unload a plugin */
  unloadPlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.deactivate?.();
    this.plugins.delete(pluginId);
    this.commands = this.commands.filter((c) => !c.name.startsWith(`${pluginId}.`));
    this.presets = this.presets.filter((p) => !p.id.startsWith(`${pluginId}.`));
    console.log(`Plugin "${pluginId}" unloaded`);
  }

  /** Get all registered commands */
  getCommands(): readonly PluginCommand[] {
    return this.commands;
  }

  /** Get all registered presets */
  getPresets(): readonly PluginEventPreset[] {
    return this.presets;
  }

  /** Get loaded plugin IDs */
  getLoadedPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}

/** Global plugin registry singleton */
export const pluginRegistry = new PluginRegistry();

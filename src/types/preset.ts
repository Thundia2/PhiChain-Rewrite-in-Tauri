// ============================================================
// Event Preset Types
// ============================================================

import type { LineEventKind, EasingType, Beat } from "./chart";

/** Template entry used by the Preset Builder — each entry is a single
 *  channel segment with explicit start/end values and easing. */
export interface EventTemplate {
  kind: LineEventKind;
  startBeatOffset: Beat;
  endBeatOffset: Beat;
  startValue: number | "$CURRENT";
  endValue: number | "$CURRENT";
  easing: EasingType;
}

/** Inline template entry used by builtin presets and applyPresetAtPlayhead.
 *  Uses beatOffset (number) + EventPresetValue for the value. */
export interface BuiltinTemplateEntry {
  kind: LineEventKind;
  beatOffset: number;
  endBeatOffset: number;
  value: EventPresetValue;
}

export interface EventPreset {
  id: string;
  name: string;
  category?: "movement" | "visibility" | "rotation" | "speed" | "compound";
  description: string;
  channels: LineEventKind[];
  defaultDuration?: number;
  template: Array<BuiltinTemplateEntry | EventTemplate>;
  /** Whether this preset is built-in (not user-created) */
  builtin?: boolean;
  /** Tags for categorization / search */
  tags?: string[];
}

export type EventPresetValue =
  | { constant: number | string }
  | { transition: { start: number | string; end: number | string; easing: EasingType } };

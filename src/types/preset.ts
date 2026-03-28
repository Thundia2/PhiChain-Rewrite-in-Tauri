// ============================================================
// Event Preset Types
// ============================================================

import type { LineEventKind, EasingType } from "./chart";

export interface EventPreset {
  id: string;
  name: string;
  category: "movement" | "visibility" | "rotation" | "speed" | "compound";
  description: string;
  channels: LineEventKind[];
  defaultDuration: number;
  template: Array<{
    kind: LineEventKind;
    beatOffset: number;
    endBeatOffset: number;
    value: EventPresetValue;
  }>;
}

export type EventPresetValue =
  | { constant: number | string }
  | { transition: { start: number | string; end: number | string; easing: EasingType } };

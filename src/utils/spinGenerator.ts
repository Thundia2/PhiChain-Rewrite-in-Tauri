import type { LineEvent, EasingType } from "../types/chart";
import { floatToBeat } from "../types/chart";

export interface SpinConfig {
  startBeat: number;
  endBeat: number;
  rotations: number;
  clockwise: boolean;
  startAngle: number;
  easing: EasingType;
}

export function generateSpinEvent(config: SpinConfig): LineEvent {
  const delta = config.rotations * 360 * (config.clockwise ? 1 : -1);
  return {
    kind: "rotation",
    start_beat: floatToBeat(config.startBeat),
    end_beat: floatToBeat(config.endBeat),
    value: {
      transition: {
        start: config.startAngle,
        end: config.startAngle + delta,
        easing: config.easing,
      },
    },
  };
}

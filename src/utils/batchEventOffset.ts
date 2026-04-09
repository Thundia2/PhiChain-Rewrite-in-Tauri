// ============================================================
// Batch Event Offset Utility
//
// Creates staggered copies of a leader line's event across
// multiple follower lines with configurable beat offsets.
// Used by the Context Panel's Multi-line > Batch Offset tab.
// ============================================================

import type { LineEvent, LineEventKind, Beat, PhichainChart } from "../types/chart";
import { beatToFloat, floatToBeat } from "../types/chart";

interface FollowerConfig {
  lineIndex: number;
  beatOffset: number; // Beats to offset the event (can be negative)
}

interface BatchMutation {
  lineIndex: number;
  newEvents: LineEvent[];
}

/**
 * Offset a Beat tuple by a float number of beats.
 */
function offsetBeat(beat: Beat, offset: number): Beat {
  return floatToBeat(Math.max(0, beatToFloat(beat) + offset));
}

/**
 * Find the most recent event of a given kind on a line.
 * "Most recent" = latest end_beat.
 */
function findLatestEvent(
  events: LineEvent[],
  kind: LineEventKind,
): LineEvent | null {
  let latest: LineEvent | null = null;
  let latestEnd = -Infinity;

  for (const ev of events) {
    if (ev.kind !== kind) continue;
    const end = beatToFloat(ev.end_beat);
    if (end > latestEnd) {
      latestEnd = end;
      latest = ev;
    }
  }

  return latest;
}

/**
 * Clone an event with offset applied to its beat timing.
 */
function cloneEventWithOffset(event: LineEvent, beatOffset: number): LineEvent {
  return {
    ...event,
    start_beat: offsetBeat(event.start_beat, beatOffset),
    end_beat: offsetBeat(event.end_beat, beatOffset),
    // Deep-clone value to avoid shared references
    value: JSON.parse(JSON.stringify(event.value)),
  };
}

/**
 * Create staggered copies of a leader line's latest event across followers.
 *
 * @param leaderLineIndex - Index of the leader line in chart.lines
 * @param followers - Array of follower configs with lineIndex and beatOffset
 * @param channelKind - Which event channel to copy (x, y, rotation, etc.)
 * @param chart - The current chart state
 * @returns Array of mutations for batchMultiLineMutations, or null if no source event found
 */
export function createStaggeredEvents(
  leaderLineIndex: number,
  followers: FollowerConfig[],
  channelKind: LineEventKind,
  chart: PhichainChart,
): BatchMutation[] | null {
  const leaderLine = chart.lines[leaderLineIndex];
  if (!leaderLine) return null;

  const sourceEvent = findLatestEvent(leaderLine.events, channelKind);
  if (!sourceEvent) return null;

  const mutations: BatchMutation[] = [];

  for (const follower of followers) {
    const cloned = cloneEventWithOffset(sourceEvent, follower.beatOffset);
    mutations.push({
      lineIndex: follower.lineIndex,
      newEvents: [cloned],
    });
  }

  return mutations;
}

/**
 * Generate evenly-spaced beat offsets for N followers.
 *
 * @param count - Number of followers
 * @param spacing - Beat spacing between each follower (e.g., 0.5)
 * @returns Array of beat offsets [0.5, 1.0, 1.5, ...]
 */
export function generateEvenOffsets(count: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * spacing);
}

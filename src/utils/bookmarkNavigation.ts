// Bookmark navigation utilities — shared between GlobalMode buttons and hotkeys
// Provides seek-to-prev/next bookmark and add-marker-at-beat functionality

import { BpmList } from "./bpmList";
import { beatToFloat, floatToBeat } from "./beat";
import { useChartStore } from "../stores/chartStore";
import { useAudioStore } from "../stores/audioStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useEditorStore } from "../stores/editorStore";
import type { Bookmark } from "../types/bookmark";

/** Get the current playhead beat as a float, accounting for chart offset */
function getCurrentBeatFloat(): number {
  const chart = useChartStore.getState().chart;
  const currentTime = useAudioStore.getState().currentTime;
  const offset = chart.offset ?? 0;
  const bpm = new BpmList(chart.bpm_list);
  return bpm.beatAtFloat(currentTime - offset);
}

/**
 * Add a section marker bookmark at the current playhead beat.
 * Places it at x=0 on the currently selected line (or line 0).
 */
export function addMarkerAtCurrentBeat(): void {
  const currentBeat = getCurrentBeatFloat();
  const beat = floatToBeat(currentBeat, 32);
  const selectedLine = useEditorStore.getState().selectedLineIndex ?? 0;
  useBookmarkStore.getState().addBookmark(beat, 0, true, selectedLine);
}

/**
 * Seek to the nearest bookmark BEFORE the current playhead position.
 * No-op if no bookmarks exist before the current beat.
 */
export function seekToPrevBookmark(): void {
  const currentBeat = getCurrentBeatFloat();
  const bookmarks = useBookmarkStore.getState().bookmarks;
  if (!bookmarks || bookmarks.length === 0) return;

  // Find all bookmarks before the current beat (with small epsilon tolerance)
  const epsilon = 0.01;
  const before = bookmarks.filter((b: Bookmark) => beatToFloat(b.beat) < currentBeat - epsilon);
  if (before.length === 0) return;

  // Find the closest one (maximum beat that's still before current)
  const target = before.reduce(
    (best: Bookmark, b: Bookmark) => (beatToFloat(b.beat) > beatToFloat(best.beat) ? b : best),
    before[0],
  );

  // Convert beat back to time and seek
  const chart = useChartStore.getState().chart;
  const offset = chart.offset ?? 0;
  const bpm = new BpmList(chart.bpm_list);
  const targetTime = bpm.timeAtFloat(beatToFloat(target.beat)) + offset;
  useAudioStore.getState().seek(targetTime);
}

/**
 * Seek to the nearest bookmark AFTER the current playhead position.
 * No-op if no bookmarks exist after the current beat.
 */
export function seekToNextBookmark(): void {
  const currentBeat = getCurrentBeatFloat();
  const bookmarks = useBookmarkStore.getState().bookmarks;
  if (!bookmarks || bookmarks.length === 0) return;

  // Find all bookmarks after the current beat (with small epsilon tolerance)
  const epsilon = 0.01;
  const after = bookmarks.filter((b: Bookmark) => beatToFloat(b.beat) > currentBeat + epsilon);
  if (after.length === 0) return;

  // Find the closest one (minimum beat that's still after current)
  const target = after.reduce(
    (best: Bookmark, b: Bookmark) => (beatToFloat(b.beat) < beatToFloat(best.beat) ? b : best),
    after[0],
  );

  // Convert beat back to time and seek
  const chart = useChartStore.getState().chart;
  const offset = chart.offset ?? 0;
  const bpm = new BpmList(chart.bpm_list);
  const targetTime = bpm.timeAtFloat(beatToFloat(target.beat)) + offset;
  useAudioStore.getState().seek(targetTime);
}

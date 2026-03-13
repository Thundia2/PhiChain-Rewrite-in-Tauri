// ============================================================
// Group Store — Zustand
//
// Manages editing groups: typed collections of lines or notes
// that can be edited as a unit with batch operations. Groups
// are not part of the PhichainChart format — they persist via
// a custom groups.json in .pez exports.
// ============================================================

import { create } from "zustand";
import type { Beat, LineEvent, LineEventKind, NoteKind, EasingType } from "../types/chart";
import { beatToFloat, floatToBeat, addBeats } from "../types/chart";
import type {
  EditorGroup,
  LineGroup,
  NoteGroup,
  GroupLineRef,
  GroupNoteRef,
  GroupEditSettings,
} from "../types/group";
import {
  DEFAULT_VISIBLE_EVENT_KINDS,
  DEFAULT_GROUP_EDIT_SETTINGS,
  GROUP_COLORS,
  computeMemberDelay,
  migrateGroup,
} from "../types/group";
import { useChartStore } from "./chartStore";
import { buildNoteUidMap } from "../utils/noteUid";

// ============================================================
// State shape
// ============================================================

export interface GroupState {
  /** All editing groups */
  groups: EditorGroup[];

  /** Currently active group for editing (null = normal mode) */
  activeGroupId: string | null;

  /** Group edit mode rendering settings */
  groupEditMode: GroupEditSettings;

  /** Note UID resolution cache — rebuilt on chart change */
  _noteUidMap: Map<string, { lineIndex: number; noteIndex: number }>;

  // ---- CRUD ----
  createLineGroup: (name: string, startBeat: Beat, endBeat: Beat) => string;
  createNoteGroup: (name: string, startBeat: Beat, endBeat: Beat) => string;
  deleteGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: string) => void;
  setGroupTimeframe: (groupId: string, startBeat: Beat, endBeat: Beat) => void;
  toggleGroupLocked: (groupId: string) => void;

  // ---- Membership ----
  addLineToGroup: (groupId: string, lineIndex: number) => boolean;
  removeLineFromGroup: (groupId: string, lineIndex: number) => void;
  addNoteToGroup: (groupId: string, noteUid: string, lineIndex: number) => boolean;
  removeNoteFromGroup: (groupId: string, noteUid: string) => void;

  // ---- Delay ----
  setGroupDelay: (groupId: string, delay: number) => void;
  toggleAdvancedDelay: (groupId: string) => void;
  setMemberDelayOverride: (
    groupId: string,
    memberType: "line" | "note",
    memberKey: number | string,
    override: number | undefined,
  ) => void;

  // ---- Mode ----
  enterGroupEditMode: (groupId: string) => void;
  exitGroupEditMode: () => void;
  setGroupEditSettings: (settings: Partial<GroupEditSettings>) => void;

  // ---- Batch operations: Line groups ----
  applyOffsetToGroup: (
    deltaX: number,
    deltaY: number,
    deltaRotation: number,
    currentBeat: Beat,
  ) => void;
  batchAddEventToGroup: (
    groupId: string,
    kind: LineEventKind,
    startBeat: number,
    endBeat: number,
    value: { constant: number } | { transition: { start: number; end: number; easing: EasingType } },
  ) => void;
  batchCopyEventsInGroup: (
    groupId: string,
    sourceLineIndex: number,
    kind: LineEventKind,
  ) => void;
  batchDeleteEventsByKindInGroup: (
    groupId: string,
    kind: LineEventKind,
  ) => void;

  // ---- Batch operations: Note groups ----
  batchShiftNotesInGroup: (groupId: string, deltaBeat: number) => void;
  batchChangeNoteKindInGroup: (groupId: string, kind: NoteKind) => void;
  batchFlipNotesInGroup: (groupId: string) => void;
  batchChangeNoteSpeedInGroup: (groupId: string, speed: number) => void;

  // ---- Queries ----
  getActiveGroup: () => EditorGroup | null;
  isInActiveGroup: (lineIndex: number, noteUid?: string) => boolean;
  getGroupsForLine: (lineIndex: number) => EditorGroup[];
  getGroupsForNote: (noteUid: string) => EditorGroup[];

  // ---- Persistence ----
  getGroupsJson: () => string;
  loadGroupsJson: (json: string) => void;
  clearGroups: () => void;

  // ---- Resolution ----
  rebuildNoteUidMap: () => void;
  resolveNoteRef: (noteUid: string) => { lineIndex: number; noteIndex: number } | null;

  // ---- Reactive cleanup ----
  cleanupDanglingRefs: () => void;
  resyncLineIndices: () => void;
}

// ============================================================
// Helpers
// ============================================================

/** Check if two beat ranges overlap */
function rangesOverlap(
  aStart: Beat, aEnd: Beat,
  bStart: Beat, bEnd: Beat,
): boolean {
  return beatToFloat(aStart) < beatToFloat(bEnd) &&
         beatToFloat(aEnd) > beatToFloat(bStart);
}

/** Validate that a line can be added to a group without timeframe overlap */
function canAddLineToGroup(
  lineIndex: number,
  targetGroup: EditorGroup,
  allGroups: EditorGroup[],
): boolean {
  for (const group of allGroups) {
    if (group.id === targetGroup.id) continue;
    if (group.type !== "line") continue;
    const hasLine = group.lines.some((l) => l.lineIndex === lineIndex);
    if (!hasLine) continue;
    if (rangesOverlap(targetGroup.startBeat, targetGroup.endBeat, group.startBeat, group.endBeat)) {
      return false;
    }
  }
  return true;
}

/** Validate that a note can be added to a group without timeframe overlap */
function canAddNoteToGroup(
  noteUid: string,
  targetGroup: EditorGroup,
  allGroups: EditorGroup[],
): boolean {
  for (const group of allGroups) {
    if (group.id === targetGroup.id) continue;
    if (group.type !== "note") continue;
    const hasNote = group.notes.some((n) => n.noteUid === noteUid);
    if (!hasNote) continue;
    if (rangesOverlap(targetGroup.startBeat, targetGroup.endBeat, group.startBeat, group.endBeat)) {
      return false;
    }
  }
  return true;
}

/** Pick a color for a new group based on existing group count */
function pickGroupColor(existingCount: number): string {
  return GROUP_COLORS[existingCount % GROUP_COLORS.length];
}

// ============================================================
// Store
// ============================================================

export const useGroupStore = create<GroupState>()((set, get) => ({
  groups: [],
  activeGroupId: null,
  groupEditMode: { ...DEFAULT_GROUP_EDIT_SETTINGS },
  _noteUidMap: new Map(),

  // ---- CRUD ----

  createLineGroup: (name, startBeat, endBeat) => {
    const id = crypto.randomUUID();
    const color = pickGroupColor(get().groups.length);
    const group: LineGroup = {
      id,
      type: "line",
      name,
      color,
      startBeat,
      endBeat,
      lines: [],
      locked: false,
      delay: 0,
      advancedDelay: false,
      visibleEventKinds: [...DEFAULT_VISIBLE_EVENT_KINDS],
    };
    set((state) => ({ groups: [...state.groups, group] }));
    return id;
  },

  createNoteGroup: (name, startBeat, endBeat) => {
    const id = crypto.randomUUID();
    const color = pickGroupColor(get().groups.length);
    const group: NoteGroup = {
      id,
      type: "note",
      name,
      color,
      startBeat,
      endBeat,
      notes: [],
      locked: false,
      delay: 0,
      advancedDelay: false,
    };
    set((state) => ({ groups: [...state.groups, group] }));
    return id;
  },

  deleteGroup: (groupId) => {
    set((state) => {
      const newGroups = state.groups.filter((g) => g.id !== groupId);
      const newActiveId = state.activeGroupId === groupId ? null : state.activeGroupId;
      return { groups: newGroups, activeGroupId: newActiveId };
    });
  },

  renameGroup: (groupId, name) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      ),
    }));
  },

  setGroupColor: (groupId, color) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, color } : g,
      ),
    }));
  },

  setGroupTimeframe: (groupId, startBeat, endBeat) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, startBeat, endBeat } : g,
      ),
    }));
  },

  toggleGroupLocked: (groupId) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, locked: !g.locked } : g,
      ),
    }));
  },

  // ---- Membership ----

  addLineToGroup: (groupId, lineIndex) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group || group.type !== "line") return false;
    if (group.lines.some((l) => l.lineIndex === lineIndex)) return true; // Already in group

    if (!canAddLineToGroup(lineIndex, group, state.groups)) return false;

    const chart = useChartStore.getState().chart;
    const line = chart.lines[lineIndex];
    if (!line) return false;

    const ref: GroupLineRef = {
      lineIndex,
      lineName: line.name,
    };

    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId && g.type === "line"
          ? { ...g, lines: [...g.lines, ref] }
          : g,
      ),
    }));
    return true;
  },

  removeLineFromGroup: (groupId, lineIndex) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId && g.type === "line"
          ? { ...g, lines: g.lines.filter((l) => l.lineIndex !== lineIndex) }
          : g,
      ),
    }));
  },

  addNoteToGroup: (groupId, noteUid, lineIndex) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group || group.type !== "note") return false;
    if (group.notes.some((n) => n.noteUid === noteUid)) return true;

    if (!canAddNoteToGroup(noteUid, group, state.groups)) return false;

    const ref: GroupNoteRef = {
      noteUid,
      lineIndex,
    };

    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId && g.type === "note"
          ? { ...g, notes: [...g.notes, ref] }
          : g,
      ),
    }));
    return true;
  },

  removeNoteFromGroup: (groupId, noteUid) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId && g.type === "note"
          ? { ...g, notes: g.notes.filter((n) => n.noteUid !== noteUid) }
          : g,
      ),
    }));
  },

  // ---- Delay ----

  setGroupDelay: (groupId, delay) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, delay } : g,
      ),
    }));
  },

  toggleAdvancedDelay: (groupId) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, advancedDelay: !g.advancedDelay } : g,
      ),
    }));
  },

  setMemberDelayOverride: (groupId, memberType, memberKey, override) => {
    set((state) => ({
      groups: state.groups.map((g) => {
        if (g.id !== groupId) return g;
        if (memberType === "line" && g.type === "line") {
          return {
            ...g,
            lines: g.lines.map((l) =>
              l.lineIndex === memberKey
                ? { ...l, delayOverride: override }
                : l,
            ),
          };
        } else if (memberType === "note" && g.type === "note") {
          return {
            ...g,
            notes: g.notes.map((n) =>
              n.noteUid === memberKey
                ? { ...n, delayOverride: override }
                : n,
            ),
          };
        }
        return g;
      }),
    }));
  },

  // ---- Mode ----

  enterGroupEditMode: (groupId) => {
    set({ activeGroupId: groupId });
  },

  exitGroupEditMode: () => {
    set({ activeGroupId: null });
  },

  setGroupEditSettings: (settings) => {
    set((state) => ({
      groupEditMode: { ...state.groupEditMode, ...settings },
    }));
  },

  // ---- Batch operations: Line groups ----

  applyOffsetToGroup: (deltaX, deltaY, deltaRotation, currentBeat) => {
    const group = get().getActiveGroup();
    if (!group || group.locked || group.type !== "line") return;

    const cs = useChartStore.getState();
    const mutations: Array<{
      lineIndex: number;
      newEvents?: LineEvent[];
    }> = [];

    for (let i = 0; i < group.lines.length; i++) {
      const lineRef = group.lines[i];
      const delayBeats = computeMemberDelay(group, i, lineRef.delayOverride);
      const beat = addBeats(currentBeat, floatToBeat(delayBeats));
      const newEvents: LineEvent[] = [];

      if (deltaX !== 0) {
        newEvents.push({
          kind: "x",
          start_beat: beat,
          end_beat: beat,
          value: { constant: deltaX },
        });
      }
      if (deltaY !== 0) {
        newEvents.push({
          kind: "y",
          start_beat: beat,
          end_beat: beat,
          value: { constant: deltaY },
        });
      }
      if (deltaRotation !== 0) {
        newEvents.push({
          kind: "rotation",
          start_beat: beat,
          end_beat: beat,
          value: { constant: deltaRotation },
        });
      }

      if (newEvents.length > 0) {
        mutations.push({ lineIndex: lineRef.lineIndex, newEvents });
      }
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchAddEventToGroup: (groupId, kind, startBeat, endBeat, value) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "line") return;

    const cs = useChartStore.getState();
    const mutations: Array<{ lineIndex: number; newEvents: LineEvent[] }> = [];

    for (let i = 0; i < group.lines.length; i++) {
      const lineRef = group.lines[i];
      const delayBeats = computeMemberDelay(group, i, lineRef.delayOverride);
      const event: LineEvent = {
        kind,
        start_beat: floatToBeat(startBeat + delayBeats),
        end_beat: floatToBeat(endBeat + delayBeats),
        value,
      };
      mutations.push({ lineIndex: lineRef.lineIndex, newEvents: [event] });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchCopyEventsInGroup: (groupId, sourceLineIndex, kind) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "line") return;

    const cs = useChartStore.getState();
    const sourceLine = cs.chart.lines[sourceLineIndex];
    if (!sourceLine) return;

    const sourceEvents = sourceLine.events.filter((e) => e.kind === kind);
    if (sourceEvents.length === 0) return;

    // Find the source member's index for delay computation
    const sourceIdx = group.lines.findIndex((l) => l.lineIndex === sourceLineIndex);
    const sourceDelay = sourceIdx >= 0
      ? computeMemberDelay(group, sourceIdx, group.lines[sourceIdx].delayOverride)
      : 0;

    const mutations: Array<{ lineIndex: number; newEvents: LineEvent[] }> = [];

    for (let i = 0; i < group.lines.length; i++) {
      const lineRef = group.lines[i];
      if (lineRef.lineIndex === sourceLineIndex) continue;

      const targetDelay = computeMemberDelay(group, i, lineRef.delayOverride);
      const delayDiff = targetDelay - sourceDelay;

      const newEvents = sourceEvents.map((e) => ({
        ...e,
        start_beat: floatToBeat(beatToFloat(e.start_beat) + delayDiff),
        end_beat: floatToBeat(beatToFloat(e.end_beat) + delayDiff),
      }));

      mutations.push({ lineIndex: lineRef.lineIndex, newEvents });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchDeleteEventsByKindInGroup: (groupId, kind) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "line") return;

    const cs = useChartStore.getState();
    const mutations: Array<{ lineIndex: number; removeEventIndices: number[] }> = [];

    for (const lineRef of group.lines) {
      const line = cs.chart.lines[lineRef.lineIndex];
      if (!line) continue;

      const indices: number[] = [];
      for (let i = 0; i < line.events.length; i++) {
        if (line.events[i].kind === kind) indices.push(i);
      }
      if (indices.length > 0) {
        mutations.push({ lineIndex: lineRef.lineIndex, removeEventIndices: indices });
      }
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  // ---- Batch operations: Note groups ----

  batchShiftNotesInGroup: (groupId, deltaBeat) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "note") return;

    const cs = useChartStore.getState();
    const store = get();
    const mutations: Array<{
      lineIndex: number;
      noteEdits: Array<{ noteIndex: number; changes: Partial<import("../types/chart").Note> }>;
    }> = [];

    for (let i = 0; i < group.notes.length; i++) {
      const noteRef = group.notes[i];
      const resolved = store.resolveNoteRef(noteRef.noteUid);
      if (!resolved) continue;

      const note = cs.chart.lines[resolved.lineIndex]?.notes[resolved.noteIndex];
      if (!note) continue;

      const delayBeats = computeMemberDelay(group, i, noteRef.delayOverride);
      const totalDelta = floatToBeat(deltaBeat + delayBeats);
      const newBeat = addBeats(note.beat, totalDelta);

      let existing = mutations.find((m) => m.lineIndex === resolved.lineIndex);
      if (!existing) {
        existing = { lineIndex: resolved.lineIndex, noteEdits: [] };
        mutations.push(existing);
      }
      existing.noteEdits.push({
        noteIndex: resolved.noteIndex,
        changes: { beat: newBeat },
      });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchChangeNoteKindInGroup: (groupId, kind) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "note") return;

    const cs = useChartStore.getState();
    const store = get();
    const mutations: Array<{
      lineIndex: number;
      noteEdits: Array<{ noteIndex: number; changes: Partial<import("../types/chart").Note> }>;
    }> = [];

    for (const noteRef of group.notes) {
      const resolved = store.resolveNoteRef(noteRef.noteUid);
      if (!resolved) continue;

      let existing = mutations.find((m) => m.lineIndex === resolved.lineIndex);
      if (!existing) {
        existing = { lineIndex: resolved.lineIndex, noteEdits: [] };
        mutations.push(existing);
      }
      existing.noteEdits.push({
        noteIndex: resolved.noteIndex,
        changes: { kind },
      });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchFlipNotesInGroup: (groupId) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "note") return;

    const cs = useChartStore.getState();
    const store = get();
    const mutations: Array<{
      lineIndex: number;
      noteEdits: Array<{ noteIndex: number; changes: Partial<import("../types/chart").Note> }>;
    }> = [];

    for (const noteRef of group.notes) {
      const resolved = store.resolveNoteRef(noteRef.noteUid);
      if (!resolved) continue;

      const note = cs.chart.lines[resolved.lineIndex]?.notes[resolved.noteIndex];
      if (!note) continue;

      let existing = mutations.find((m) => m.lineIndex === resolved.lineIndex);
      if (!existing) {
        existing = { lineIndex: resolved.lineIndex, noteEdits: [] };
        mutations.push(existing);
      }
      existing.noteEdits.push({
        noteIndex: resolved.noteIndex,
        changes: { above: !note.above },
      });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  batchChangeNoteSpeedInGroup: (groupId, speed) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group || group.locked || group.type !== "note") return;

    const cs = useChartStore.getState();
    const store = get();
    const mutations: Array<{
      lineIndex: number;
      noteEdits: Array<{ noteIndex: number; changes: Partial<import("../types/chart").Note> }>;
    }> = [];

    for (const noteRef of group.notes) {
      const resolved = store.resolveNoteRef(noteRef.noteUid);
      if (!resolved) continue;

      let existing = mutations.find((m) => m.lineIndex === resolved.lineIndex);
      if (!existing) {
        existing = { lineIndex: resolved.lineIndex, noteEdits: [] };
        mutations.push(existing);
      }
      existing.noteEdits.push({
        noteIndex: resolved.noteIndex,
        changes: { speed },
      });
    }

    if (mutations.length > 0) {
      cs.batchMultiLineMutations(mutations);
    }
  },

  // ---- Queries ----

  getActiveGroup: () => {
    const { groups, activeGroupId } = get();
    if (!activeGroupId) return null;
    return groups.find((g) => g.id === activeGroupId) ?? null;
  },

  isInActiveGroup: (lineIndex, noteUid) => {
    const group = get().getActiveGroup();
    if (!group) return false;

    if (noteUid && group.type === "note") {
      return group.notes.some((n) => n.noteUid === noteUid);
    }
    if (group.type === "line") {
      return group.lines.some((l) => l.lineIndex === lineIndex);
    }
    return false;
  },

  getGroupsForLine: (lineIndex) => {
    return get().groups.filter((g) =>
      g.type === "line" && g.lines.some((l) => l.lineIndex === lineIndex),
    );
  },

  getGroupsForNote: (noteUid) => {
    return get().groups.filter((g) =>
      g.type === "note" && g.notes.some((n) => n.noteUid === noteUid),
    );
  },

  // ---- Persistence ----

  getGroupsJson: () => JSON.stringify(get().groups, null, 2),

  loadGroupsJson: (json) => {
    try {
      const raw = JSON.parse(json) as any[];
      const groups = raw.map(migrateGroup);
      set({ groups });
    } catch (e) {
      console.error("Failed to load groups:", e);
    }
  },

  clearGroups: () => {
    set({ groups: [], activeGroupId: null });
  },

  // ---- Resolution ----

  rebuildNoteUidMap: () => {
    const chart = useChartStore.getState().chart;
    set({ _noteUidMap: buildNoteUidMap(chart) });
  },

  resolveNoteRef: (noteUid) => {
    return get()._noteUidMap.get(noteUid) ?? null;
  },

  // ---- Reactive cleanup ----

  cleanupDanglingRefs: () => {
    const chart = useChartStore.getState().chart;
    const uidMap = buildNoteUidMap(chart);

    set((state) => {
      let changed = false;
      const newGroups = state.groups.map((group) => {
        if (group.type === "line") {
          const validLines = group.lines.filter(
            (ref) => ref.lineIndex >= 0 && ref.lineIndex < chart.lines.length,
          );
          if (validLines.length !== group.lines.length) {
            changed = true;
            return { ...group, lines: validLines };
          }
        } else if (group.type === "note") {
          const validNotes = group.notes.filter(
            (ref) => uidMap.has(ref.noteUid),
          );
          if (validNotes.length !== group.notes.length) {
            changed = true;
            return { ...group, notes: validNotes };
          }
        }
        return group;
      });

      return changed ? { groups: newGroups, _noteUidMap: uidMap } : { _noteUidMap: uidMap };
    });
  },

  resyncLineIndices: () => {
    const chart = useChartStore.getState().chart;

    set((state) => ({
      groups: state.groups.map((group) => {
        if (group.type !== "line") return group;
        return {
          ...group,
          lines: group.lines
            .map((ref) => {
              // Check if current index still matches
              if (
                ref.lineIndex >= 0 &&
                ref.lineIndex < chart.lines.length &&
                chart.lines[ref.lineIndex].name === ref.lineName
              ) {
                return ref;
              }
              // Try to find by name
              const newIndex = chart.lines.findIndex(
                (l) => l.name === ref.lineName,
              );
              if (newIndex >= 0) {
                return { ...ref, lineIndex: newIndex };
              }
              return null; // Line no longer exists
            })
            .filter((r): r is GroupLineRef => r !== null),
        };
      }),
    }));
  },
}));

// ============================================================
// Subscribe to chartStore changes for reactive cleanup
// ============================================================

let lastLineCount = 0;
let lastIsLoaded = false;
useChartStore.subscribe((state) => {
  // Clear groups when project is closed
  if (lastIsLoaded && !state.isLoaded) {
    queueMicrotask(() => useGroupStore.getState().clearGroups());
  }
  lastIsLoaded = state.isLoaded;

  const lineCount = state.chart.lines.length;
  if (lineCount !== lastLineCount) {
    lastLineCount = lineCount;
    // Defer cleanup to avoid triggering during Immer produce
    queueMicrotask(() => {
      useGroupStore.getState().cleanupDanglingRefs();
      useGroupStore.getState().resyncLineIndices();
    });
  }
});

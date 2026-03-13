// ============================================================
// Group Editing Types
//
// Groups are typed collections: a Line Group contains lines and
// supports batch event operations; a Note Group contains notes
// and supports batch note operations. They are purely an editing
// construct — they don't change rendering behavior. Groups persist
// via a custom groups.json file in .pez exports.
// ============================================================

import type { Beat, LineEventKind } from "./chart";
import { beatToFloat } from "./chart";

// ---- Member references ----

/** A reference to a line within a Line Group */
export interface GroupLineRef {
  /** Line index in chart.lines[] (primary identifier) */
  lineIndex: number;
  /** Line name for resilient lookup after reorder */
  lineName: string;
  /** Per-member delay override in beats (used when advancedDelay is true) */
  delayOverride?: number;
}

/** A reference to a note within a Note Group */
export interface GroupNoteRef {
  /** The UID of the note (stable across insert/delete) */
  noteUid: string;
  /** Line index where this note lives (cached for quick lookup) */
  lineIndex: number;
  /** Per-member delay override in beats (used when advancedDelay is true) */
  delayOverride?: number;
}

// ---- Group types (discriminated union) ----

/** Fields shared by all group types */
interface EditorGroupBase {
  /** Unique group ID (crypto.randomUUID()) */
  id: string;
  /** User-facing name */
  name: string;
  /** Color for UI indicators (hex string, e.g. "#ff6b6b") */
  color: string;
  /** Active timeframe start — for multi-group overlap validation */
  startBeat: Beat;
  /** Active timeframe end */
  endBeat: Beat;
  /** Whether this group is locked (prevent accidental edits) */
  locked: boolean;
  /** Group-level delay in beats. Member at position N gets offset N * delay */
  delay: number;
  /** When true, use per-member delayOverride instead of positional delay */
  advancedDelay: boolean;
}

/** A Line Group: contains lines, supports batch event operations */
export interface LineGroup extends EditorGroupBase {
  type: "line";
  lines: GroupLineRef[];
  /** Which event types to show in group edit mode */
  visibleEventKinds: LineEventKind[];
}

/** A Note Group: contains notes, supports batch note operations */
export interface NoteGroup extends EditorGroupBase {
  type: "note";
  notes: GroupNoteRef[];
}

/** An editing group — either a Line Group or a Note Group */
export type EditorGroup = LineGroup | NoteGroup;

// ---- Group edit mode rendering settings ----

/** Group edit mode rendering settings */
export interface GroupEditSettings {
  /** Dim non-group elements (reduced opacity) */
  dimOthers: boolean;
  /** Completely hide non-group elements */
  hideOthers: boolean;
  /** Show only movement events (x, y, rotation), hide notes/text/decorations */
  simplifiedCanvas: boolean;
}

// ---- Defaults & constants ----

/** Default visible event kinds for new line groups */
export const DEFAULT_VISIBLE_EVENT_KINDS: LineEventKind[] = ["x", "y", "rotation"];

/** Default group edit mode settings */
export const DEFAULT_GROUP_EDIT_SETTINGS: GroupEditSettings = {
  dimOthers: true,
  hideOthers: false,
  simplifiedCanvas: true,
};

/** Preset colors for new groups */
export const GROUP_COLORS = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c",
  "#38d9a9", "#4dabf7", "#748ffc", "#da77f2",
];

// ---- Helpers ----

/**
 * Compute the effective delay (in beats) for a member at `memberIndex`.
 * If advancedDelay is on and the member has an override, use that;
 * otherwise use positional delay: memberIndex * group.delay.
 */
export function computeMemberDelay(
  group: EditorGroup,
  memberIndex: number,
  memberOverride?: number,
): number {
  if (group.advancedDelay && memberOverride !== undefined) return memberOverride;
  return memberIndex * group.delay;
}

// ---- Migration ----

/**
 * Migrate a legacy (v1) group to the new typed format.
 * v1 groups have no `type` field and may contain both lines and notes.
 */
export function migrateGroup(raw: any): EditorGroup {
  // Already new format
  if (raw.type === "line" || raw.type === "note") return raw as EditorGroup;

  const hasLines = Array.isArray(raw.lines) && raw.lines.length > 0;
  const hasNotes = Array.isArray(raw.notes) && raw.notes.length > 0;

  // Check if any member had a non-zero stagger
  let hasNonZeroStagger = false;

  if (hasNotes && !hasLines) {
    // Migrate to NoteGroup
    const notes: GroupNoteRef[] = (raw.notes ?? []).map((n: any) => {
      const stag = n.staggerOffset ? beatToFloat(n.staggerOffset) : 0;
      if (stag !== 0) hasNonZeroStagger = true;
      return {
        noteUid: n.noteUid,
        lineIndex: n.lineIndex,
        ...(stag !== 0 ? { delayOverride: stag } : {}),
      };
    });

    return {
      id: raw.id,
      type: "note" as const,
      name: raw.name,
      color: raw.color,
      startBeat: raw.startBeat,
      endBeat: raw.endBeat,
      locked: raw.locked ?? false,
      delay: 0,
      advancedDelay: hasNonZeroStagger,
      notes,
    };
  }

  // Default: migrate to LineGroup (drop notes if mixed)
  const lines: GroupLineRef[] = (raw.lines ?? []).map((l: any) => {
    const stag = l.staggerOffset ? beatToFloat(l.staggerOffset) : 0;
    if (stag !== 0) hasNonZeroStagger = true;
    return {
      lineIndex: l.lineIndex,
      lineName: l.lineName,
      ...(stag !== 0 ? { delayOverride: stag } : {}),
    };
  });

  return {
    id: raw.id,
    type: "line" as const,
    name: raw.name,
    color: raw.color,
    startBeat: raw.startBeat,
    endBeat: raw.endBeat,
    locked: raw.locked ?? false,
    delay: 0,
    advancedDelay: hasNonZeroStagger,
    lines,
    visibleEventKinds: raw.visibleEventKinds ?? [...DEFAULT_VISIBLE_EVENT_KINDS],
  };
}

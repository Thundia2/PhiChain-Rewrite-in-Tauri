// ============================================================
// useContextPanelMode — Derived hook
//
// Computes the active context panel mode from editorStore
// selection state. Auto-switches as the user selects different
// things in the editor.
//
// Recent change: Added AI tab to every mode. The tab is
// conditionally included based on the aiEnabled setting.
// ============================================================

import { useEditorStore } from "../stores/editorStore";
import { useSettingsStore } from "../stores/settingsStore";

export type ContextPanelMode = "global" | "line" | "note" | "event" | "multi";

export function useContextPanelMode(): ContextPanelMode {
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);
  const selectedEventIndices = useEditorStore((s) => s.selectedEventIndices);
  const multiSelectedLineIndices = useEditorStore((s) => s.multiSelectedLineIndices);

  if (multiSelectedLineIndices.length > 1) return "multi";
  if (selectedEventIndices.length > 0) return "event";
  if (selectedNoteIndices.length > 0) return "note";
  if (selectedLineIndex !== null) return "line";
  return "global";
}

/** Labels and icons for each mode */
export const MODE_CONFIG: Record<ContextPanelMode, { label: string; icon: string }> = {
  global: { label: "CHART", icon: "◎" },
  line: { label: "LINE", icon: "━" },
  note: { label: "NOTES", icon: "◆" },
  event: { label: "EVENT", icon: "◉" },
  multi: { label: "LINES", icon: "☰" },
};

/** AI tab definition — shared across all modes */
const AI_TAB = { id: "ai", label: "\u2726 AI" };

/** Base tab definitions per mode (without AI tab) */
const BASE_MODE_TABS: Record<ContextPanelMode, { id: string; label: string }[]> = {
  global: [
    { id: "actions", label: "Actions" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "\u22EF" },
  ],
  line: [
    { id: "events", label: "Events" },
    { id: "props", label: "Properties" },
    { id: "controls", label: "Controls" },
    { id: "presets", label: "Presets" },
    { id: "note-gen", label: "Note Gen" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "\u22EF" },
  ],
  note: [
    { id: "edit", label: "Edit" },
    { id: "batch", label: "Batch" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "\u22EF" },
  ],
  event: [
    { id: "edit", label: "Edit" },
    { id: "easing", label: "Easing" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "\u22EF" },
  ],
  multi: [
    { id: "batch", label: "Batch Ops" },
    { id: "offset", label: "Batch Offset" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "\u22EF" },
  ],
};

/**
 * Get tab definitions for a mode, conditionally including the AI tab.
 * The AI tab is inserted before the last two tabs (hotkeys, misc) in each mode.
 */
export function getModeTabs(mode: ContextPanelMode): { id: string; label: string }[] {
  const aiEnabled = useSettingsStore.getState().aiEnabled;
  const baseTabs = BASE_MODE_TABS[mode];
  if (!aiEnabled) return baseTabs;
  // Insert AI tab before "hotkeys" and "misc" (last 2 items)
  const insertIdx = Math.max(0, baseTabs.length - 2);
  return [
    ...baseTabs.slice(0, insertIdx),
    AI_TAB,
    ...baseTabs.slice(insertIdx),
  ];
}

/**
 * MODE_TABS is still exported for backward compat, but components
 * should prefer getModeTabs() which respects the aiEnabled setting.
 * This always includes the AI tab for type checking purposes.
 */
export const MODE_TABS: Record<ContextPanelMode, { id: string; label: string }[]> = {
  global: [...BASE_MODE_TABS.global.slice(0, -2), AI_TAB, ...BASE_MODE_TABS.global.slice(-2)],
  line: [...BASE_MODE_TABS.line.slice(0, -2), AI_TAB, ...BASE_MODE_TABS.line.slice(-2)],
  note: [...BASE_MODE_TABS.note.slice(0, -2), AI_TAB, ...BASE_MODE_TABS.note.slice(-2)],
  event: [...BASE_MODE_TABS.event.slice(0, -2), AI_TAB, ...BASE_MODE_TABS.event.slice(-2)],
  multi: [...BASE_MODE_TABS.multi.slice(0, -2), AI_TAB, ...BASE_MODE_TABS.multi.slice(-2)],
};

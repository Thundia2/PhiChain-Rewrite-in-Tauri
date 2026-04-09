// ============================================================
// useContextPanelMode — Derived hook
//
// Computes the active context panel mode from editorStore
// selection state. Auto-switches as the user selects different
// things in the editor.
// ============================================================

import { useEditorStore } from "../stores/editorStore";

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

/** Tab definitions per mode */
export const MODE_TABS: Record<ContextPanelMode, { id: string; label: string }[]> = {
  global: [
    { id: "actions", label: "Actions" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "⋯" },
  ],
  line: [
    { id: "events", label: "Events" },
    { id: "props", label: "Properties" },
    { id: "controls", label: "Controls" },
    { id: "presets", label: "Presets" },
    { id: "note-gen", label: "Note Gen" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "⋯" },
  ],
  note: [
    { id: "edit", label: "Edit" },
    { id: "batch", label: "Batch" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "⋯" },
  ],
  event: [
    { id: "edit", label: "Edit" },
    { id: "easing", label: "Easing" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "⋯" },
  ],
  multi: [
    { id: "batch", label: "Batch Ops" },
    { id: "offset", label: "Batch Offset" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "misc", label: "⋯" },
  ],
};

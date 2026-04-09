// ============================================================
// NoteBatchOps — Batch operations for note groups
//
// Shift, Change Kind, Flip, Change Speed across all notes in
// a group. Extracted from GroupManager.tsx.
// ============================================================

import type { NoteKind } from "../../types/chart";
import type { NoteGroup } from "../../types/group";
import { safeParseNumber } from "../common/FormFields";
import {
  NOTE_KINDS, CARD_STYLE, INPUT_STYLE, SELECT_STYLE,
  BTN_ACCENT_STYLE, BTN_MUTED_STYLE,
} from "./groupManagerStyles";

export interface NoteBatchOpsProps {
  groupId: string;
  group: NoteGroup;
  shiftDelta: number;
  setShiftDelta: (v: number) => void;
  noteKind: NoteKind;
  setNoteKind: (v: NoteKind) => void;
  noteSpeed: number;
  setNoteSpeed: (v: number) => void;
  onShiftNotes: () => void;
  onChangeKind: () => void;
  onFlipNotes: () => void;
  onChangeSpeed: () => void;
}

export function NoteBatchOps({
  group,
  shiftDelta, setShiftDelta,
  noteKind, setNoteKind,
  noteSpeed, setNoteSpeed,
  onShiftNotes, onChangeKind, onFlipNotes, onChangeSpeed,
}: NoteBatchOpsProps) {
  const noteCount = group.notes.length;
  const disabled = noteCount === 0;

  return (
    <>
      {/* Shift Beats */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Shift Beats
        </div>
        <div style={{ padding: "6px 10px" }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Delta (beats)</label>
          <input type="number" step="0.25" value={shiftDelta} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setShiftDelta(n); }} style={{ ...INPUT_STYLE, width: "100%", marginBottom: 6 }} />
          <button onClick={onShiftNotes} disabled={disabled} style={{ ...BTN_ACCENT_STYLE, width: "100%", background: "#38d9a9", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
            Shift {noteCount} notes
          </button>
        </div>
      </div>

      {/* Change Kind */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Change Kind
        </div>
        <div style={{ padding: "6px 10px" }}>
          <select value={noteKind} onChange={(e) => setNoteKind(e.target.value as NoteKind)} style={{ ...SELECT_STYLE, width: "100%", marginBottom: 6 }}>
            {NOTE_KINDS.map((nk) => <option key={nk.value} value={nk.value}>{nk.label}</option>)}
          </select>
          <button onClick={onChangeKind} disabled={disabled} style={{ ...BTN_ACCENT_STYLE, width: "100%", background: "#38d9a9", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
            Set kind on {noteCount} notes
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Quick Actions
        </div>
        <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={onFlipNotes} disabled={disabled} style={{ ...BTN_MUTED_STYLE, width: "100%", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
            Flip Above/Below ({noteCount} notes)
          </button>
          <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Speed</label>
              <input type="number" step="0.1" value={noteSpeed} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setNoteSpeed(n); }} style={{ ...INPUT_STYLE, width: "100%" }} />
            </div>
            <button onClick={onChangeSpeed} disabled={disabled} style={{ ...BTN_MUTED_STYLE, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
              Set Speed
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

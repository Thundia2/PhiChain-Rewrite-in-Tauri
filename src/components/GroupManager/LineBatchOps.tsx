// ============================================================
// LineBatchOps — Batch operations for line groups
//
// Add Event, Copy Events, Delete Events across all lines in
// a group. Extracted from GroupManager.tsx.
// ============================================================

import type { LineEventKind, PhichainChart, Line } from "../../types/chart";
import type { LineGroup } from "../../types/group";
import { safeParseNumber } from "../common/FormFields";
import {
  EVENT_KINDS, CARD_STYLE, INPUT_STYLE, SELECT_STYLE,
  BTN_ACCENT_STYLE, BTN_DANGER_STYLE,
} from "./groupManagerStyles";

export interface LineBatchOpsProps {
  groupId: string;
  group: LineGroup;
  chart: PhichainChart;
  batchKind: LineEventKind;
  setBatchKind: (v: LineEventKind) => void;
  batchType: "constant" | "transition";
  setBatchType: (v: "constant" | "transition") => void;
  batchValue: number;
  setBatchValue: (v: number) => void;
  batchEndValue: number;
  setBatchEndValue: (v: number) => void;
  batchStartBeat: number;
  setBatchStartBeat: (v: number) => void;
  batchEndBeat: number;
  setBatchEndBeat: (v: number) => void;
  copySourceLine: number;
  setCopySourceLine: (v: number) => void;
  deleteKind: LineEventKind;
  setDeleteKind: (v: LineEventKind) => void;
  onAddEvent: () => void;
  onCopyEvents: () => void;
  onDeleteEvents: () => void;
}

export function LineBatchOps({
  group, chart,
  batchKind, setBatchKind,
  batchType, setBatchType,
  batchValue, setBatchValue,
  batchEndValue, setBatchEndValue,
  batchStartBeat, setBatchStartBeat,
  batchEndBeat, setBatchEndBeat,
  copySourceLine, setCopySourceLine,
  deleteKind, setDeleteKind,
  onAddEvent, onCopyEvents, onDeleteEvents,
}: LineBatchOpsProps) {
  const lineCount = group.lines.length;

  return (
    <>
      {/* Add Event */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Add Event
        </div>
        <div style={{ padding: "6px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Kind</label>
            <select value={batchKind} onChange={(e) => setBatchKind(e.target.value as LineEventKind)} style={{ ...SELECT_STYLE, width: "100%" }}>
              {EVENT_KINDS.map((ek) => <option key={ek.value} value={ek.value}>{ek.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Type</label>
            <select value={batchType} onChange={(e) => setBatchType(e.target.value as "constant" | "transition")} style={{ ...SELECT_STYLE, width: "100%" }}>
              <option value="constant">Constant</option>
              <option value="transition">Transition</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Start Beat</label>
            <input type="number" step="0.25" value={batchStartBeat} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setBatchStartBeat(n); }} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>End Beat</label>
            <input type="number" step="0.25" value={batchEndBeat} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setBatchEndBeat(n); }} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>{batchType === "constant" ? "Value" : "Start Value"}</label>
            <input type="number" step="0.1" value={batchValue} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setBatchValue(n); }} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          {batchType === "transition" && (
            <div>
              <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>End Value</label>
              <input type="number" step="0.1" value={batchEndValue} onChange={(e) => { const n = safeParseNumber(e.target.value); if (n !== null) setBatchEndValue(n); }} style={{ ...INPUT_STYLE, width: "100%" }} />
            </div>
          )}
        </div>
        <div style={{ padding: "6px 10px" }}>
          <button onClick={onAddEvent} disabled={lineCount === 0} style={{ ...BTN_ACCENT_STYLE, width: "100%", opacity: lineCount === 0 ? 0.4 : 1, cursor: lineCount === 0 ? "not-allowed" : "pointer" }}>
            Add to {lineCount} lines
          </button>
        </div>
      </div>

      {/* Copy Events */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Copy Events
        </div>
        <div style={{ padding: "6px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Source Line</label>
            <select value={copySourceLine} onChange={(e) => setCopySourceLine(parseInt(e.target.value))} style={{ ...SELECT_STYLE, width: "100%" }}>
              {chart.lines.map((_: Line, i: number) => <option key={i} value={i}>Line {i + 1}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Event Kind</label>
            <select value={batchKind} onChange={(e) => setBatchKind(e.target.value as LineEventKind)} style={{ ...SELECT_STYLE, width: "100%" }}>
              {EVENT_KINDS.map((ek) => <option key={ek.value} value={ek.value}>{ek.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "6px 10px" }}>
          <button onClick={onCopyEvents} disabled={lineCount === 0} style={{ ...BTN_ACCENT_STYLE, width: "100%", opacity: lineCount === 0 ? 0.4 : 1, cursor: lineCount === 0 ? "not-allowed" : "pointer" }}>
            Copy to {lineCount} lines
          </button>
        </div>
      </div>

      {/* Delete Events */}
      <div style={CARD_STYLE}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid rgba(42, 42, 53, 0.55)" }}>
          Delete Events
        </div>
        <div style={{ padding: "6px 10px" }}>
          <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Event Kind</label>
          <select value={deleteKind} onChange={(e) => setDeleteKind(e.target.value as LineEventKind)} style={{ ...SELECT_STYLE, width: "100%", marginBottom: 6 }}>
            {EVENT_KINDS.map((ek) => <option key={ek.value} value={ek.value}>{ek.label}</option>)}
          </select>
          <button onClick={onDeleteEvents} disabled={lineCount === 0} style={{ ...BTN_DANGER_STYLE, width: "100%", opacity: lineCount === 0 ? 0.4 : 1, cursor: lineCount === 0 ? "not-allowed" : "pointer" }}>
            Delete {deleteKind} from {lineCount} lines
          </button>
        </div>
      </div>
    </>
  );
}

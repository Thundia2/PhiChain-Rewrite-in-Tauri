// ============================================================
// Group Manager Panel — Unified group + batch editor
//
// Shows all editing groups (Line or Note), allows creating,
// managing members, and running batch operations. Replaces
// the old separate BatchEditor panel.
// ============================================================

import { useState } from "react";
import { useGroupStore } from "../../stores/groupStore";
import { useChartStore } from "../../stores/chartStore";
import { useToastStore } from "../../stores/toastStore";
import { useEditorStore } from "../../stores/editorStore";
import { floatToBeat, beatToFloat } from "../../types/chart";
import type { LineEventKind, NoteKind } from "../../types/chart";
import type { EditorGroup, LineGroup, NoteGroup } from "../../types/group";

// ---- Constants ----

const EVENT_KINDS: { value: LineEventKind; label: string }[] = [
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "rotation", label: "Rotation" },
  { value: "opacity", label: "Opacity" },
  { value: "speed", label: "Speed" },
  { value: "scale_x", label: "Scale X" },
  { value: "scale_y", label: "Scale Y" },
];

const NOTE_KINDS: { value: NoteKind; label: string }[] = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

// ---- Shared styles ----

const SECTION_STYLE: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "var(--text-muted)",
  marginBottom: 6,
  marginTop: 12,
};

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: "var(--bg-active)",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 8,
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 10px",
  borderBottom: "1px solid rgba(42, 42, 53, 0.55)",
  fontSize: 11,
};

const INPUT_STYLE: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  fontSize: 11,
  border: "0.5px solid var(--border-color)",
  backgroundColor: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: "pointer",
};

const BTN_ACCENT_STYLE: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 10,
  fontWeight: 500,
  background: "var(--accent-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const BTN_MUTED_STYLE: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 10,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  cursor: "pointer",
};

const BTN_DANGER_STYLE: React.CSSProperties = {
  ...BTN_MUTED_STYLE,
  color: "#ff4060",
  borderColor: "rgba(255, 64, 96, 0.3)",
};

// ============================================================
// Main Component
// ============================================================

export function GroupManager() {
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const createLineGroup = useGroupStore((s) => s.createLineGroup);
  const createNoteGroup = useGroupStore((s) => s.createNoteGroup);
  const deleteGroup = useGroupStore((s) => s.deleteGroup);
  const renameGroup = useGroupStore((s) => s.renameGroup);
  const toggleGroupLocked = useGroupStore((s) => s.toggleGroupLocked);
  const addLineToGroup = useGroupStore((s) => s.addLineToGroup);
  const removeLineFromGroup = useGroupStore((s) => s.removeLineFromGroup);
  const addNoteToGroup = useGroupStore((s) => s.addNoteToGroup);
  const removeNoteFromGroup = useGroupStore((s) => s.removeNoteFromGroup);
  const setGroupDelay = useGroupStore((s) => s.setGroupDelay);
  const toggleAdvancedDelay = useGroupStore((s) => s.toggleAdvancedDelay);
  const setMemberDelayOverride = useGroupStore((s) => s.setMemberDelayOverride);
  const enterGroupEditMode = useGroupStore((s) => s.enterGroupEditMode);
  const exitGroupEditMode = useGroupStore((s) => s.exitGroupEditMode);

  // Batch operations
  const batchAddEvent = useGroupStore((s) => s.batchAddEventToGroup);
  const batchCopyEvents = useGroupStore((s) => s.batchCopyEventsInGroup);
  const batchDeleteEvents = useGroupStore((s) => s.batchDeleteEventsByKindInGroup);
  const batchShiftNotes = useGroupStore((s) => s.batchShiftNotesInGroup);
  const batchChangeNoteKind = useGroupStore((s) => s.batchChangeNoteKindInGroup);
  const batchFlipNotes = useGroupStore((s) => s.batchFlipNotesInGroup);
  const batchChangeNoteSpeed = useGroupStore((s) => s.batchChangeNoteSpeedInGroup);

  const chart = useChartStore((s) => s.chart);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const multiSelectedLineIndices = useEditorStore((s) => s.multiSelectedLineIndices);
  const selectedNoteIndices = useEditorStore((s) => s.selectedNoteIndices);

  const [showCreate, setShowCreate] = useState<"line" | "note" | null>(null);
  const [newName, setNewName] = useState("");
  const [newStartBeat, setNewStartBeat] = useState(0);
  const [newEndBeat, setNewEndBeat] = useState(100);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Batch event state (line groups)
  const [batchKind, setBatchKind] = useState<LineEventKind>("x");
  const [batchType, setBatchType] = useState<"constant" | "transition">("constant");
  const [batchValue, setBatchValue] = useState(0);
  const [batchEndValue, setBatchEndValue] = useState(0);
  const [batchStartBeat, setBatchStartBeat] = useState(0);
  const [batchEndBeat, setBatchEndBeat] = useState(4);
  const [copySourceLine, setCopySourceLine] = useState(0);
  const [deleteKind, setDeleteKind] = useState<LineEventKind>("x");

  // Batch note state (note groups)
  const [shiftDelta, setShiftDelta] = useState(0);
  const [noteKind, setNoteKind] = useState<NoteKind>("tap");
  const [noteSpeed, setNoteSpeed] = useState(1);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const handleCreate = () => {
    if (!newName.trim() || !showCreate) return;
    const fn = showCreate === "line" ? createLineGroup : createNoteGroup;
    const id = fn(newName.trim(), floatToBeat(newStartBeat), floatToBeat(newEndBeat));
    setShowCreate(null);
    setNewName("");
    setSelectedGroupId(id);
  };

  const handleAddSelected = () => {
    if (!selectedGroupId || !selectedGroup || selectedGroup.type !== "line") return;
    const linesToAdd = multiSelectedLineIndices.length > 0
      ? multiSelectedLineIndices
      : selectedLineIndex !== null ? [selectedLineIndex] : [];

    let failCount = 0;
    for (const li of linesToAdd) {
      if (!addLineToGroup(selectedGroupId, li)) failCount++;
    }
    if (failCount > 0) {
      useToastStore.getState().addToast({ message: `${failCount} line(s) could not be added (timeframe overlap).`, type: "info" });
    }
  };

  const handleAddSelectedNotes = () => {
    if (!selectedGroupId || !selectedGroup || selectedGroup.type !== "note") return;
    if (selectedLineIndex === null || selectedNoteIndices.length === 0) return;
    const line = chart.lines[selectedLineIndex];
    if (!line) return;

    let failCount = 0;
    for (const ni of selectedNoteIndices) {
      const note = line.notes[ni];
      if (!note?.uid) continue;
      if (!addNoteToGroup(selectedGroupId, note.uid, selectedLineIndex)) failCount++;
    }
    if (failCount > 0) {
      useToastStore.getState().addToast({ message: `${failCount} note(s) could not be added (timeframe overlap).`, type: "info" });
    }
  };

  const handleBatchAddEvent = () => {
    if (!selectedGroupId) return;
    const value = batchType === "constant"
      ? { constant: batchValue }
      : { transition: { start: batchValue, end: batchEndValue, easing: "linear" as const } };
    batchAddEvent(selectedGroupId, batchKind, batchStartBeat, batchEndBeat, value);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ padding: 10, fontSize: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>Groups</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setShowCreate(showCreate === "line" ? null : "line")}
            style={BTN_ACCENT_STYLE}
          >
            + Line Group
          </button>
          <button
            onClick={() => setShowCreate(showCreate === "note" ? null : "note")}
            style={{ ...BTN_ACCENT_STYLE, background: "#38d9a9" }}
          >
            + Note Group
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ ...CARD_STYLE, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>
            New {showCreate === "line" ? "Line" : "Note"} Group
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name..."
            style={{ ...INPUT_STYLE, width: "100%", marginBottom: 6 }}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <div>
              <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Start Beat</label>
              <input type="number" step="1" value={newStartBeat} onChange={(e) => setNewStartBeat(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>End Beat</label>
              <input type="number" step="1" value={newEndBeat} onChange={(e) => setNewEndBeat(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={handleCreate} style={BTN_ACCENT_STYLE}>Create</button>
            <button onClick={() => setShowCreate(null)} style={BTN_MUTED_STYLE}>Cancel</button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.length === 0 && !showCreate && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "12px 0", textAlign: "center" }}>
          No groups yet. Create one or press Ctrl+G.
        </div>
      )}

      {groups.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          isSelected={selectedGroupId === group.id}
          isActive={activeGroupId === group.id}
          editingNameId={editingNameId}
          editingName={editingName}
          onSelect={() => setSelectedGroupId(selectedGroupId === group.id ? null : group.id)}
          onEnterEdit={() => enterGroupEditMode(group.id)}
          onExitEdit={exitGroupEditMode}
          onDelete={() => {
            deleteGroup(group.id);
            if (selectedGroupId === group.id) setSelectedGroupId(null);
          }}
          onToggleLock={() => toggleGroupLocked(group.id)}
          onStartRename={() => { setEditingNameId(group.id); setEditingName(group.name); }}
          onCommitRename={() => { renameGroup(group.id, editingName); setEditingNameId(null); }}
          onCancelRename={() => setEditingNameId(null)}
          onEditingNameChange={setEditingName}
        />
      ))}

      {/* Selected group detail panel */}
      {selectedGroup && (
        <div style={{ marginTop: 8 }}>

          {/* Delay Section */}
          <div style={SECTION_STYLE}>Delay</div>
          <div style={CARD_STYLE}>
            <div style={ROW_STYLE}>
              <span style={{ color: "var(--text-primary)" }}>Delay (beats)</span>
              <input
                type="number"
                step="0.25"
                value={selectedGroup.delay}
                onChange={(e) => setGroupDelay(selectedGroup.id, parseFloat(e.target.value) || 0)}
                style={{ ...INPUT_STYLE, width: 70, textAlign: "center" }}
              />
            </div>
            <div style={{ ...ROW_STYLE, borderBottom: selectedGroup.advancedDelay ? undefined : "none" }}>
              <span style={{ color: "var(--text-primary)" }}>Advanced (per-member)</span>
              <button
                onClick={() => toggleAdvancedDelay(selectedGroup.id)}
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  borderRadius: 4,
                  border: "1px solid var(--border-color)",
                  background: selectedGroup.advancedDelay ? "var(--accent-primary)" : "transparent",
                  color: selectedGroup.advancedDelay ? "#fff" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {selectedGroup.advancedDelay ? "ON" : "OFF"}
              </button>
            </div>
            {selectedGroup.advancedDelay && (
              <div style={{ padding: "4px 10px 6px", fontSize: 10, color: "var(--text-muted)" }}>
                Override delay per member below.
              </div>
            )}
          </div>

          {/* Members Section */}
          <div style={SECTION_STYLE}>Members</div>
          <div style={CARD_STYLE}>
            <div style={{ padding: "6px 10px", display: "flex", gap: 4 }}>
              {selectedGroup.type === "line" ? (
                <button onClick={handleAddSelected} style={{ ...BTN_ACCENT_STYLE, flex: 1, fontSize: 10 }}>
                  + Add Selected Lines
                </button>
              ) : (
                <button onClick={handleAddSelectedNotes} style={{ ...BTN_ACCENT_STYLE, flex: 1, fontSize: 10, background: "#38d9a9" }}>
                  + Add Selected Notes
                </button>
              )}
            </div>

            {selectedGroup.type === "line" && (selectedGroup as LineGroup).lines.length === 0 && (
              <div style={{ padding: "6px 10px", color: "var(--text-muted)", fontSize: 10, textAlign: "center" }}>
                No lines. Select lines and click "Add Selected".
              </div>
            )}

            {selectedGroup.type === "note" && (selectedGroup as NoteGroup).notes.length === 0 && (
              <div style={{ padding: "6px 10px", color: "var(--text-muted)", fontSize: 10, textAlign: "center" }}>
                No notes. Select notes and click "Add Selected".
              </div>
            )}

            {/* Line members */}
            {selectedGroup.type === "line" && (selectedGroup as LineGroup).lines.map((ref, i) => (
              <div key={ref.lineIndex} style={{ ...ROW_STYLE, borderBottom: i === (selectedGroup as LineGroup).lines.length - 1 ? "none" : undefined }}>
                <span style={{ color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ref.lineName || `Line ${ref.lineIndex + 1}`}
                </span>
                {selectedGroup.advancedDelay && (
                  <input
                    type="number"
                    step="0.25"
                    value={ref.delayOverride ?? ""}
                    placeholder={String(i * selectedGroup.delay)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMemberDelayOverride(
                        selectedGroup.id, "line", ref.lineIndex,
                        v === "" ? undefined : parseFloat(v) || 0,
                      );
                    }}
                    style={{ ...INPUT_STYLE, width: 55, textAlign: "center", marginRight: 4 }}
                  />
                )}
                <button
                  onClick={() => removeLineFromGroup(selectedGroup.id, ref.lineIndex)}
                  style={{ background: "none", border: "none", color: "#ff4060", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                >
                  x
                </button>
              </div>
            ))}

            {/* Note members */}
            {selectedGroup.type === "note" && (selectedGroup as NoteGroup).notes.map((ref, i) => {
              const line = chart.lines[ref.lineIndex];
              const note = line?.notes.find((n) => n.uid === ref.noteUid);
              const uidShort = ref.noteUid.slice(0, 6);
              const kindLabel = note?.kind ?? "?";
              const beatLabel = note ? beatToFloat(note.beat).toFixed(2) : "?";

              return (
                <div key={ref.noteUid} style={{ ...ROW_STYLE, borderBottom: i === (selectedGroup as NoteGroup).notes.length - 1 ? "none" : undefined }}>
                  <span style={{ color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {uidShort} · {kindLabel} @ {beatLabel}
                  </span>
                  {selectedGroup.advancedDelay && (
                    <input
                      type="number"
                      step="0.25"
                      value={ref.delayOverride ?? ""}
                      placeholder={String(i * selectedGroup.delay)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMemberDelayOverride(
                          selectedGroup.id, "note", ref.noteUid,
                          v === "" ? undefined : parseFloat(v) || 0,
                        );
                      }}
                      style={{ ...INPUT_STYLE, width: 55, textAlign: "center", marginRight: 4 }}
                    />
                  )}
                  <button
                    onClick={() => removeNoteFromGroup(selectedGroup.id, ref.noteUid)}
                    style={{ background: "none", border: "none", color: "#ff4060", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>

          {/* Batch Operations */}
          <div style={SECTION_STYLE}>Batch Operations</div>

          {selectedGroup.type === "line" && (
            <LineBatchOps
              groupId={selectedGroup.id}
              group={selectedGroup as LineGroup}
              chart={chart}
              batchKind={batchKind}
              setBatchKind={setBatchKind}
              batchType={batchType}
              setBatchType={setBatchType}
              batchValue={batchValue}
              setBatchValue={setBatchValue}
              batchEndValue={batchEndValue}
              setBatchEndValue={setBatchEndValue}
              batchStartBeat={batchStartBeat}
              setBatchStartBeat={setBatchStartBeat}
              batchEndBeat={batchEndBeat}
              setBatchEndBeat={setBatchEndBeat}
              copySourceLine={copySourceLine}
              setCopySourceLine={setCopySourceLine}
              deleteKind={deleteKind}
              setDeleteKind={setDeleteKind}
              onAddEvent={handleBatchAddEvent}
              onCopyEvents={() => batchCopyEvents(selectedGroup.id, copySourceLine, batchKind)}
              onDeleteEvents={() => batchDeleteEvents(selectedGroup.id, deleteKind)}
            />
          )}

          {selectedGroup.type === "note" && (
            <NoteBatchOps
              groupId={selectedGroup.id}
              group={selectedGroup as NoteGroup}
              shiftDelta={shiftDelta}
              setShiftDelta={setShiftDelta}
              noteKind={noteKind}
              setNoteKind={setNoteKind}
              noteSpeed={noteSpeed}
              setNoteSpeed={setNoteSpeed}
              onShiftNotes={() => batchShiftNotes(selectedGroup.id, shiftDelta)}
              onChangeKind={() => batchChangeNoteKind(selectedGroup.id, noteKind)}
              onFlipNotes={() => batchFlipNotes(selectedGroup.id)}
              onChangeSpeed={() => batchChangeNoteSpeed(selectedGroup.id, noteSpeed)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Line Batch Operations Sub-component
// ============================================================

function LineBatchOps({
  group,
  chart,
  batchKind, setBatchKind,
  batchType, setBatchType,
  batchValue, setBatchValue,
  batchEndValue, setBatchEndValue,
  batchStartBeat, setBatchStartBeat,
  batchEndBeat, setBatchEndBeat,
  copySourceLine, setCopySourceLine,
  deleteKind, setDeleteKind,
  onAddEvent, onCopyEvents, onDeleteEvents,
}: {
  groupId: string;
  group: LineGroup;
  chart: any;
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
}) {
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
            <input type="number" step="0.25" value={batchStartBeat} onChange={(e) => setBatchStartBeat(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>End Beat</label>
            <input type="number" step="0.25" value={batchEndBeat} onChange={(e) => setBatchEndBeat(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>{batchType === "constant" ? "Value" : "Start Value"}</label>
            <input type="number" step="0.1" value={batchValue} onChange={(e) => setBatchValue(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
          </div>
          {batchType === "transition" && (
            <div>
              <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>End Value</label>
              <input type="number" step="0.1" value={batchEndValue} onChange={(e) => setBatchEndValue(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
            </div>
          )}
        </div>
        <div style={{ padding: "6px 10px" }}>
          <button
            onClick={onAddEvent}
            disabled={lineCount === 0}
            style={{
              ...BTN_ACCENT_STYLE,
              width: "100%",
              opacity: lineCount === 0 ? 0.4 : 1,
              cursor: lineCount === 0 ? "not-allowed" : "pointer",
            }}
          >
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
              {chart.lines.map((_: any, i: number) => <option key={i} value={i}>Line {i + 1}</option>)}
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
          <button
            onClick={onCopyEvents}
            disabled={lineCount === 0}
            style={{
              ...BTN_ACCENT_STYLE,
              width: "100%",
              opacity: lineCount === 0 ? 0.4 : 1,
              cursor: lineCount === 0 ? "not-allowed" : "pointer",
            }}
          >
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
          <button
            onClick={onDeleteEvents}
            disabled={lineCount === 0}
            style={{
              ...BTN_DANGER_STYLE,
              width: "100%",
              opacity: lineCount === 0 ? 0.4 : 1,
              cursor: lineCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            Delete {deleteKind} from {lineCount} lines
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Note Batch Operations Sub-component
// ============================================================

function NoteBatchOps({
  group,
  shiftDelta, setShiftDelta,
  noteKind, setNoteKind,
  noteSpeed, setNoteSpeed,
  onShiftNotes, onChangeKind, onFlipNotes, onChangeSpeed,
}: {
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
}) {
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
          <input type="number" step="0.25" value={shiftDelta} onChange={(e) => setShiftDelta(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%", marginBottom: 6 }} />
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
              <input type="number" step="0.1" min="0" value={noteSpeed} onChange={(e) => setNoteSpeed(parseFloat(e.target.value) || 0)} style={{ ...INPUT_STYLE, width: "100%" }} />
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

// ============================================================
// Individual Group Row
// ============================================================

function GroupRow({
  group,
  isSelected,
  isActive,
  editingNameId,
  editingName,
  onSelect,
  onEnterEdit,
  onExitEdit,
  onDelete,
  onToggleLock,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onEditingNameChange,
}: {
  group: EditorGroup;
  isSelected: boolean;
  isActive: boolean;
  editingNameId: string | null;
  editingName: string;
  onSelect: () => void;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onEditingNameChange: (name: string) => void;
}) {
  const isEditing = editingNameId === group.id;
  const memberCount = group.type === "line" ? group.lines.length : group.notes.length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 6px",
        borderRadius: 6,
        border: isSelected ? "1px solid var(--accent-primary)" : "1px solid transparent",
        background: isActive ? "rgba(100, 200, 100, 0.08)" : isSelected ? "var(--bg-active)" : "transparent",
        cursor: "pointer",
        marginBottom: 2,
      }}
      onClick={onSelect}
      onDoubleClick={isActive ? onExitEdit : onEnterEdit}
    >
      {/* Color dot */}
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />

      {/* Type badge */}
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        padding: "1px 3px",
        borderRadius: 3,
        background: group.type === "line" ? "rgba(108, 138, 255, 0.15)" : "rgba(56, 217, 169, 0.15)",
        color: group.type === "line" ? "var(--accent-primary)" : "#38d9a9",
        flexShrink: 0,
      }}>
        {group.type === "line" ? "L" : "N"}
      </span>

      {/* Name */}
      {isEditing ? (
        <input
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, fontSize: 11, padding: "1px 4px",
            background: "var(--bg-secondary)", color: "var(--text-primary)",
            border: "1px solid var(--accent-primary)", borderRadius: 4,
            outline: "none", fontFamily: "inherit", minWidth: 0,
          }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
        >
          {group.name}
        </span>
      )}

      {/* Member count */}
      <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>
        {memberCount}
      </span>

      {/* Lock indicator */}
      {group.locked && (
        <span style={{ fontSize: 9, color: "var(--text-muted)" }} title="Locked">🔒</span>
      )}

      {/* Active indicator */}
      {isActive && (
        <span style={{ fontSize: 8, color: "#69db7c", fontWeight: 700 }}>EDIT</span>
      )}

      {/* Actions */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        style={{ fontSize: 10, padding: "0 2px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
        title={group.locked ? "Unlock" : "Lock"}
      >
        {group.locked ? "🔓" : "🔒"}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{ fontSize: 10, padding: "0 2px", background: "none", border: "none", color: "#ff4060", cursor: "pointer" }}
        title="Delete group"
      >
        x
      </button>
    </div>
  );
}

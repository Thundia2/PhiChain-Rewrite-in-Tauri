// ============================================================
// Paste Special Dialog
//
// Ctrl+Alt+V opens this modal. Allows pasting clipboard contents
// with transformations: mirror X, flip above/below, beat scaling,
// X offset, and beat offset.
// ============================================================

import { useState } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { BpmList } from "../../utils/bpmList";
import { getClipboard } from "../../hooks/useClipboard";
import { beatToFloat, floatToBeat } from "../../types/chart";
import type { Note, LineEvent } from "../../types/chart";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PasteSpecialDialog({ open, onClose }: Props) {
  const [mirrorX, setMirrorX] = useState(false);
  const [flipAboveBelow, setFlipAboveBelow] = useState(false);
  const [beatScale, setBeatScale] = useState(1.0);
  const [xOffset, setXOffset] = useState(0);
  const [beatOffset, setBeatOffset] = useState(0);

  if (!open) return null;

  const clipboard = getClipboard();
  const hasData = clipboard !== null && (clipboard.notes.length > 0 || clipboard.events.length > 0);

  const handleApply = () => {
    if (!clipboard) return;
    const es = useEditorStore.getState();
    const cs = useChartStore.getState();
    if (es.selectedLineIndex === null) return;

    // Compute paste offset: paste at the current playback position
    const { currentTime } = useAudioStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const currentBeat = bpmList.beatAtFloat(currentTime - cs.chart.offset);

    // The base beat from clipboard is the earliest item's beat
    const baseBeat = clipboard.baseBeat;

    // Paste notes with transforms
    for (const note of clipboard.notes) {
      const origBeat = beatToFloat(note.beat);
      // Scale the beat relative to baseBeat, then apply beat offset, then shift to playhead
      const scaledBeat = baseBeat + (origBeat - baseBeat) * beatScale;
      const finalBeat = scaledBeat - baseBeat + currentBeat + beatOffset;

      const pasted: Note = {
        ...structuredClone(note),
        beat: floatToBeat(Math.max(0, finalBeat)),
        x: (mirrorX ? -note.x : note.x) + xOffset,
        above: flipAboveBelow ? !note.above : note.above,
      };

      // Scale hold_beat if present
      if (pasted.hold_beat && beatScale !== 1.0) {
        const holdF = beatToFloat(pasted.hold_beat);
        pasted.hold_beat = floatToBeat(Math.max(0, holdF * beatScale));
      }

      cs.addNote(es.selectedLineIndex!, pasted);
    }

    // Paste events with transforms
    for (const event of clipboard.events) {
      const origStart = beatToFloat(event.start_beat);
      const origEnd = beatToFloat(event.end_beat);
      const origDuration = origEnd - origStart;

      // Scale and offset the start beat
      const scaledStart = baseBeat + (origStart - baseBeat) * beatScale;
      const finalStart = scaledStart - baseBeat + currentBeat + beatOffset;
      const finalDuration = origDuration * beatScale;

      const pasted: LineEvent = {
        ...structuredClone(event),
        start_beat: floatToBeat(Math.max(0, finalStart)),
        end_beat: floatToBeat(Math.max(0, finalStart + finalDuration)),
      };

      cs.addEvent(es.selectedLineIndex!, pasted);
    }

    onClose();
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-color)",
    outline: "none",
  };

  const checkboxRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "var(--text-primary)",
    fontSize: "12px",
    cursor: "pointer",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "320px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>
            Paste Special
          </span>
          <button
            onClick={onClose}
            style={{
              color: "var(--text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              padding: "0 4px",
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            X
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {!hasData && (
            <div style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", padding: "8px 0" }}>
              Nothing in clipboard. Copy notes/events first (Ctrl+C).
            </div>
          )}

          {hasData && (
            <>
              <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                Clipboard: {clipboard!.notes.length} note(s), {clipboard!.events.length} event(s)
              </div>

              {/* Checkboxes */}
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={mirrorX}
                  onChange={(e) => setMirrorX(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
                Mirror X (negate horizontal position)
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={flipAboveBelow}
                  onChange={(e) => setFlipAboveBelow(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
                Flip above/below
              </label>

              {/* Number inputs */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Beat scale factor
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={beatScale}
                    onChange={(e) => setBeatScale(Math.max(0.1, parseFloat(e.target.value) || 1))}
                    className="w-full mt-1 px-2 py-1 rounded text-xs"
                    style={inputStyle}
                  />
                </label>

                <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  X offset
                  <input
                    type="number"
                    step="10"
                    value={xOffset}
                    onChange={(e) => setXOffset(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 px-2 py-1 rounded text-xs"
                    style={inputStyle}
                  />
                </label>

                <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Beat offset
                  <input
                    type="number"
                    step="0.25"
                    value={beatOffset}
                    onChange={(e) => setBeatOffset(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 px-2 py-1 rounded text-xs"
                    style={inputStyle}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 16px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              color: "var(--text-secondary)",
              background: "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasData}
            style={{
              padding: "6px 16px",
              borderRadius: "4px",
              border: "none",
              cursor: hasData ? "pointer" : "not-allowed",
              fontSize: "12px",
              color: hasData ? "white" : "var(--text-muted)",
              backgroundColor: hasData ? "var(--accent-primary)" : "var(--bg-active)",
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

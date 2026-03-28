// ============================================================
// Lyrics Sync Dialog — Bulk lyrics timing tool
//
// Paste lyrics, play audio, press Enter to mark each line's
// start beat, then commit all text events at once.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { audioEngine } from "../../audio/audioEngine";
import { BpmList } from "../../utils/bpmList";
import { floatToBeat } from "../../types/chart";
import type { LineEvent } from "../../types/chart";
import { ensureTextLine } from "../../utils/textEventHelpers";
import { ActionButton, SectionHeader, Card } from "../common/UIKit";

interface LyricsSyncDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LyricsSyncDialog({ open, onClose }: LyricsSyncDialogProps) {
  const [lyrics, setLyrics] = useState("");
  const [syncedBeats, setSyncedBeats] = useState<number[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
  const defaultDuration = useSettingsStore((s) => s.defaultTextDurationBeats);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);

  const lines = lyrics.split("\n").filter((l) => l.trim().length > 0);
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Listen for keypress during sync
  useEffect(() => {
    if (!isSyncing) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "q" || e.key === "Q") {
        e.preventDefault();

        const cs = useChartStore.getState();
        const { currentTime } = useAudioStore.getState();
        const bpmList = new BpmList(cs.chart.bpm_list);
        const beat = bpmList.beatAtFloat(Math.max(0, currentTime - cs.chart.offset));

        setSyncedBeats((prev) => [...prev, beat]);
        setCurrentLyricIndex((prev) => {
          const next = prev + 1;
          if (next >= lines.length) {
            setIsSyncing(false);
          }
          return next;
        });
      }

      if (e.key === "Escape") {
        setIsSyncing(false);
      }
    };

    keyHandlerRef.current = handler;
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSyncing, lines.length]);

  const startSync = useCallback(() => {
    if (lines.length === 0) return;
    setSyncedBeats([]);
    setCurrentLyricIndex(0);
    setIsSyncing(true);
    // Start playback
    if (!useAudioStore.getState().isPlaying) {
      audioEngine.play();
    }
  }, [lines.length]);

  const reset = useCallback(() => {
    setSyncedBeats([]);
    setCurrentLyricIndex(0);
    setIsSyncing(false);
  }, []);

  const applyAndClose = useCallback(() => {
    if (syncedBeats.length === 0 || lines.length === 0) return;

    const targetLineIndex = ensureTextLine(selectedLineIndex);

    const newEvents: LineEvent[] = [];
    for (let i = 0; i < Math.min(syncedBeats.length, lines.length); i++) {
      const startBeat = syncedBeats[i];
      const endBeat = i < syncedBeats.length - 1
        ? syncedBeats[i + 1]
        : startBeat + defaultDuration;

      newEvents.push({
        kind: "text",
        start_beat: floatToBeat(startBeat),
        end_beat: floatToBeat(endBeat),
        value: { text_value: lines[i] },
      });
    }

    const cs = useChartStore.getState();
    for (const event of newEvents) {
      cs.addEvent(targetLineIndex, event);
    }

    onClose();
  }, [syncedBeats, lines, selectedLineIndex, defaultDuration, onClose]);

  if (!open) return null;

  const progress = lines.length > 0 ? syncedBeats.length / lines.length : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 420,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <SectionHeader>Lyrics Sync</SectionHeader>

        <Card>
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Paste lyrics (one line per event):
            </div>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={"Terror\nTerror is near\nI will\nshatter you all!!"}
              rows={8}
              style={{
                width: "100%",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 11,
                resize: "vertical",
                fontFamily: "inherit",
              }}
              disabled={isSyncing}
            />

            {/* Instructions */}
            <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Press <strong>Space</strong> to play, then press <strong>Enter</strong> or <strong>Q</strong> each time a lyric line starts. Timing is recorded.
            </div>

            {/* Progress */}
            {lines.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    Progress: {syncedBeats.length}/{lines.length} lines synced
                  </span>
                </div>
                <div style={{
                  height: 4,
                  backgroundColor: "var(--bg-primary)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${progress * 100}%`,
                    backgroundColor: "var(--accent-primary)",
                    borderRadius: 2,
                    transition: "width 0.2s",
                  }} />
                </div>
                {isSyncing && currentLyricIndex < lines.length && (
                  <div style={{
                    fontSize: 12,
                    color: "var(--accent-primary)",
                    fontWeight: 600,
                    marginTop: 6,
                    textAlign: "center",
                    padding: "4px 8px",
                    backgroundColor: "var(--accent-primary)" + "15",
                    borderRadius: 6,
                  }}>
                    "{lines[currentLyricIndex]}"
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          {!isSyncing ? (
            <>
              <ActionButton onClick={reset} disabled={syncedBeats.length === 0}>Reset</ActionButton>
              <ActionButton onClick={startSync} variant="primary" disabled={lines.length === 0}>
                Start Syncing
              </ActionButton>
              <ActionButton onClick={applyAndClose} variant="primary" disabled={syncedBeats.length === 0}>
                Apply & Close
              </ActionButton>
            </>
          ) : (
            <ActionButton onClick={() => setIsSyncing(false)}>Stop Syncing</ActionButton>
          )}
          <ActionButton onClick={onClose}>Cancel</ActionButton>
        </div>
      </div>
    </div>
  );
}

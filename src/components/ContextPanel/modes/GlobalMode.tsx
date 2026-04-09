// ============================================================
// GlobalMode — Context panel content for global (no selection) mode
//
// Recent change: Added 6 missing feature sections — DISPLAY (spectrogram
// toggle + opacity slider, note side filter), RECORD CHANNELS (X/Y/Rot
// checkboxes), TIMELINE ZOOM (preset buttons + slider), LINE SORT &
// FILTER (sort mode pills + category filter chips). Fixed X Snap
// reactivity bug.
// ============================================================

import React, { useState } from "react";
import { useEditorStore } from "../../../stores/editorStore";
import { useChartStore } from "../../../stores/chartStore";
import { useAudioStore } from "../../../stores/audioStore";
import { useDialogStore } from "../../../stores/dialogStore";
import { audioEngine } from "../../../audio/audioEngine";
import { triggerImportChart } from "../../../utils/importChart";
import { saveProject } from "../../../utils/ipc";
import { useContextPanelStore } from "../../../stores/contextPanelStore";
import { seekToPrevBookmark, seekToNextBookmark, addMarkerAtCurrentBeat } from "../../../utils/bookmarkNavigation";
import { useBookmarkStore } from "../../../stores/bookmarkStore";
import { performCopy, performCut, performPaste } from "../../../hooks/useClipboard";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useToastStore } from "../../../stores/toastStore";
import { selectByRange } from "../../../utils/batchNoteOps";
import { BpmList } from "../../../utils/bpmList";
import type { EditorTool } from "../../../types/editor";

// Panel components rendered inline when a panel button is clicked
import { ChartSettings } from "../../ChartSettings/ChartSettings";
import { BpmListPanel } from "../../BpmList/BpmList";
import { GroupManager } from "../../GroupManager/GroupManager";
import { TexturePanel } from "../../TexturePanel/TexturePanel";
import { ValidationPanel } from "../../Validation/ValidationPanel";
import { PresetPanel } from "../../PresetPanel/PresetPanel";

// ---- Shared sub-components (extracted to shared/) ----
import { HotkeyButton } from "../shared/HotkeyButton";
import { SectionHeader } from "../shared/SectionHeader";
import { ActionButton } from "../shared/ActionButton";
import { ContextBadge } from "../shared/ContextBadge";

// ---- Tool grid data ----

const TOOL_BUTTONS: Array<{ icon: string; label: string; hotkey: string; tool: EditorTool }> = [
  { icon: "V", label: "Select", hotkey: "V", tool: "select" },
  { icon: "E", label: "Eraser", hotkey: "E", tool: "eraser" },
  { icon: "1", label: "Tap", hotkey: "1", tool: "place_tap" },
  { icon: "2", label: "Drag", hotkey: "2", tool: "place_drag" },
  { icon: "3", label: "Flick", hotkey: "3", tool: "place_flick" },
  { icon: "4", label: "Hold", hotkey: "4", tool: "place_hold" },
];

// Button arrays with action callbacks and corrected hotkey labels
// Data errors fixed: Record="Alt+R" (not "R"), Redo="Ctrl+Y" (registered below),
// Prev/Next use bookmark nav (not loop [ / ]), Export has no hotkey (Ctrl+E was fictitious)

interface ActionButtonDef { icon: string; label: string; hotkey: string; action: () => void }

const PLAYBACK_BUTTONS: ActionButtonDef[] = [
  { icon: "\u25B6", label: "Play", hotkey: "Space", action: () => useAudioStore.getState().togglePlayPause() },
  { icon: "\u23F9", label: "Stop", hotkey: "", action: () => audioEngine.stop() },
  { icon: "\u23EA", label: "Rewind", hotkey: "", action: () => useAudioStore.getState().seek(0) },
  { icon: "\u23EE", label: "Prev", hotkey: "C+S+Scr\u2193", action: () => seekToPrevBookmark() },
  { icon: "\u23ED", label: "Next", hotkey: "C+S+Scr\u2191", action: () => seekToNextBookmark() },
  { icon: "\u23FA", label: "Record", hotkey: "Alt+R", action: () => useEditorStore.getState().toggleRecordMode() },
];

const EDIT_BUTTONS: ActionButtonDef[] = [
  { icon: "\u2702", label: "Cut", hotkey: "Ctrl+X", action: () => performCut() },
  { icon: "\u2398", label: "Copy", hotkey: "Ctrl+C", action: () => performCopy() },
  { icon: "\u2399", label: "Paste", hotkey: "Ctrl+V", action: () => performPaste() },
  { icon: "\u21B6", label: "Undo", hotkey: "Ctrl+Z", action: () => {
    // Interleaved undo: compare sequence numbers to decide which store to undo
    const cs = useChartStore.getState();
    const bs = useBookmarkStore.getState();
    const chartTopSeq = cs._pastSeqs.length > 0 ? cs._pastSeqs[cs._pastSeqs.length - 1] : 0;
    const bmTopSeq = bs._pastSeqs.length > 0 ? bs._pastSeqs[bs._pastSeqs.length - 1] : 0;
    if (bmTopSeq > chartTopSeq && bs.canUndo()) { bs.undo(); } else { cs.undo(); }
  }},
  { icon: "\u21B7", label: "Redo", hotkey: "Ctrl+Y", action: () => {
    const cs = useChartStore.getState();
    const bs = useBookmarkStore.getState();
    const chartRedoSeq = cs._futureSeqs.length > 0 ? cs._futureSeqs[cs._futureSeqs.length - 1] : 0;
    const bmRedoSeq = bs._futureSeqs.length > 0 ? bs._futureSeqs[bs._futureSeqs.length - 1] : 0;
    if (bmRedoSeq > chartRedoSeq && bs.canRedo()) { bs.redo(); } else { cs.redo(); }
  }},
  { icon: "A", label: "Sel All", hotkey: "Ctrl+A", action: () => {
    const es = useEditorStore.getState();
    const lineIdx = es.selectedLineIndex;
    if (lineIdx === null) return;
    const notes = useChartStore.getState().chart.lines[lineIdx]?.notes;
    if (notes) es.setNoteSelection([...Array(notes.length).keys()]);
  }},
];

const FILE_BUTTONS: ActionButtonDef[] = [
  { icon: "\uD83D\uDCC2", label: "Open", hotkey: "Ctrl+O", action: () => triggerImportChart() },
  { icon: "\uD83D\uDCBE", label: "Save", hotkey: "Ctrl+S", action: () => {
    const cs = useChartStore.getState();
    if (cs.projectPath) saveProject(cs.projectPath, cs.getChartJson());
  }},
  { icon: "\uD83D\uDCE4", label: "Export", hotkey: "\u2014", action: () => useDialogStore.getState().openDialog("selective-export") },
  { icon: "\uD83D\uDCC4", label: "Import", hotkey: "Ctrl+O", action: () => triggerImportChart() },
  { icon: "\u2699", label: "Settings", hotkey: "", action: () => useDialogStore.getState().openDialog("settings") },
  { icon: "?", label: "Help", hotkey: "F1", action: () => {
    // Switch to hotkeys tab within the context panel
    useContextPanelStore.getState().setActiveTab("global", "hotkeys");
  }},
];

// ---- Panel list data ----

// Panel items — panelId maps to INLINE_PANELS keys for inline rendering
const PANEL_ITEMS = [
  { icon: "\u2699", label: "Chart settings", panelId: "chart-settings" },
  { icon: "\uD83C\uDFB5", label: "BPM list", panelId: "bpm-list" },
  { icon: "\uD83D\uDCC1", label: "Groups", panelId: "groups" },
  { icon: "\uD83D\uDDBC", label: "Textures", panelId: "textures" },
  { icon: "\u2713", label: "Validation", panelId: "validation" },
  { icon: "\u2B50", label: "Presets", panelId: "presets" },
];

// ---- Inline panel registry ----
// Maps panel IDs to their React component for inline rendering in the context panel
const INLINE_PANELS: Record<string, { label: string; component: React.ComponentType }> = {
  "chart-settings": { label: "Chart Settings", component: ChartSettings },
  "bpm-list": { label: "BPM List", component: BpmListPanel },
  "groups": { label: "Groups", component: GroupManager },
  "textures": { label: "Textures", component: TexturePanel },
  "validation": { label: "Validation", component: ValidationPanel },
  "presets": { label: "Presets", component: PresetPanel },
};

// ---- Main component ----

export interface GlobalModeProps {
  activeTab: string;
  // Quick action callbacks
  onShowBatchLine?: () => void;
  onShowLyricsSync?: () => void;
  onShowParametric?: () => void;
  // Dialog callbacks (passed through for reference, not directly used here)
  onShowPasteSpecial?: () => void;
  onShowRecordReview?: () => void;
  onShowExportDiff?: () => void;
  onShowSelectiveExport?: () => void;
  onShowGoToBeat?: () => void;
}

export function GlobalMode({ activeTab, ...actionProps }: GlobalModeProps) {
  if (activeTab === "hotkeys") return <GlobalHotkeys />;
  // Default: "actions" tab
  return <GlobalActions {...actionProps} />;
}

// ---- Actions tab ----

function GlobalActions(props: Omit<GlobalModeProps, "activeTab">) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const xSnapEnabled = useEditorStore((s) => s.xSnapEnabled);
  const lanes = useEditorStore((s) => s.lanes);
  const showSpectrogram = useEditorStore((s) => s.showSpectrogram);
  const spectrogramOpacity = useEditorStore((s) => s.spectrogramOpacity);
  const noteSideFilter = useEditorStore((s) => s.noteSideFilter);
  // Onset detection state
  const onsetEnabled = useSettingsStore((s) => s.onsetDetectionEnabled);
  const onsetSensitivity = useSettingsStore((s) => s.onsetSensitivity);
  const onsetOpacity = useSettingsStore((s) => s.onsetOpacity);
  const onsetSnapToGrid = useSettingsStore((s) => s.onsetSnapToGrid);
  const onsetAnalyzing = useEditorStore((s) => s.onsetAnalyzing);
  const musicLoaded = useAudioStore((s) => s.musicLoaded);
  const recordMode = useEditorStore((s) => s.recordMode);
  const recordModeChannels = useEditorStore((s) => s.recordModeChannels);
  const timelineZoom = useEditorStore((s) => s.timelineZoom);
  const lineSortMode = useEditorStore((s) => s.lineSortMode);
  const lineStripCategoryFilter = useEditorStore((s) => s.lineStripCategoryFilter);
  const lines = useChartStore((s) => s.chart.lines);
  const addLine = useChartStore((s) => s.addLine);
  const bookmarkCount = useBookmarkStore((s) => s.bookmarks.length);
  // Beat grid settings (perpendicular beat subdivision overlay)
  const showBeatGrid = useSettingsStore((s) => s.showBeatGrid);
  const beatGridBeatsAhead = useSettingsStore((s) => s.beatGridBeatsAhead);

  // Inline panel state — when set, renders a panel component in place of the actions view
  const [inlinePanel, setInlinePanel] = useState<string | null>(null);

  const lineCount = lines.length;
  const noteCount = lines.reduce((acc, line) => acc + line.notes.length, 0);

  // If an inline panel is active, render it with a "← Back" header
  if (inlinePanel && INLINE_PANELS[inlinePanel]) {
    const panelDef = INLINE_PANELS[inlinePanel];
    const PanelComponent = panelDef.component;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Back button header */}
        <button
          onClick={() => setInlinePanel(null)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 8px", marginBottom: 6,
            background: "none", border: "none", borderRadius: 5,
            color: "var(--accent-primary)", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", textAlign: "left",
          }}
        >
          <span style={{ fontSize: 12 }}>{"\u2190"}</span>
          <span>Back to actions</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{panelDef.label}</span>
        </button>
        {/* Inline panel content — rendered in a scrollable container */}
        <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid var(--border-color)", paddingTop: 4 }}>
          <PanelComponent />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Context badge */}
      <ContextBadge
        icon={<span style={{ fontSize: 12 }}>{"\u25CE"}</span>}
        label="No selection"
        detail={`${lineCount} lines, ${noteCount} notes`}
        variant="global"
      />

      {/* Tools section */}
      <SectionHeader label="TOOLS" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
        {TOOL_BUTTONS.map((btn) => (
          <HotkeyButton
            key={btn.tool}
            icon={btn.icon}
            label={btn.label}
            hotkey={btn.hotkey}
            active={activeTool === btn.tool}
            onClick={() => setTool(btn.tool)}
          />
        ))}
      </div>

      {/* Playback section — all buttons now have onClick handlers */}
      <SectionHeader label="PLAYBACK" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
        {PLAYBACK_BUTTONS.map((btn) => (
          <HotkeyButton
            key={btn.label}
            icon={btn.icon}
            label={btn.label}
            hotkey={btn.hotkey}
            onClick={btn.action}
          />
        ))}
      </div>

      {/* Edit section — all buttons now have onClick handlers */}
      <SectionHeader label="EDIT" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
        {EDIT_BUTTONS.map((btn) => (
          <HotkeyButton
            key={btn.label}
            icon={btn.icon}
            label={btn.label}
            hotkey={btn.hotkey}
            onClick={btn.action}
          />
        ))}
      </div>

      {/* File section — all buttons now have onClick handlers */}
      <SectionHeader label="FILE" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
        {FILE_BUTTONS.map((btn) => (
          <HotkeyButton
            key={btn.label}
            icon={btn.icon}
            label={btn.label}
            hotkey={btn.hotkey}
            onClick={btn.action}
          />
        ))}
      </div>

      {/* Quick actions — wired to open their respective dialogs */}
      <SectionHeader label="QUICK ACTIONS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <ActionButton icon="+" label="Add new line" onClick={() => addLine()} />
        <ActionButton icon={"\u2630"} label="Batch create lines..." onClick={props.onShowBatchLine} />
        <ActionButton icon={"\u266A"} label="Lyrics sync..." onClick={props.onShowLyricsSync} />
        <ActionButton icon={"\u223F"} label="Parametric trajectory..." onClick={props.onShowParametric} />
      </div>

      {/* Section markers — add, navigate prev/next */}
      <SectionHeader label="SECTION MARKERS" count={bookmarkCount} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <ActionButton icon="+" label={`Add Marker (Ctrl+B)`} onClick={() => addMarkerAtCurrentBeat()} />
        <ActionButton icon={"\u23EE"} label={`Previous (Ctrl+Shift+Scroll\u2193)`} onClick={() => seekToPrevBookmark()} />
        <ActionButton icon={"\u23ED"} label={`Next (Ctrl+Shift+Scroll\u2191)`} onClick={() => seekToNextBookmark()} />
      </div>

      {/* ---- SELECT BY RANGE — beat/X range note selection ---- */}
      <SectionHeader label="SELECT BY RANGE" />
      <SelectByRangeSection />

      {/* X Snap — toggle and lane presets (reactive via hook subscriptions) */}
      <SectionHeader label="X SNAP" />
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button onClick={() => useEditorStore.getState().toggleXSnap()} style={{
          flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 3,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: xSnapEnabled ? "#8b5cf618" : "var(--bg-active)",
          color: xSnapEnabled ? "#8b5cf6" : "var(--text-muted)",
          fontWeight: xSnapEnabled ? 700 : 400,
        }}>
          {xSnapEnabled ? `Snap ON (${lanes})` : "Snap OFF"}
        </button>
        {([9, 18, 30] as const).map((n) => {
          const isActive = xSnapEnabled && lanes === n;
          return (
            <button key={n} onClick={() => {
              useEditorStore.getState().setLanes(n);
              if (!useEditorStore.getState().xSnapEnabled) useEditorStore.getState().toggleXSnap();
            }} style={{
              width: 36, fontSize: 9, padding: "4px 0", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: isActive ? "#8b5cf6" : "var(--bg-active)",
              color: isActive ? "#fff" : "var(--text-muted)",
            }}>
              {n}
            </button>
          );
        })}
      </div>

      {/* ---- BEAT GRID — perpendicular beat grid overlay ---- */}
      <SectionHeader label="BEAT GRID" />
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
        <button onClick={() => {
          const ss = useSettingsStore.getState();
          ss.updateSettings({ showBeatGrid: !ss.showBeatGrid });
        }} style={{
          flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 3,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: showBeatGrid ? "#6c8aff18" : "var(--bg-active)",
          color: showBeatGrid ? "#6c8aff" : "var(--text-muted)",
          fontWeight: showBeatGrid ? 700 : 400,
        }}>
          {showBeatGrid ? "Grid ON" : "Grid OFF"}
        </button>
        {showBeatGrid && (
          <>
            <span style={{ fontSize: 8, color: "var(--text-muted)" }}>Ahead:</span>
            {([2, 4, 8] as const).map((n) => (
              <button key={n} onClick={() => {
                useSettingsStore.getState().updateSettings({ beatGridBeatsAhead: n });
              }} style={{
                width: 28, fontSize: 9, padding: "4px 0", borderRadius: 3,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: beatGridBeatsAhead === n ? "#6c8aff" : "var(--bg-active)",
                color: beatGridBeatsAhead === n ? "#fff" : "var(--text-muted)",
              }}>
                {n}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ---- DISPLAY — spectrogram and note side filter ---- */}
      <SectionHeader label="DISPLAY" />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {/* Spectrogram toggle + opacity */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => useEditorStore.getState().setShowSpectrogram(!showSpectrogram)}
            style={{
              fontSize: 9, padding: "4px 8px", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: showSpectrogram ? "#22d3ee18" : "var(--bg-active)",
              color: showSpectrogram ? "#22d3ee" : "var(--text-muted)",
              fontWeight: showSpectrogram ? 700 : 400,
            }}
          >
            {showSpectrogram ? "Spectrogram ON" : "Spectrogram OFF"}
          </button>
          {showSpectrogram && (
            <input
              type="range" min="0" max="1" step="0.05"
              value={spectrogramOpacity}
              onChange={(e) => useEditorStore.getState().setSpectrogramOpacity(parseFloat(e.target.value))}
              style={{ flex: 1, height: 4, accentColor: "#22d3ee" }}
            />
          )}
        </div>
        {/* ---- Onset Detection toggle + sensitivity + opacity ---- */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => {
              useSettingsStore.getState().updateSettings({
                onsetDetectionEnabled: !onsetEnabled,
              });
            }}
            style={{
              fontSize: 9, padding: "4px 8px", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: onsetEnabled ? "#ffa83218" : "var(--bg-active)",
              color: onsetEnabled ? "#ffa832" : "var(--text-muted)",
              fontWeight: onsetEnabled ? 700 : 400,
            }}
          >
            {onsetAnalyzing ? "Analyzing\u2026" : onsetEnabled ? "Onsets ON" : "Onsets OFF"}
          </button>
          {onsetEnabled && (
            <input
              type="range" min="0" max="1" step="0.05"
              value={onsetSensitivity}
              onChange={(e) => useSettingsStore.getState().updateSettings({
                onsetSensitivity: parseFloat(e.target.value),
              })}
              style={{ flex: 1, height: 4, accentColor: "#ffa832" }}
              title={`Sensitivity: ${Math.round(onsetSensitivity * 100)}%`}
            />
          )}
        </div>
        {onsetEnabled && (
          <button
            onClick={() => useDialogStore.getState().openDialog("onset-calibration")}
            disabled={!musicLoaded}
            style={{
              fontSize: 9, padding: "4px 10px", borderRadius: 4,
              border: "1px solid rgba(255, 168, 50, 0.3)",
              background: "rgba(255, 168, 50, 0.08)",
              color: musicLoaded ? "#ffa832" : "var(--text-muted)",
              cursor: musicLoaded ? "pointer" : "default",
              fontFamily: "inherit", fontWeight: 600,
              opacity: musicLoaded ? 1 : 0.4,
            }}
          >
            {"Calibrate\u2026"}
          </button>
        )}
        {onsetEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 8, color: "var(--text-muted)" }}>Opacity</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={onsetOpacity}
              onChange={(e) => useSettingsStore.getState().updateSettings({
                onsetOpacity: parseFloat(e.target.value),
              })}
              style={{ flex: 1, height: 4, accentColor: "#ffa832" }}
            />
            <span style={{ fontSize: 8, color: "var(--text-muted)", minWidth: 24 }}>
              {Math.round(onsetOpacity * 100)}%
            </span>
          </div>
        )}
        {onsetEnabled && (
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onsetSnapToGrid}
              onChange={(e) => useSettingsStore.getState().updateSettings({
                onsetSnapToGrid: e.target.checked,
              })}
              style={{ accentColor: "#ffa832" }}
            />
            Snap to beat grid
          </label>
        )}

        {/* Note side filter — All / Above / Below */}
        <div style={{ display: "flex", gap: 3 }}>
          <span style={{ fontSize: 8, color: "var(--text-muted)", alignSelf: "center", marginRight: 2 }}>Notes:</span>
          {(["all", "above", "below"] as const).map((f) => (
            <button
              key={f}
              onClick={() => useEditorStore.getState().setNoteSideFilter(f)}
              style={{
                flex: 1, fontSize: 9, padding: "3px 0", borderRadius: 3,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: noteSideFilter === f ? "var(--accent-primary)" : "var(--bg-active)",
                color: noteSideFilter === f ? "#fff" : "var(--text-muted)",
                fontWeight: noteSideFilter === f ? 600 : 400,
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ---- RECORD CHANNELS — shown when record mode is available ---- */}
      <SectionHeader label="RECORD CHANNELS" />
      <div style={{ display: "flex", gap: 6, marginBottom: 8, padding: "0 4px" }}>
        {(["x", "y", "rotation"] as const).map((ch) => {
          const active = recordModeChannels[ch];
          const colors: Record<string, string> = { x: "#ff6b6b", y: "#51cf66", rotation: "#ffd43b" };
          return (
            <label key={ch} style={{
              display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
              fontSize: 9, color: active ? colors[ch] : "var(--text-muted)",
              fontWeight: active ? 600 : 400,
            }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => useEditorStore.getState().setRecordModeChannels({ [ch]: e.target.checked })}
                style={{ accentColor: colors[ch], width: 12, height: 12 }}
              />
              {ch === "rotation" ? "Rot" : ch.toUpperCase()}
            </label>
          );
        })}
        {recordMode && (
          <span style={{ fontSize: 8, color: "#f87171", marginLeft: "auto", fontWeight: 600 }}>REC</span>
        )}
      </div>

      {/* ---- TIMELINE — zoom control ---- */}
      <SectionHeader label="TIMELINE ZOOM" />
      <div style={{ display: "flex", gap: 3, alignItems: "center", marginBottom: 8 }}>
        {([0.5, 1, 2, 4] as const).map((z) => (
          <button
            key={z}
            onClick={() => useEditorStore.getState().setTimelineZoom(z)}
            style={{
              flex: 1, fontSize: 9, padding: "3px 0", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: Math.abs(timelineZoom - z) < 0.05 ? "var(--accent-primary)" : "var(--bg-active)",
              color: Math.abs(timelineZoom - z) < 0.05 ? "#fff" : "var(--text-muted)",
              fontWeight: Math.abs(timelineZoom - z) < 0.05 ? 600 : 400,
            }}
          >
            {z}x
          </button>
        ))}
        <input
          type="range" min="0.1" max="10" step="0.1"
          value={timelineZoom}
          onChange={(e) => useEditorStore.getState().setTimelineZoom(parseFloat(e.target.value))}
          style={{ flex: 2, height: 4, accentColor: "var(--accent-primary)" }}
        />
      </div>

      {/* ---- LINE SORT & FILTER ---- */}
      <SectionHeader label="LINE SORT & FILTER" />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {/* Sort mode pills */}
        <div style={{ display: "flex", gap: 3 }}>
          {([
            { value: "chart_order", label: "Chart" },
            { value: "first_appearance", label: "Appear" },
            { value: "active_first", label: "Active" },
          ] as const).map((m) => (
            <button
              key={m.value}
              onClick={() => useEditorStore.getState().setLineSortMode(m.value)}
              style={{
                flex: 1, fontSize: 9, padding: "3px 0", borderRadius: 3,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: lineSortMode === m.value ? "var(--accent-primary)" : "var(--bg-active)",
                color: lineSortMode === m.value ? "#fff" : "var(--text-muted)",
                fontWeight: lineSortMode === m.value ? 600 : 400,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* Category filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          <button
            onClick={() => useEditorStore.getState().setLineStripCategoryFilter(null)}
            style={{
              fontSize: 8, padding: "2px 6px", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: lineStripCategoryFilter === null ? "var(--accent-primary)" : "var(--bg-active)",
              color: lineStripCategoryFilter === null ? "#fff" : "var(--text-muted)",
            }}
          >
            All
          </button>
          {(["gameplay", "visual", "text", "helper"] as const).map((cat) => {
            const active = lineStripCategoryFilter?.includes(cat) ?? false;
            const catColors: Record<string, string> = { gameplay: "#48b5ff", visual: "#c084fc", text: "#99e9f2", helper: "#868e96" };
            return (
              <button
                key={cat}
                onClick={() => useEditorStore.getState().toggleLineStripCategory(cat)}
                style={{
                  fontSize: 8, padding: "2px 6px", borderRadius: 3,
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: active ? catColors[cat] + "25" : "var(--bg-active)",
                  color: active ? catColors[cat] : "var(--text-muted)",
                  fontWeight: active ? 600 : 400,
                  textTransform: "capitalize",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panels — clicking shows the panel content inline in this context panel */}
      <SectionHeader label="PANELS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {PANEL_ITEMS.map((item) => (
          <ActionButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            onClick={() => setInlinePanel(item.panelId)}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Hotkeys tab ----

const GLOBAL_HOTKEY_SECTIONS = [
  {
    title: "GENERAL",
    keys: [
      { icon: "V", label: "Select tool", hotkey: "V" },
      { icon: "E", label: "Eraser tool", hotkey: "E" },
      { icon: "1", label: "Place Tap", hotkey: "1" },
      { icon: "2", label: "Place Drag", hotkey: "2" },
      { icon: "3", label: "Place Flick", hotkey: "3" },
      { icon: "4", label: "Place Hold", hotkey: "4" },
    ],
  },
  {
    title: "NAVIGATION",
    keys: [
      { icon: "\u25B6", label: "Play/Pause", hotkey: "Space" },
      { icon: "G", label: "Go to beat", hotkey: "Ctrl+G" },
      { icon: "+", label: "Zoom in", hotkey: "Ctrl+=" },
      { icon: "-", label: "Zoom out", hotkey: "Ctrl+-" },
      { icon: "F", label: "Fit view", hotkey: "Ctrl+0" },
      { icon: "H", label: "Home", hotkey: "Home" },
    ],
  },
  {
    title: "EDITING",
    keys: [
      { icon: "Z", label: "Undo", hotkey: "Ctrl+Z" },
      { icon: "Y", label: "Redo", hotkey: "Ctrl+Y" },
      { icon: "S", label: "Save", hotkey: "Ctrl+S" },
      { icon: "A", label: "Select all", hotkey: "Ctrl+A" },
      { icon: "D", label: "Duplicate", hotkey: "Ctrl+D" },
      { icon: "\u232B", label: "Delete", hotkey: "Del" },
    ],
  },
];

/**
 * SelectByRangeSection — UI for selecting notes by beat range,
 * X range, and side filter on the current line.
 */
function SelectByRangeSection() {
  const [startBeat, setStartBeat] = useState("0");
  const [endBeat, setEndBeat] = useState("16");
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "above" | "below">("all");
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const lines = useChartStore((s) => s.chart.lines);

  const handleSelect = () => {
    if (selectedLineIndex === null) return;
    const line = lines[selectedLineIndex];
    if (!line) return;

    const sb = parseFloat(startBeat);
    const eb = parseFloat(endBeat);
    if (isNaN(sb) || isNaN(eb) || eb < sb) return;

    const xMinVal = xMin.trim() !== "" ? parseFloat(xMin) : null;
    const xMaxVal = xMax.trim() !== "" ? parseFloat(xMax) : null;

    const indices = selectByRange(line.notes, sb, eb, xMinVal, xMaxVal, sideFilter);

    // Always apply the selection (empty = deselect), and give feedback
    useEditorStore.getState().setNoteSelection(indices);
    if (indices.length === 0) {
      useToastStore.getState().addToast({ message: "No notes matched the range", type: "info" });
    }
  };

  // Quick fill: set start from current playhead position
  const handleFromPlayhead = () => {
    const { currentTime } = useAudioStore.getState();
    const cs = useChartStore.getState();
    const bpmList = new BpmList(cs.chart.bpm_list);
    const beat = bpmList.beatAtFloat(currentTime - cs.chart.offset);
    setStartBeat(beat.toFixed(2));
  };

  const noLine = selectedLineIndex === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8, opacity: noLine ? 0.4 : 1 }}>
      {/* Beat range row */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "var(--text-muted)", width: 30 }}>Beat</span>
        <input
          type="number" step="0.25" placeholder="Start"
          value={startBeat}
          onChange={(e) => setStartBeat(e.target.value)}
          style={{
            flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3,
            border: "1px solid var(--border-color)", background: "var(--bg-active)",
            color: "var(--text-primary)", fontFamily: "inherit",
          }}
        />
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{"\u2192"}</span>
        <input
          type="number" step="0.25" placeholder="End"
          value={endBeat}
          onChange={(e) => setEndBeat(e.target.value)}
          style={{
            flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3,
            border: "1px solid var(--border-color)", background: "var(--bg-active)",
            color: "var(--text-primary)", fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleFromPlayhead}
          title="Set start from playhead"
          style={{
            fontSize: 10, padding: "3px 6px", borderRadius: 3,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: "var(--bg-active)", color: "var(--text-muted)",
          }}
        >
          {"\u25F7"}
        </button>
      </div>

      {/* X range row (optional) */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "var(--text-muted)", width: 30 }}>X</span>
        <input
          type="number" step="1" placeholder="Min (opt)"
          value={xMin}
          onChange={(e) => setXMin(e.target.value)}
          style={{
            flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3,
            border: "1px solid var(--border-color)", background: "var(--bg-active)",
            color: "var(--text-primary)", fontFamily: "inherit",
          }}
        />
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{"\u2192"}</span>
        <input
          type="number" step="1" placeholder="Max (opt)"
          value={xMax}
          onChange={(e) => setXMax(e.target.value)}
          style={{
            flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3,
            border: "1px solid var(--border-color)", background: "var(--bg-active)",
            color: "var(--text-primary)", fontFamily: "inherit",
          }}
        />
      </div>

      {/* Side filter + select button */}
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "var(--text-muted)", width: 30 }}>Side</span>
        {(["all", "above", "below"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSideFilter(f)}
            style={{
              flex: 1, fontSize: 9, padding: "3px 0", borderRadius: 3,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: sideFilter === f ? "var(--accent-primary)" : "var(--bg-active)",
              color: sideFilter === f ? "#fff" : "var(--text-muted)",
              fontWeight: sideFilter === f ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
        <button
          onClick={handleSelect}
          disabled={noLine}
          style={{
            fontSize: 9, padding: "4px 10px", borderRadius: 4,
            border: "none", cursor: noLine ? "default" : "pointer",
            fontFamily: "inherit", fontWeight: 600,
            background: noLine ? "var(--bg-active)" : "var(--accent-primary)",
            color: noLine ? "var(--text-muted)" : "#fff",
          }}
        >
          Select
        </button>
      </div>
    </div>
  );
}

function GlobalHotkeys() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {GLOBAL_HOTKEY_SECTIONS.map((section) => (
        <React.Fragment key={section.title}>
          <SectionHeader label={section.title} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
            {section.keys.map((k) => (
              <HotkeyButton key={k.label} icon={k.icon} label={k.label} hotkey={k.hotkey} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

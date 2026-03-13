// ============================================================
// New Chart Dialog — Redesigned with sectioned card layout
//
// Matches the Linear/Figma aesthetic: drag-drop file zones,
// metadata card with difficulty selector, timing section.
// ============================================================

import { useState, useRef } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTabStore } from "../../stores/tabStore";
import { audioEngine } from "../../audio/audioEngine";
import { isTauri, pickFile, createProject, loadProject } from "../../utils/ipc";
import { saveSession, registerSession, setSkipNextSave } from "../../utils/chartSessions";
import { useRecentProjectsStore } from "../../stores/recentProjectsStore";
import { saveStoredProject } from "../../utils/projectStorage";
import type { ProjectMeta, PhichainChart } from "../../types/chart";

interface Props {
  open: boolean;
  onClose: () => void;
}

/* ── Reusable sub-components ── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "var(--text-muted)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="flex"
      style={{
        gap: 0,
        backgroundColor: "var(--bg-secondary)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "5px 0",
            borderRadius: 5,
            fontSize: 10,
            border: "none",
            cursor: "pointer",
            backgroundColor: value === opt.value ? "var(--accent-primary)" : "transparent",
            color: value === opt.value ? "#fff" : "var(--text-muted)",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            if (value !== opt.value) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
          }}
          onMouseLeave={(e) => {
            if (value !== opt.value) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          }}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 12,
  border: "0.5px solid var(--border-color)",
  backgroundColor: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--accent-primary)";
}
function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--border-color)";
}

/* ── File Drop Zone ── */

function DropZone({
  icon,
  title,
  description,
  extensions,
  fileName,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onClear,
}: {
  icon: string;
  title: string;
  description: string;
  extensions: string;
  fileName: string | null;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <div
      onClick={fileName ? undefined : onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        border: `1.5px dashed ${dragOver ? "var(--accent-primary)" : "var(--border-color)"}`,
        borderRadius: 10,
        padding: 16,
        textAlign: "center",
        cursor: fileName ? "default" : "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        backgroundColor: dragOver ? "rgba(108,138,255,0.04)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!fileName && !dragOver) {
          e.currentTarget.style.borderColor = "var(--text-muted)";
          e.currentTarget.style.background = "rgba(108,138,255,0.04)";
        }
      }}
      onMouseLeave={(e) => {
        if (!dragOver) {
          e.currentTarget.style.borderColor = dragOver ? "var(--accent-primary)" : "var(--border-color)";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {fileName ? (
        <>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "var(--bg-active)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {icon}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500, wordBreak: "break-all" }}>
            {fileName}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              background: "var(--bg-active)",
              border: "none",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              transition: "color 0.1s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ff6b6b"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "var(--bg-active)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {icon}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{description}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{extensions}</div>
        </>
      )}
    </div>
  );
}

/* ── Card Row ── */

function CardRow({
  label,
  children,
  last = false,
  side,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
  side?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: last ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
        display: side ? "flex" : undefined,
      }}
    >
      {side ? (
        <>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              {label}
            </label>
            {children}
          </div>
          <div style={{ width: 160, paddingLeft: 14, borderLeft: "1px solid rgba(42, 42, 53, 0.55)" }}>
            {side}
          </div>
        </>
      ) : (
        <>
          <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            {label}
          </label>
          {children}
        </>
      )}
    </div>
  );
}

/* ── Main Dialog ── */

export function NewProjectDialog({ open, onClose }: Props) {
  const [meta, setMeta] = useState<ProjectMeta>({
    name: "",
    composer: "",
    charter: "",
    illustrator: "",
    level: "",
  });
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicPath, setMusicPath] = useState<string | null>(null);
  const [illustrationFile, setIllustrationFile] = useState<File | null>(null);
  const [illustrationPath, setIllustrationPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [difficulty, setDifficulty] = useState<string>("IN");
  const [levelNumber, setLevelNumber] = useState(15);
  const [initialBpm, setInitialBpm] = useState(120);
  const [dragOverMusic, setDragOverMusic] = useState(false);
  const [dragOverIllustration, setDragOverIllustration] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const illustrationInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const musicName = musicFile?.name ?? musicPath?.split(/[\\/]/).pop() ?? null;
  const illustrationName = illustrationFile?.name ?? illustrationPath?.split(/[\\/]/).pop() ?? null;

  const handlePickMusic = async () => {
    if (isTauri()) {
      const path = await pickFile([
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] },
      ]);
      if (path) {
        setMusicPath(path);
        setMusicFile(null);
        setError(null);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      setMusicPath(null);
      setError(null);
    }
  };

  const handlePickIllustration = async () => {
    if (isTauri()) {
      const path = await pickFile([
        { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] },
      ]);
      if (path) {
        setIllustrationPath(path);
        setIllustrationFile(null);
        setError(null);
      }
    } else {
      illustrationInputRef.current?.click();
    }
  };

  const handleIllustrationFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIllustrationFile(file);
      setIllustrationPath(null);
      setError(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    // Compose level from difficulty + number
    const composedLevel = `${difficulty} Lv.${levelNumber}`;
    const finalMeta = { ...meta, level: composedLevel };

    try {
      let musicUrl: string | null = null;

      // Save the current chart's session before loading a new one
      const currentChartTabs = useTabStore.getState().tabs.filter((t) => t.type === "chart");
      const currentActiveTab = useTabStore.getState().tabs.find(
        (t) => t.id === useTabStore.getState().activeTabId,
      );
      if (currentActiveTab?.type === "chart" && useChartStore.getState().isLoaded) {
        saveSession(currentActiveTab.id);
      } else if (currentChartTabs.length > 0 && useChartStore.getState().isLoaded) {
        saveSession(currentChartTabs[currentChartTabs.length - 1].id);
      }

      setSkipNextSave();

      if (isTauri() && musicPath) {
        const folderPath = musicPath.replace(/[\\/][^\\/]+$/, "") + "/" + (finalMeta.name || "new-chart");
        await createProject(folderPath, finalMeta, musicPath, illustrationPath ?? undefined);

        const projectData = await loadProject(folderPath);
        const cs = useChartStore.getState();
        cs.loadFromProjectData(projectData);

        if (projectData.music_path) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const url = convertFileSrc(projectData.music_path);
          const ext = projectData.music_path.split(".").pop()?.toLowerCase() ?? "mp3";
          await audioEngine.load(url, ext);
          useAudioStore.getState().setMusicLoaded(true);
        }

        if (projectData.illustration_path) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const illustUrl = convertFileSrc(projectData.illustration_path);
          await cs.loadIllustration(illustUrl);
        }

        useEditorStore.getState().selectLine(0);

        const tabId = `chart:${folderPath}`;
        useTabStore.getState().openChart(folderPath, finalMeta.name || "Untitled Chart");
        registerSession(tabId);

        onClose();
        return;
      }

      if (musicFile) {
        const objectUrl = URL.createObjectURL(musicFile);
        const ext = musicFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
        await audioEngine.load(objectUrl, ext);
        useAudioStore.getState().setMusicLoaded(true);
        musicUrl = objectUrl;
      }

      let illustrationUrl: string | null = null;
      if (illustrationFile) {
        illustrationUrl = URL.createObjectURL(illustrationFile);
      }

      const defaultChart: PhichainChart = {
        format: 1,
        offset: 0,
        bpm_list: [{ beat: [0, 0, 1], bpm: initialBpm }],
        lines: [
          {
            name: "Line 1",
            notes: [],
            events: [
              { kind: "x", start_beat: [0, 0, 1], end_beat: [1000, 0, 1], value: { constant: 0 } },
              { kind: "y", start_beat: [0, 0, 1], end_beat: [1000, 0, 1], value: { constant: 0 } },
              { kind: "rotation", start_beat: [0, 0, 1], end_beat: [1000, 0, 1], value: { constant: 0 } },
              { kind: "opacity", start_beat: [0, 0, 1], end_beat: [1000, 0, 1], value: { constant: 255 } },
              { kind: "speed", start_beat: [0, 0, 1], end_beat: [1000, 0, 1], value: { constant: 1 } },
            ],
            children: [],
            curve_note_tracks: [],
          },
        ],
      };

      const cs = useChartStore.getState();
      cs.loadFromProjectData({
        chart_json: JSON.stringify(defaultChart),
        meta: finalMeta,
        project_path: "in-memory",
        music_path: musicUrl ?? "",
        illustration_path: null,
      });

      if (illustrationUrl) {
        await cs.loadIllustration(illustrationUrl);
      }

      useEditorStore.getState().selectLine(0);

      const chartId = `browser-${Date.now()}`;
      const tabId = `chart:${chartId}`;
      useTabStore.getState().openChart(chartId, finalMeta.name || "Untitled Chart");
      registerSession(tabId);

      const projectId = crypto.randomUUID();
      await saveStoredProject({
        id: projectId,
        chartJson: JSON.stringify(defaultChart),
        meta: finalMeta,
        audioBlob: musicFile ? await musicFile.arrayBuffer() : null,
        audioExt: musicFile ? (musicFile.name.split(".").pop()?.toLowerCase() ?? null) : null,
        savedAt: Date.now(),
      });
      useRecentProjectsStore.getState().addRecent({
        id: projectId,
        name: finalMeta.name || "Untitled",
        composer: finalMeta.composer || "",
        level: composedLevel,
        lineCount: 1,
        noteCount: 0,
        importType: "new",
      });

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes ncFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ncScaleIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={handleFileInput} />
      <input ref={illustrationInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={handleIllustrationFileInput} />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
          animation: "ncFadeIn 0.15s",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="flex flex-col"
          style={{
            width: 480,
            maxHeight: "90vh",
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            overflow: "hidden",
            animation: "ncScaleIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>New chart</span>
            </div>
            <button
              className="flex items-center justify-center"
              style={{
                width: 28, height: 28, borderRadius: 6,
                backgroundColor: "var(--bg-active)", color: "var(--text-muted)",
                fontSize: 14, cursor: "pointer", border: "none", transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", padding: "16px 20px" }}>

            {/* FILES SECTION */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader>Files</SectionHeader>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <DropZone
                  icon="🎵"
                  title="Music file"
                  description="Drop audio or click to browse"
                  extensions=".mp3 .wav .ogg .flac"
                  fileName={musicName}
                  dragOver={dragOverMusic}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverMusic(true); }}
                  onDragLeave={() => setDragOverMusic(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOverMusic(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && /\.(mp3|wav|ogg|flac|m4a)$/i.test(file.name)) {
                      setMusicFile(file); setMusicPath(null); setError(null);
                    }
                  }}
                  onClick={handlePickMusic}
                  onClear={() => { setMusicFile(null); setMusicPath(null); }}
                />
                <DropZone
                  icon="🖼"
                  title="Illustration"
                  description="Drop image or click to browse"
                  extensions=".png .jpg .webp"
                  fileName={illustrationName}
                  dragOver={dragOverIllustration}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIllustration(true); }}
                  onDragLeave={() => setDragOverIllustration(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOverIllustration(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && /\.(png|jpg|jpeg|webp)$/i.test(file.name)) {
                      setIllustrationFile(file); setIllustrationPath(null); setError(null);
                    }
                  }}
                  onClick={handlePickIllustration}
                  onClear={() => { setIllustrationFile(null); setIllustrationPath(null); }}
                />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, textAlign: "center" }}>
                Both files are optional — you can add them later
              </div>
            </div>

            {/* CHART INFO SECTION */}
            <div style={{ marginBottom: 20 }}>
              <SectionHeader>Chart info</SectionHeader>
              <div style={{ backgroundColor: "var(--bg-active)", borderRadius: 10, overflow: "hidden" }}>
                <CardRow label="Song name">
                  <input
                    style={INPUT_STYLE}
                    value={meta.name}
                    onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                    placeholder="e.g. Aegleseeker"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Composer">
                  <input
                    style={INPUT_STYLE}
                    value={meta.composer}
                    onChange={(e) => setMeta({ ...meta, composer: e.target.value })}
                    placeholder="e.g. silentroom"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow label="Charter">
                  <input
                    style={INPUT_STYLE}
                    value={meta.charter}
                    onChange={(e) => setMeta({ ...meta, charter: e.target.value })}
                    placeholder="Your name"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
                <CardRow
                  label="Illustrator"
                  last
                  side={
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                        Difficulty
                      </label>
                      <SegmentedControl
                        value={difficulty}
                        options={[
                          { value: "EZ", label: "EZ" },
                          { value: "HD", label: "HD" },
                          { value: "IN", label: "IN" },
                          { value: "AT", label: "AT" },
                        ]}
                        onChange={setDifficulty}
                      />
                      <div className="flex items-center" style={{ gap: 6, marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Lv.</span>
                        <input
                          type="number"
                          value={levelNumber}
                          onChange={(e) => setLevelNumber(parseInt(e.target.value) || 0)}
                          style={{
                            ...INPUT_STYLE,
                            width: 50,
                            textAlign: "center",
                            padding: "5px 8px",
                          }}
                          onFocus={focusInput}
                          onBlur={blurInput}
                        />
                      </div>
                    </div>
                  }
                >
                  <input
                    style={INPUT_STYLE}
                    value={meta.illustrator}
                    onChange={(e) => setMeta({ ...meta, illustrator: e.target.value })}
                    placeholder="Artist name"
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </CardRow>
              </div>
            </div>

            {/* TIMING SECTION */}
            <div>
              <SectionHeader>Timing</SectionHeader>
              <div style={{ backgroundColor: "var(--bg-active)", borderRadius: 10, overflow: "hidden" }}>
                <div
                  className="flex items-center justify-between"
                  style={{ padding: "12px 14px" }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)" }}>Initial BPM</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                      You can add BPM changes later in the editor
                    </div>
                  </div>
                  <input
                    type="number"
                    value={initialBpm}
                    onChange={(e) => setInitialBpm(parseFloat(e.target.value) || 120)}
                    style={{
                      ...INPUT_STYLE,
                      width: 70,
                      textAlign: "center",
                      padding: "6px 8px",
                    }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#ff6b6b",
                  backgroundColor: "rgba(255,70,70,0.1)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)" }}
          >
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Ctrl+N</span>
            <div className="flex" style={{ gap: 8 }}>
              <button
                style={{
                  padding: "7px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: "7px 20px",
                  borderRadius: 8,
                  fontSize: 12,
                  backgroundColor: creating ? "var(--bg-active)" : "var(--accent-primary)",
                  color: creating ? "var(--text-muted)" : "#fff",
                  cursor: creating ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  border: "none",
                  transition: "opacity 0.1s",
                }}
                disabled={creating}
                onMouseEnter={(e) => { if (!creating) (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onClick={handleCreate}
              >
                {creating ? "Creating..." : "Create chart"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

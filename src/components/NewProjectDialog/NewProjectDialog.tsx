import { useState, useRef } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useAudioStore } from "../../stores/audioStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTabStore } from "../../stores/tabStore";
import { audioEngine } from "../../audio/audioEngine";
import { isTauri, pickFile, createProject, loadProject } from "../../utils/ipc";
import { saveSession, registerSession, setSkipNextSave } from "../../utils/chartSessions";
import type { ProjectMeta, PhichainChart } from "../../types/chart";

interface Props {
  open: boolean;
  onClose: () => void;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const illustrationInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const inputStyle = {
    backgroundColor: "var(--bg-active)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
  };

  const handlePickMusic = async () => {
    if (isTauri()) {
      // Use Tauri file picker
      const path = await pickFile([
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] },
      ]);
      if (path) {
        setMusicPath(path);
        setMusicFile(null);
        setError(null);
      }
    } else {
      // Browser fallback — use file input
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

  const hasMusic = musicFile !== null || musicPath !== null;
  const musicName = musicFile?.name ?? musicPath?.split(/[\\/]/).pop() ?? null;
  const illustrationName = illustrationFile?.name ?? illustrationPath?.split(/[\\/]/).pop() ?? null;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

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
        // Save under the last chart tab if we're not on a chart tab
        saveSession(currentChartTabs[currentChartTabs.length - 1].id);
      }

      // Tell the session manager to skip the automatic save on tab switch
      // because we already saved the session above
      setSkipNextSave();

      if (isTauri() && musicPath) {
        // Tauri path: create project on disk, then load it
        const folderPath = musicPath.replace(/[\\/][^\\/]+$/, "") + "/" + (meta.name || "new-chart");
        await createProject(folderPath, meta, musicPath, illustrationPath ?? undefined);

        // Load the created project into the editor
        const projectData = await loadProject(folderPath);
        const cs = useChartStore.getState();
        cs.loadFromProjectData(projectData);

        // Load music from the project directory
        if (projectData.music_path) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const url = convertFileSrc(projectData.music_path);
          const ext = projectData.music_path.split(".").pop()?.toLowerCase() ?? "mp3";
          await audioEngine.load(url, ext);
          useAudioStore.getState().setMusicLoaded(true);
        }

        // Load illustration from the project directory
        if (projectData.illustration_path) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const illustUrl = convertFileSrc(projectData.illustration_path);
          await cs.loadIllustration(illustUrl);
        }

        // Select the first line
        useEditorStore.getState().selectLine(0);

        // Open chart tab and register session
        const tabId = `chart:${folderPath}`;
        useTabStore.getState().openChart(folderPath, meta.name || "Untitled Chart");
        registerSession(tabId);

        onClose();
        return;
      }

      if (musicFile) {
        // Browser/dev mode: load audio from file
        const objectUrl = URL.createObjectURL(musicFile);
        const ext = musicFile.name.split(".").pop()?.toLowerCase() ?? "mp3";
        await audioEngine.load(objectUrl, ext);
        useAudioStore.getState().setMusicLoaded(true);
        musicUrl = objectUrl;
      }

      // Load illustration from file (browser mode)
      let illustrationUrl: string | null = null;
      if (illustrationFile) {
        illustrationUrl = URL.createObjectURL(illustrationFile);
      }

      // Create a default chart with one line
      const defaultChart: PhichainChart = {
        format: 1,
        offset: 0,
        bpm_list: [{ beat: [0, 0, 1], bpm: 120 }],
        lines: [
          {
            name: "Line 1",
            notes: [],
            events: [
              {
                kind: "x",
                start_beat: [0, 0, 1],
                end_beat: [1000, 0, 1],
                value: { constant: 0 },
              },
              {
                kind: "y",
                start_beat: [0, 0, 1],
                end_beat: [1000, 0, 1],
                value: { constant: 0 },
              },
              {
                kind: "rotation",
                start_beat: [0, 0, 1],
                end_beat: [1000, 0, 1],
                value: { constant: 0 },
              },
              {
                kind: "opacity",
                start_beat: [0, 0, 1],
                end_beat: [1000, 0, 1],
                value: { constant: 255 },
              },
              {
                kind: "speed",
                start_beat: [0, 0, 1],
                end_beat: [1000, 0, 1],
                value: { constant: 1 },
              },
            ],
            children: [],
            curve_note_tracks: [],
          },
        ],
      };

      // Load into chart store
      const cs = useChartStore.getState();
      cs.loadFromProjectData({
        chart_json: JSON.stringify(defaultChart),
        meta,
        project_path: "in-memory",
        music_path: musicUrl ?? "",
        illustration_path: null,
      });

      // Load illustration into chart store (browser mode)
      if (illustrationUrl) {
        await cs.loadIllustration(illustrationUrl);
      }

      // Select the first line
      useEditorStore.getState().selectLine(0);

      // Open a chart tab and register session
      // Use a unique ID so multiple browser-mode charts don't collide
      const chartId = `browser-${Date.now()}`;
      const tabId = `chart:${chartId}`;
      useTabStore.getState().openChart(chartId, meta.name || "Untitled Chart");
      registerSession(tabId);

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-lg shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            New Chart
          </h2>
          <button
            className="text-sm px-1 rounded hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-4">
          {/* Music file selection */}
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>
              Music File (optional)
            </label>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded text-xs"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
                onClick={handlePickMusic}
              >
                Choose File
              </button>
              <span
                className="flex-1 truncate text-xs py-1.5"
                style={{ color: musicName ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {musicName ?? "No file selected"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Illustration file selection */}
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>
              Illustration (optional)
            </label>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded text-xs"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
                onClick={handlePickIllustration}
              >
                Choose File
              </button>
              <span
                className="flex-1 truncate text-xs py-1.5"
                style={{ color: illustrationName ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {illustrationName ?? "No file selected"}
              </span>
            </div>
            <input
              ref={illustrationInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleIllustrationFileInput}
            />
          </div>

          {/* Metadata fields */}
          <label className="text-xs flex flex-col gap-1">
            <span style={{ color: "var(--text-muted)" }}>Song Name</span>
            <input
              className="px-2 py-1.5 rounded text-xs"
              style={inputStyle}
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              placeholder="My Song"
            />
          </label>

          <label className="text-xs flex flex-col gap-1">
            <span style={{ color: "var(--text-muted)" }}>Composer</span>
            <input
              className="px-2 py-1.5 rounded text-xs"
              style={inputStyle}
              value={meta.composer}
              onChange={(e) => setMeta({ ...meta, composer: e.target.value })}
              placeholder="Artist name"
            />
          </label>

          <label className="text-xs flex flex-col gap-1">
            <span style={{ color: "var(--text-muted)" }}>Charter</span>
            <input
              className="px-2 py-1.5 rounded text-xs"
              style={inputStyle}
              value={meta.charter}
              onChange={(e) => setMeta({ ...meta, charter: e.target.value })}
              placeholder="Your name"
            />
          </label>

          <div className="flex gap-3">
            <label className="text-xs flex flex-col gap-1 flex-1">
              <span style={{ color: "var(--text-muted)" }}>Illustrator</span>
              <input
                className="px-2 py-1.5 rounded text-xs"
                style={inputStyle}
                value={meta.illustrator}
                onChange={(e) => setMeta({ ...meta, illustrator: e.target.value })}
                placeholder="Artist"
              />
            </label>
            <label className="text-xs flex flex-col gap-1 w-24">
              <span style={{ color: "var(--text-muted)" }}>Level</span>
              <input
                className="px-2 py-1.5 rounded text-xs"
                style={inputStyle}
                value={meta.level}
                onChange={(e) => setMeta({ ...meta, level: e.target.value })}
                placeholder="IN Lv.15"
              />
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs px-2 py-1 rounded" style={{ color: "#ff6b6b", backgroundColor: "rgba(255,70,70,0.1)" }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            className="px-4 py-1.5 rounded text-xs hover:bg-white/10"
            style={{ color: "var(--text-secondary)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 rounded text-xs"
            style={{
              backgroundColor: creating ? "var(--bg-active)" : "var(--accent-primary)",
              color: creating ? "var(--text-muted)" : "white",
              cursor: creating ? "not-allowed" : "pointer",
            }}
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? "Creating..." : "Create Chart"}
          </button>
        </div>
      </div>
    </div>
  );
}

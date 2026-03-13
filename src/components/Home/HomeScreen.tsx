// ============================================================
// Home Screen — Linear/Figma style
//
// Two-column layout: main content (welcome, action cards,
// recent projects) + right sidebar (quick reference).
// ============================================================

import { useState } from "react";
import { useRecentProjectsStore } from "../../stores/recentProjectsStore";
import type { RecentProject } from "../../stores/recentProjectsStore";
import { loadStoredProject } from "../../utils/projectStorage";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTabStore } from "../../stores/tabStore";
import { useAudioStore } from "../../stores/audioStore";
import { audioEngine } from "../../audio/audioEngine";
import { useToastStore } from "../../stores/toastStore";
import { EditorGuideModal } from "./EditorGuideModal";

interface HomeScreenProps {
  onNewChart: () => void;
  onImportChart: () => void;
}

// ── Note type colors (match the mockup + game) ──
const NOTE_TYPES = [
  { label: "Tap", color: "#48b5ff", key: "Q" },
  { label: "Drag", color: "#ffd24a", key: "W" },
  { label: "Flick", color: "#ff4a6a", key: "E" },
  { label: "Hold", color: "#4aff7a", key: "R" },
];

const SHORTCUTS = [
  { label: "Play / Pause", key: "Space" },
  { label: "Undo", key: "Ctrl+Z" },
  { label: "Redo", key: "Ctrl+Shift+Z" },
  { label: "Select tool", key: "V" },
  { label: "Eraser", key: "X" },
  { label: "Flip above/below", key: "F" },
  { label: "Delete selected", key: "Del" },
];

const TIPS = [
  "Set speed to 0 before a drop for dramatic freezes, then snap it back up.",
  "Use F to flip notes below the line for more complex patterns.",
  "Set opacity to 0 for invisible lines — a staple of hard charts.",
];

// ── Thumbnail gradient palette ──
const GRADIENTS = [
  "linear-gradient(135deg, #48b5ff33, #ff4a6a33)",
  "linear-gradient(135deg, #4aff7a33, #ffd24a33)",
  "linear-gradient(135deg, #6c8aff33, #cc5de833)",
  "linear-gradient(135deg, #ff4a6a33, #ffd24a33)",
  "linear-gradient(135deg, #48b5ff33, #4aff7a33)",
];

function getGradient(index: number) {
  return GRADIENTS[index % GRADIENTS.length];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Kbd badge component ──
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "1px 5px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        color: "var(--text-muted)",
        backgroundColor: "var(--bg-active)",
      }}
    >
      {children}
    </span>
  );
}

async function handleOpenRecent(project: RecentProject) {
  try {
    const stored = await loadStoredProject(project.id);
    if (!stored) {
      useToastStore.getState().addToast({
        message: "Project data not found. It may have been cleared.",
        type: "error",
      });
      useRecentProjectsStore.getState().removeOne(project.timestamp);
      return;
    }

    const cs = useChartStore.getState();
    cs.loadFromProjectData({
      chart_json: stored.chartJson,
      meta: stored.meta,
      project_path: "",
      music_path: null,
      illustration_path: null,
    });

    if (stored.audioBlob && stored.audioExt) {
      const blob = new Blob([stored.audioBlob]);
      const url = URL.createObjectURL(blob);
      await audioEngine.load(url, stored.audioExt);
      useAudioStore.getState().setMusicLoaded(true);
    }

    useEditorStore.getState().selectLine(0);
    useTabStore.getState().openChart("recent-" + project.id, project.name || "Untitled");
  } catch (err) {
    console.error("Failed to open recent project:", err);
    useToastStore.getState().addToast({
      message: "Failed to open project. See console for details.",
      type: "error",
    });
  }
}

export function HomeScreen({ onNewChart, onImportChart }: HomeScreenProps) {
  const [showGuide, setShowGuide] = useState(false);
  const projects = useRecentProjectsStore((s) => s.projects);
  const clearAll = useRecentProjectsStore((s) => s.clearAll);

  return (
    <div
      className="h-full"
      style={{ backgroundColor: "var(--bg-primary)", display: "flex" }}
    >
      {/* ── Left: Main content ── */}
      <div
        style={{
          flex: 1,
          padding: "32px 40px",
          maxWidth: 640,
          overflowY: "auto",
        }}
      >
        {/* Welcome */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            Welcome back
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Create a new chart or pick up where you left off.
          </div>
        </div>

        {/* Action cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <ActionCard
            icon="📄"
            title="New chart"
            description="Start from scratch with a blank project"
            shortcut="Ctrl+N"
            onClick={onNewChart}
          />
          <ActionCard
            icon="📥"
            title="Import chart"
            description="Open an RPE .json, .zip, or .pez file"
            shortcut="Ctrl+O"
            onClick={onImportChart}
          />
        </div>

        {/* Recent projects */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--text-muted)",
              }}
            >
              Recent projects
            </span>
            {projects.length > 0 && (
              <button
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: 0,
                  transition: "color 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-muted)";
                }}
                onClick={clearAll}
              >
                Clear all
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
              }}
            >
              No recent projects
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                overflow: "hidden",
              }}
            >
              {projects.map((project, i) => (
                <div
                  key={project.id}
                  onClick={() => handleOpenRecent(project)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    cursor: "pointer",
                    transition: "background 0.1s",
                    borderBottom:
                      i < projects.length - 1
                        ? "1px solid rgba(42, 42, 53, 0.33)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--bg-active)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: getGradient(i),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    🎵
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {project.name || "Untitled"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 1,
                      }}
                    >
                      {project.composer || "Unknown"}
                      {project.level ? ` · ${project.level}` : ""}
                      {project.lineCount
                        ? ` · ${project.lineCount} lines`
                        : ""}
                      {project.noteCount
                        ? ` · ${project.noteCount.toLocaleString()} notes`
                        : ""}
                    </div>
                  </div>
                  {/* Time */}
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {timeAgo(project.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Quick Reference sidebar ── */}
      <div
        style={{
          width: 260,
          borderLeft: "1px solid var(--border-color)",
          padding: "24px 20px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-muted)",
            marginBottom: 14,
          }}
        >
          Quick reference
        </div>

        {/* Note types */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Note types
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 5 }}
          >
            {NOTE_TYPES.map((nt) => (
              <div
                key={nt.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: nt.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text-primary)" }}>
                  {nt.label}
                </span>
                <span style={{ flex: 1 }} />
                <Kbd>{nt.key}</Kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Essential shortcuts */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Essential shortcuts
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 5 }}
          >
            {SHORTCUTS.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>
                  {s.label}
                </span>
                <Kbd>{s.key}</Kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Tips
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.55,
            }}
          >
            {TIPS.map((tip, i) => (
              <p key={i} style={{ marginBottom: i < TIPS.length - 1 ? 6 : 0 }}>
                {tip}
              </p>
            ))}
          </div>
          <button
            style={{
              marginTop: 12,
              padding: "8px 12px",
              backgroundColor: "var(--bg-active)",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "center",
              fontSize: 11,
              color: "var(--accent-primary)",
              border: "none",
              width: "100%",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "rgba(108, 138, 255, 0.1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "var(--bg-active)";
            }}
            onClick={() => setShowGuide(true)}
          >
            View full editor guide →
          </button>
        </div>
      </div>

      <EditorGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}

// ── Action Card sub-component ──
function ActionCard({
  icon,
  title,
  description,
  shortcut,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <button
      style={{
        borderRadius: 10,
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        textAlign: "left",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(108, 138, 255, 0.33)";
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "rgba(108, 138, 255, 0.03)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-color)";
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "var(--bg-tertiary)";
      }}
      onClick={onClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {description}
      </div>
      <div style={{ marginTop: 2 }}>
        <Kbd>{shortcut}</Kbd>
      </div>
    </button>
  );
}

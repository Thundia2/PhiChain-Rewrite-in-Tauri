import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { useToastStore } from "../../stores/toastStore";
import { ToggleSwitch } from "../Settings/ToggleSwitch";

type Category = "general" | "audio" | "game-preview" | "timeline" | "editor" | "resource-pack" | "notifications";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "general", label: "General" },
  { id: "audio", label: "Audio" },
  { id: "game-preview", label: "Game Preview" },
  { id: "timeline", label: "Timeline" },
  { id: "editor", label: "Editor" },
  { id: "resource-pack", label: "Resource Pack" },
  { id: "notifications", label: "Notifications" },
];

/* ── Reusable sub-components ── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "var(--bg-active)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function CardRow({
  label,
  description,
  children,
  last = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "12px 14px",
        borderBottom: last ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div className="flex-shrink-0 ml-3">{children}</div>
    </div>
  );
}

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

function Select({
  value,
  onChange,
  children,
}: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "4px 8px",
        borderRadius: 5,
        fontSize: 11,
        border: "0.5px solid var(--border-color)",
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-primary)",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </select>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24"
        style={{ accentColor: "var(--accent-primary)" }}
      />
      <span style={{ fontSize: 11, width: 36, textAlign: "right", color: "var(--text-secondary)" }}>
        {format ? format(value) : value}
      </span>
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
        gap: 2,
        backgroundColor: "var(--bg-secondary)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          style={{
            padding: "3px 10px",
            borderRadius: 5,
            fontSize: 10,
            border: "none",
            cursor: "pointer",
            backgroundColor: value === opt.value ? "var(--accent-primary)" : "transparent",
            color: value === opt.value ? "#fff" : "var(--text-secondary)",
            transition: "all 0.12s",
          }}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Category content renderers ── */

function GeneralContent() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;
  return (
    <div>
      <SectionHeader>Interface</SectionHeader>
      <Card>
        <CardRow label="Language">
          <Select value={settings.language} onChange={(v) => update({ language: v })}>
            <option value="en">English</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
          </Select>
        </CardRow>
        <CardRow label="Default editor view" last>
          <SegmentedControl
            value={settings.defaultEditorView}
            options={[
              { value: "unified", label: "Unified" },
              { value: "classic", label: "Classic" },
            ]}
            onChange={(v) => update({ defaultEditorView: v as "unified" | "classic" })}
          />
        </CardRow>
      </Card>
    </div>
  );
}

function AudioContent() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;
  return (
    <div>
      <SectionHeader>Playback</SectionHeader>
      <Card>
        <CardRow label="Music volume">
          <Slider
            value={settings.musicVolume}
            min={0} max={1} step={0.05}
            onChange={(v) => update({ musicVolume: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </CardRow>
        <CardRow label="Hit sound volume">
          <Slider
            value={settings.hitSoundVolume}
            min={0} max={1} step={0.05}
            onChange={(v) => update({ hitSoundVolume: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </CardRow>
        <CardRow label="Enable hit sounds" description="Play sounds when notes are hit" last>
          <ToggleSwitch
            checked={settings.hitSoundEnabled}
            onChange={(v) => update({ hitSoundEnabled: v })}
          />
        </CardRow>
      </Card>
    </div>
  );
}

function GamePreviewContent() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;
  return (
    <div>
      <SectionHeader>Visuals</SectionHeader>
      <Card>
        <CardRow label="Hit animations" description="Particle effects when notes are hit">
          <ToggleSwitch
            checked={settings.showHitEffects}
            onChange={(v) => update({ showHitEffects: v })}
          />
        </CardRow>
        <CardRow label="Note size">
          <Slider
            value={settings.noteSize}
            min={0.5} max={2} step={0.1}
            onChange={(v) => update({ noteSize: v })}
            format={(v) => `${v.toFixed(1)}x`}
          />
        </CardRow>
        <CardRow label="Background dim">
          <Slider
            value={settings.backgroundDim}
            min={0} max={1} step={0.05}
            onChange={(v) => update({ backgroundDim: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </CardRow>
        <CardRow label="FC/AP indicator" description="Full combo and all perfect indicators">
          <ToggleSwitch
            checked={settings.showFcApIndicator}
            onChange={(v) => update({ showFcApIndicator: v })}
          />
        </CardRow>
        <CardRow label="Multi highlight" description="Highlight notes on the same beat">
          <ToggleSwitch
            checked={settings.multiHighlight}
            onChange={(v) => update({ multiHighlight: v })}
          />
        </CardRow>
        <CardRow label="Show HUD" description="Combo, score, and chart info during playback">
          <ToggleSwitch
            checked={settings.showHud}
            onChange={(v) => update({ showHud: v })}
          />
        </CardRow>
        <CardRow label="Anchor markers" description="Circles at judgment line origins" last>
          <Select
            value={settings.anchorMarkerVisibility}
            onChange={(v) => update({ anchorMarkerVisibility: v as "never" | "always" | "when_visible" })}
          >
            <option value="never">Never</option>
            <option value="always">Always</option>
            <option value="when_visible">When Visible</option>
          </Select>
        </CardRow>
      </Card>
    </div>
  );
}

function TimelineContent() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;
  return (
    <div>
      <SectionHeader>Behavior</SectionHeader>
      <Card>
        <CardRow label="Invert scroll direction" description="Reverse timeline scroll">
          <ToggleSwitch
            checked={settings.invertScrollDirection}
            onChange={(v) => update({ invertScrollDirection: v })}
          />
        </CardRow>
        <CardRow label="Follow playback" description="Auto-scroll to keep current time in view" last>
          <ToggleSwitch
            checked={settings.timelineFollowPlayback}
            onChange={(v) => update({ timelineFollowPlayback: v })}
          />
        </CardRow>
      </Card>
    </div>
  );
}

function EditorContent() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionHeader>Event Editor</SectionHeader>
        <Card>
          <CardRow label="Rotation snap angle" description="Snap to fixed intervals (0 = off)" last>
            <Select
              value={settings.rotationSnapDegrees}
              onChange={(v) => update({ rotationSnapDegrees: parseInt(v) })}
            >
              <option value={0}>Off</option>
              <option value={5}>5°</option>
              <option value={10}>10°</option>
              <option value={15}>15°</option>
              <option value={30}>30°</option>
              <option value={45}>45°</option>
              <option value={90}>90°</option>
            </Select>
          </CardRow>
        </Card>
      </div>
      <div>
        <SectionHeader>Autosave</SectionHeader>
        <Card>
          <CardRow label="Enable autosave">
            <ToggleSwitch
              checked={settings.autosaveEnabled}
              onChange={(v) => update({ autosaveEnabled: v })}
            />
          </CardRow>
          <CardRow label="Save interval" last>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={settings.autosaveIntervalSeconds}
                min={10}
                max={3600}
                onChange={(e) =>
                  update({ autosaveIntervalSeconds: Math.max(10, parseInt(e.target.value) || 120) })
                }
                style={{
                  width: 50,
                  padding: "3px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "0.5px solid var(--border-color)",
                  textAlign: "right",
                }}
              />
              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>sec</span>
            </div>
          </CardRow>
        </Card>
      </div>
    </div>
  );
}

function ResourcePackContent() {
  const respacks = useRespackStore((s) => s.respacks);
  const selectedId = useRespackStore((s) => s.selectedId);
  const selectRespack = useRespackStore((s) => s.selectRespack);
  const importRespack = useRespackStore((s) => s.importRespack);
  const deleteRespack = useRespackStore((s) => s.deleteRespack);

  const activeRespack = selectedId ? respacks.get(selectedId) ?? null : null;
  const respackList = Array.from(respacks.values());

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        await importRespack(arrayBuffer);
      } catch (err) {
        console.error("Respack import failed:", err);
        const { useToastStore } = await import("../../stores/toastStore");
        useToastStore.getState().addToast({ message: "Failed to import respack. Check the console for details.", type: "error" });
      }
    };
    input.click();
  };

  const handleDelete = async (id: string, name: string) => {
    const { showConfirm } = await import("../common/ConfirmDialog");
    if (await showConfirm(`Delete respack "${name}"?`)) {
      deleteRespack(id);
    }
  };

  return (
    <div>
      <SectionHeader>Resource Pack</SectionHeader>
      <Card>
        <CardRow label="Active respack" description="Note textures and hit effects" last>
          <Select
            value={selectedId ?? ""}
            onChange={(v) => selectRespack(v || null)}
          >
            <option value="">Default (Colored)</option>
            {respackList.map((rp) => (
              <option key={rp.id} value={rp.id}>{rp.config.name}</option>
            ))}
          </Select>
        </CardRow>
      </Card>

      {activeRespack && (
        <div style={{ padding: "8px 2px", fontSize: 11, color: "var(--text-muted)" }}>
          {activeRespack.config.author && <div>by {activeRespack.config.author}</div>}
          {activeRespack.config.description && <div>{activeRespack.config.description}</div>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 11,
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            transition: "opacity 0.12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          onClick={handleImport}
        >
          Import Respack
        </button>

        {activeRespack && (
          <button
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 11,
              color: "#ff4060",
              border: "1px solid #ff4060",
              backgroundColor: "transparent",
              cursor: "pointer",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onClick={() => handleDelete(activeRespack.id, activeRespack.config.name)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

const TOAST_TYPE_COLORS: Record<"error" | "info" | "success", string> = {
  error: "#ff4a6a",
  info: "#6c8aff",
  success: "#4aff7a",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function NotificationsContent() {
  const history = useToastStore((s) => s.history);
  const clearHistory = useToastStore((s) => s.clearHistory);
  const reversed = [...history].reverse();

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <SectionHeader>Notification History</SectionHeader>
        {history.length > 0 && (
          <button
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 11,
              color: "#ff4060",
              border: "1px solid #ff4060",
              backgroundColor: "transparent",
              cursor: "pointer",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onClick={clearHistory}
          >
            Clear History
          </button>
        )}
      </div>

      {reversed.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "32px 0",
          color: "var(--text-muted)",
          fontSize: 12,
        }}>
          No notifications yet
        </div>
      ) : (
        <Card>
          {reversed.map((entry, i) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 14px",
                borderBottom: i === reversed.length - 1 ? "none" : "1px solid rgba(42, 42, 53, 0.55)",
              }}
            >
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: TOAST_TYPE_COLORS[entry.type],
                flexShrink: 0,
                marginTop: 4,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: "1.45" }}>
                  {entry.message}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ── Main Modal Component ── */

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<Category>("general");

  if (!open) return null;

  const renderContent = () => {
    switch (activeCategory) {
      case "general":
        return <GeneralContent />;
      case "audio":
        return <AudioContent />;
      case "game-preview":
        return <GamePreviewContent />;
      case "timeline":
        return <TimelineContent />;
      case "editor":
        return <EditorContent />;
      case "resource-pack":
        return <ResourcePackContent />;
      case "notifications":
        return <NotificationsContent />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.5)",
        animation: "settingsFadeIn 0.2s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <style>{`
        @keyframes settingsFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes settingsSlideIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="flex flex-col"
        style={{
          width: 560,
          maxHeight: "80vh",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          overflow: "hidden",
          animation: "settingsSlideIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <span style={{ fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>
            Settings
          </span>
          <button
            className="flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: "var(--bg-active)",
              color: "var(--text-muted)",
              fontSize: 14,
              cursor: "pointer",
              border: "none",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div
            className="flex flex-col flex-shrink-0"
            style={{
              width: 140,
              padding: 8,
              borderRight: "1px solid var(--border-color)",
              gap: 1,
            }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  className="flex items-center transition-colors"
                  style={{
                    padding: "7px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    border: "none",
                    textAlign: "left",
                    backgroundColor: isActive ? "rgba(108, 138, 255, 0.18)" : "transparent",
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }
                  }}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ padding: "16px 20px" }}
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

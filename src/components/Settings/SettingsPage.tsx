import { useSettingsStore } from "../../stores/settingsStore";
import { useRespackStore } from "../../stores/respackStore";
import { ToggleSwitch } from "./ToggleSwitch";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3 pb-1"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}
      >
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs" style={{ color: "var(--text-primary)" }}>{label}</div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
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
      <span className="text-xs w-10 text-right" style={{ color: "var(--text-secondary)" }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

function RespackSection() {
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
        alert("Failed to import respack. Check the console for details.");
      }
    };
    input.click();
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete respack "${name}"?`)) {
      deleteRespack(id);
    }
  };

  return (
    <Section title="Resource Pack">
      <SettingRow label="Active Respack" description="Note textures and hit effects for the preview">
        <select
          className="px-2 py-1 rounded text-xs"
          style={{
            backgroundColor: "var(--bg-active)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
          }}
          value={selectedId ?? ""}
          onChange={(e) => selectRespack(e.target.value || null)}
        >
          <option value="">Default (Colored)</option>
          {respackList.map((rp) => (
            <option key={rp.id} value={rp.id}>{rp.config.name}</option>
          ))}
        </select>
      </SettingRow>

      {activeRespack && (
        <div className="text-xs px-1" style={{ color: "var(--text-muted)" }}>
          {activeRespack.config.author && <div>by {activeRespack.config.author}</div>}
          {activeRespack.config.description && <div>{activeRespack.config.description}</div>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded text-xs transition-colors hover:opacity-80"
          style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
          onClick={handleImport}
        >
          Import Respack
        </button>

        {activeRespack && (
          <button
            className="px-3 py-1.5 rounded text-xs transition-colors hover:opacity-80"
            style={{ color: "#ff4060", border: "1px solid #ff4060" }}
            onClick={() => handleDelete(activeRespack.id, activeRespack.config.name)}
          >
            Delete
          </button>
        )}
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useSettingsStore();
  const update = settings.updateSettings;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-lg mx-auto py-8 px-6">
        <h2
          className="text-base font-semibold mb-6"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h2>

        <Section title="General">
          <SettingRow label="Language">
            <select
              className="px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
              value={settings.language}
              onChange={(e) => update({ language: e.target.value })}
            >
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
          </SettingRow>
        </Section>

        <Section title="Audio">
          <SettingRow label="Music Volume">
            <Slider
              value={settings.musicVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ musicVolume: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </SettingRow>
          <SettingRow label="Hit Sound Volume">
            <Slider
              value={settings.hitSoundVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ hitSoundVolume: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </SettingRow>
        </Section>

        <Section title="Game Preview">
          <SettingRow label="Note Size">
            <Slider
              value={settings.noteSize}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => update({ noteSize: v })}
              format={(v) => `${v.toFixed(1)}x`}
            />
          </SettingRow>
          <SettingRow label="Background Dim">
            <Slider
              value={settings.backgroundDim}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ backgroundDim: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </SettingRow>
          <SettingRow label="Show FC/AP Indicator" description="Display full combo and all perfect indicators">
            <ToggleSwitch
              checked={settings.showFcApIndicator}
              onChange={(v) => update({ showFcApIndicator: v })}
            />
          </SettingRow>
          <SettingRow label="Multi Highlight" description="Highlight notes sharing the same beat">
            <ToggleSwitch
              checked={settings.multiHighlight}
              onChange={(v) => update({ multiHighlight: v })}
            />
          </SettingRow>
          <SettingRow label="Show HUD" description="Display combo, score, and chart info during playback">
            <ToggleSwitch
              checked={settings.showHud}
              onChange={(v) => update({ showHud: v })}
            />
          </SettingRow>
          <SettingRow label="Anchor Markers" description="Show circles at judgment line origins">
            <select
              className="px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
              value={settings.anchorMarkerVisibility}
              onChange={(e) => update({ anchorMarkerVisibility: e.target.value as "never" | "always" | "when_visible" })}
            >
              <option value="never">Never</option>
              <option value="always">Always</option>
              <option value="when_visible">When Visible</option>
            </select>
          </SettingRow>
        </Section>

        <RespackSection />

        <Section title="Timeline">
          <SettingRow label="Invert Scroll Direction" description="Reverse the scroll direction in the timeline">
            <ToggleSwitch
              checked={settings.invertScrollDirection}
              onChange={(v) => update({ invertScrollDirection: v })}
            />
          </SettingRow>
          <SettingRow label="Follow Playback" description="Auto-scroll the timeline to keep the current time in view during playback">
            <ToggleSwitch
              checked={settings.timelineFollowPlayback}
              onChange={(v) => update({ timelineFollowPlayback: v })}
            />
          </SettingRow>
        </Section>

        <Section title="Editor">
          <SettingRow label="Default Editor View" description="Which view to use when opening a chart">
            <select
              className="px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
              value={settings.defaultEditorView}
              onChange={(e) => update({ defaultEditorView: e.target.value as "unified" | "classic" })}
            >
              <option value="unified">Unified Editor</option>
              <option value="classic">Classic View</option>
            </select>
          </SettingRow>
        </Section>

        <Section title="Event Editor">
          <SettingRow label="Rotation Snap Angle" description="Snap rotation to fixed angle intervals (0 = off)">
            <select
              className="px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
              value={settings.rotationSnapDegrees}
              onChange={(e) => update({ rotationSnapDegrees: parseInt(e.target.value) })}
            >
              <option value={0}>Off</option>
              <option value={5}>5°</option>
              <option value={10}>10°</option>
              <option value={15}>15°</option>
              <option value={30}>30°</option>
              <option value={45}>45°</option>
              <option value={90}>90°</option>
            </select>
          </SettingRow>
        </Section>

        <Section title="Autosave">
          <SettingRow label="Enable Autosave">
            <ToggleSwitch
              checked={settings.autosaveEnabled}
              onChange={(v) => update({ autosaveEnabled: v })}
            />
          </SettingRow>
          <SettingRow label="Autosave Interval">
            <div className="flex items-center gap-1">
              <input
                type="number"
                className="w-16 px-2 py-1 rounded text-xs text-right"
                style={{
                  backgroundColor: "var(--bg-active)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                }}
                value={settings.autosaveIntervalSeconds}
                min={10}
                max={3600}
                onChange={(e) =>
                  update({ autosaveIntervalSeconds: Math.max(10, parseInt(e.target.value) || 120) })
                }
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>sec</span>
            </div>
          </SettingRow>
        </Section>
      </div>
    </div>
  );
}

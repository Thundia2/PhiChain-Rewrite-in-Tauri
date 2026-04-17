// ============================================================
// Editor Guide — Tab Content Components
//
// One component per guide tab. Each renders the content for
// its section of the interactive editor guide.
// ============================================================

import { Kbd, GCard, STitle, ColorDot } from "./guideComponents";
import {
  NOTE_TYPES, EVENT_TYPES, TOOLS, HOTKEYS, PANELS,
  SHADERS, PRESETS, FORMATS,
} from "./guideData";
import {
  CanvasCoordAnimation, AboveBelowAnimation, NoteFallingAnimation,
  EventTransitionAnimation, ConstantVsTransition, EasingExplorer,
} from "./guideAnimations";

// ---- Welcome ----

export function WelcomeTab() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent-primary)", letterSpacing: -0.5 }}>
          Welcome to PhiChain
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.6 }}>
          A chart editor for the rhythm game Phigros. Create charts with moving judgment lines,
          falling notes, and dramatic animations.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { icon: "\u2501", color: "#6c8aff", title: "Judgment Lines", desc: "Lines move, rotate, and fade across the screen. Notes fall toward them." },
          { icon: "\u266A", color: "#48b5ff", title: "Notes", desc: "4 note types (Tap, Drag, Flick, Hold) that players interact with." },
          { icon: "\u223F", color: "#51cf66", title: "Events", desc: "Animations that control line position, rotation, opacity, and speed over time." },
        ].map(c => (
          <GCard key={c.title} highlight={c.color + "33"}>
            <div style={{ fontSize: 22, color: c.color, textAlign: "center", marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.color, textAlign: "center" }}>{c.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
          </GCard>
        ))}
      </div>

      <GCard>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text-primary)" }}>Quick Start:</strong> Press <Kbd>Ctrl+N</Kbd> to create a new chart,
          or <Kbd>Ctrl+O</Kbd> to import an existing chart. Then use the toolbar to place notes
          and the keyframe bar to animate lines. Press <Kbd>Space</Kbd> to preview your work.
        </div>
      </GCard>

      <div style={{ textAlign: "center", marginTop: 16, color: "var(--text-muted)", fontSize: 10 }}>
        Navigate the tabs on the left to learn each concept, or click <strong>Next</strong> below.
      </div>
    </div>
  );
}

// ---- Canvas ----

export function CanvasTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Coordinate System</STitle>
      <GCard>
        <CanvasCoordAnimation active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
          The canvas is <strong style={{ color: "var(--text-primary)" }}>1350 x 900</strong> units.
          Origin (0, 0) is at the center. X ranges from <span style={{ color: "#ff6b6b" }}>-675</span> to <span style={{ color: "#51cf66" }}>+675</span>,
          Y from <span style={{ color: "#ff6b6b" }}>-450</span> to <span style={{ color: "#51cf66" }}>+450</span>.
        </div>
      </GCard>

      <STitle>Above & Below</STitle>
      <GCard>
        <AboveBelowAnimation active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
          Notes can fall from <strong style={{ color: "var(--text-primary)" }}>above</strong> or
          rise from <strong style={{ color: "var(--text-primary)" }}>below</strong> the judgment line.
          Press <Kbd>F</Kbd> to flip selected notes between sides.
        </div>
      </GCard>

      <STitle>Beat System</STitle>
      <GCard>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Time is measured in <strong style={{ color: "var(--text-primary)" }}>beats</strong>, stored as{" "}
          <code style={{ color: "var(--accent-primary)" }}>[whole, numerator, denominator]</code> tuples.
          <br />
          Example: <code style={{ color: "#ffd43b" }}>[2, 3, 4]</code> = beat 2 + 3/4 = <strong>2.75</strong>.
          <br />
          The <strong style={{ color: "var(--text-primary)" }}>density</strong> setting (1-32) controls how finely
          the beat grid subdivides. Density 4 = quarter-beat snapping.
        </div>
      </GCard>
    </div>
  );
}

// ---- Notes ----

export function NotesTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Note Types</STitle>
      <GCard style={{ marginBottom: 10 }}>
        <NoteFallingAnimation active={active} />
      </GCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {NOTE_TYPES.map(n => (
          <GCard key={n.kind} highlight={n.color + "44"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20, color: n.color }}>{n.icon}</span>
              <div>
                <span style={{ fontWeight: 700, fontSize: 12, color: n.color, textTransform: "uppercase" }}>{n.kind}</span>
                <span style={{ marginLeft: 6 }}><Kbd>{n.shortcut}</Kbd></span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>{n.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Key Note Properties</STitle>
      <GCard>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "3px 10px", fontSize: 10, lineHeight: 1.7 }}>
          {[
            ["beat", "When to hit \u2014 stored as [whole, num, denom]"],
            ["x", "Position on the line (-675 to +675)"],
            ["above", "Falls from above (true) or below (false)"],
            ["speed", "Fall speed multiplier (default 1.0)"],
            ["hold_beat", "Duration for Hold notes"],
            ["fake", "Displays but doesn't count for combo"],
          ].map(([prop, desc]) => (
            <div key={prop} style={{ display: "contents" }}>
              <code style={{ color: "var(--accent-primary)", fontFamily: "monospace" }}>{prop}</code>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </GCard>
    </div>
  );
}

// ---- Events ----

export function EventsTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>How Events Work</STitle>
      <GCard style={{ marginBottom: 8 }}>
        <EventTransitionAnimation active={active} />
      </GCard>

      <STitle>Constant vs Transition</STitle>
      <GCard style={{ marginBottom: 8 }}>
        <ConstantVsTransition active={active} />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text-primary)" }}>Constant</strong> events hold a fixed value.{" "}
          <strong style={{ color: "var(--text-primary)" }}>Transition</strong> events smoothly interpolate
          from start to end using an easing curve.
        </div>
      </GCard>

      <STitle>Core Events (5)</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {EVENT_TYPES.filter(e => e.group === "core").map(ev => (
          <GCard key={ev.kind} highlight={ev.color + "33"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 28, borderRadius: 3, background: ev.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: ev.color, fontSize: 11 }}>{ev.label}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 8 }}>{ev.range}</span>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>{ev.desc}</div>
              </div>
            </div>
          </GCard>
        ))}
      </div>

      <STitle color="#ff922b">Extended RPE Events (6)</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {EVENT_TYPES.filter(e => e.group === "rpe").map(ev => (
          <GCard key={ev.kind} highlight={ev.color + "22"}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ColorDot color={ev.color} />
              <span style={{ fontWeight: 600, color: ev.color, fontSize: 10 }}>{ev.label}</span>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{ev.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Event Layers</STitle>
      <GCard>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          RPE charts support up to <strong style={{ color: "var(--text-primary)" }}>5 additive event layers</strong> per line.
          Values from all layers are summed for the final result. Layer selector: <strong>-1</strong> = flat (default), <strong>0-4</strong> = specific layer.
        </div>
      </GCard>
    </div>
  );
}

// ---- Easings ----

export function EasingsTab({ active }: { active: boolean }) {
  return (
    <div>
      <STitle>Easing Curve Explorer</STitle>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
        Easing curves control the acceleration of transitions. Click any curve below to see it animate.
        There are <strong style={{ color: "var(--text-primary)" }}>33 built-in curves</strong> across 11 families.
      </div>
      <EasingExplorer active={active} />
    </div>
  );
}

// ---- Tools ----

export function ToolsTab() {
  return (
    <div>
      <STitle>Editor Tools</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {TOOLS.map(t => (
          <GCard key={t.id} highlight={t.color + "33"}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, color: t.color,
                background: t.color + "15", border: `1px solid ${t.color}33`, flexShrink: 0,
              }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: t.color, fontSize: 11, textTransform: "capitalize" }}>
                  {t.id.replace(/_/g, " ").replace("place ", "")}
                </span>
                <span style={{ marginLeft: 6 }}><Kbd>{t.key}</Kbd></span>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>{t.desc}</div>
              </div>
            </div>
          </GCard>
        ))}
      </div>

      <STitle>Beat Sync Mode</STitle>
      <GCard highlight="#ffd43b33">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Kbd>T</Kbd>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            When <strong style={{ color: "#ffd43b" }}>Beat Sync</strong> is enabled, notes are placed at the current
            playhead beat instead of where you click vertically. Great for placing notes while playing.
          </div>
        </div>
      </GCard>

      <STitle>Typical Workflow</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: "8px 10px", marginTop: 4 }}>
        {[
          ["1", "Select a note tool (Q/W/E/R) or use the toolbar"],
          ["2", "Click on the timeline or canvas to place notes at beat positions"],
          ["3", "Use Select (V) to adjust, then animate lines with events in the keyframe bar"],
        ].map(([n, desc]) => (
          <div key={n} style={{ display: "contents" }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "var(--accent-primary)",
              color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center",
              justifyContent: "center",
            }}>{n}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, paddingTop: 2 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Panels ----

export function PanelsTab() {
  const tierConfig = [
    { tier: "always" as const, label: "Always Visible", color: "#4aff7a", desc: "Core panels that are always accessible." },
    { tier: "quick" as const, label: "Quick Access", color: "#ffd43b", desc: "Toggle with Alt+1/2/3 in the bottom drawer." },
    { tier: "on_demand" as const, label: "On Demand", color: "#888", desc: "Open via Command Palette (Ctrl+K) or menus." },
  ];

  return (
    <div>
      <STitle>Panel Tier System</STitle>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
        Panels are organized into 3 tiers based on how often you need them.
      </div>
      {tierConfig.map(tc => (
        <div key={tc.tier} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ColorDot color={tc.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: tc.color }}>{tc.label}</span>
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{tc.desc}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 16 }}>
            {PANELS.filter(p => p.tier === tc.tier).map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: 100 }}>{p.id}</span>
                <span style={{ color: "var(--text-secondary)" }}>{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Shortcuts ----

export function ShortcutsTab() {
  return (
    <div>
      <STitle>Keyboard Shortcuts</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
        {HOTKEYS.map(cat => (
          <div key={cat.cat}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, paddingBottom: 3, borderBottom: "1px solid var(--border-color)" }}>
              {cat.cat}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {cat.keys.map(k => (
                <div key={k.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, padding: "2px 0" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{k.action}</span>
                  <Kbd>{k.key}</Kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Advanced ----

export function AdvancedTab() {
  return (
    <div>
      <STitle>Record Mode</STitle>
      <GCard highlight="#4aff7a33">
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <Kbd>Alt+R</Kbd> -- Record X/Y/Rotation keyframes by moving lines during playback.
          Channels (X, Y, Rotation) are toggleable. Recorded keyframes can be simplified
          with the Ramer-Douglas-Peucker algorithm before committing as events.
        </div>
      </GCard>

      <STitle>Mark / Improvisation Mode</STitle>
      <GCard highlight="#da77f233">
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <Kbd>Shift+I</Kbd> -- Place colored bookmarks during playback by pressing Q/W/E/R (note types)
          or 1/2/3 (colored markers). Convert bookmarks to real notes afterwards.
          Built-in latency compensation (-40ms default).
        </div>
      </GCard>

      <STitle>Event Presets</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {PRESETS.map(p => (
          <GCard key={p.cat}>
            <div style={{ fontWeight: 600, fontSize: 10, color: "var(--accent-primary)", marginBottom: 3 }}>{p.cat}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5 }}>{p.items.join(", ")}</div>
          </GCard>
        ))}
      </div>

      <STitle>Shader Effects</STitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {SHADERS.map(s => (
          <GCard key={s.name}>
            <code style={{ fontSize: 9, color: "var(--accent-primary)" }}>{s.name}</code>
            <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{s.desc}</div>
          </GCard>
        ))}
      </div>

      <STitle>Import / Export Formats</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {FORMATS.map(f => (
          <GCard key={f.name}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 10, color: "var(--text-primary)" }}>{f.name}</span>
              <span style={{ fontSize: 8, color: "var(--accent-primary)", background: "var(--accent-primary)15", padding: "1px 6px", borderRadius: 3 }}>{f.dir}</span>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 2 }}>{f.desc}</div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

// ---- Tips ----

export function TipsTab() {
  const tips = [
    { color: "#48b5ff", title: "Start simple", desc: "Begin with one line at the center. Add notes first, then animate with events." },
    { color: "#ffd43b", title: "Use the grid", desc: "Set Density to match the song's rhythm (4 = quarter-beat, 8 = eighth-note, 16 = sixteenth)." },
    { color: "#4aff7a", title: "Preview often", desc: "Press Space to play. Use 0.5x speed for tricky sections. The game preview shows exactly what players see." },
    { color: "#ff4a6a", title: "Multiple lines", desc: "Real Phigros charts use many independently moving lines. Start with 2-3, then add more for complexity." },
    { color: "#cc5de8", title: "Undo is your friend", desc: "Ctrl+Z gives you 200 undo steps. Experiment freely!" },
    { color: "#4dabf7", title: "Speed events for drama", desc: "Set speed to 0 before a music drop (freeze notes), then snap back to 1 for impact." },
    { color: "#ff922b", title: "Invisible lines are powerful", desc: "Set opacity to 0 \u2014 notes still fall, but the line is invisible. Used in almost every hard chart." },
    { color: "#51cf66", title: "Command Palette", desc: "Press Ctrl+K to access any action instantly. Search for presets, generators, settings, and more." },
    { color: "#a9e34b", title: "Learn easing curves", desc: "The difference between a good and great chart is in the easing. ease_out gives smooth landings, ease_in_out gives gentle motion." },
    { color: "#6c8aff", title: "Happy charting!", desc: "Join the Phigros custom chart community, share your work, and play other people's charts for inspiration." },
  ];

  return (
    <div>
      <STitle>Tips & Best Practices</STitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tips.map((tip, i) => (
          <GCard key={i} style={{ borderLeft: `3px solid ${tip.color}`, paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: tip.color, marginBottom: 2 }}>{tip.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>{tip.desc}</div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Editor Guide Modal
//
// Full editor guide (all 12 sections from the original HomeScreen)
// displayed in a centered scrollable modal.
// ============================================================

import { useEffect, useRef } from "react";

interface EditorGuideModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Helper components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3
        className="text-sm font-bold mb-2 pb-1"
        style={{ color: "var(--accent-primary)", borderBottom: "1px solid var(--border-color)" }}
      >
        {title}
      </h3>
      <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h4>
      <div className="pl-2" style={{ borderLeft: "2px solid var(--border-color)" }}>
        {children}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="px-1 py-0.5 rounded text-[10px] font-mono mx-0.5 inline-block"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {children}
    </kbd>
  );
}

function ColorBadge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 mr-3 mb-1">
      <span
        className="inline-block w-3 h-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

const SHORTCUT_GROUPS = [
  {
    title: "Tools",
    shortcuts: [
      { key: "V", action: "Select" },
      { key: "Q", action: "Tap" },
      { key: "W", action: "Drag" },
      { key: "E", action: "Flick" },
      { key: "R", action: "Hold" },
      { key: "T", action: "Transition Event" },
      { key: "Y", action: "Constant Event" },
      { key: "X", action: "Eraser" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { key: "Ctrl+Z", action: "Undo" },
      { key: "Ctrl+Shift+Z", action: "Redo" },
      { key: "Ctrl+A", action: "Select All" },
      { key: "Del", action: "Delete Selected" },
      { key: "Ctrl+C", action: "Copy" },
      { key: "Ctrl+X", action: "Cut" },
      { key: "Ctrl+V", action: "Paste" },
      { key: "F", action: "Flip Above/Below" },
    ],
  },
  {
    title: "Movement",
    shortcuts: [
      { key: "\u2191", action: "Move Beat Forward" },
      { key: "\u2193", action: "Move Beat Backward" },
      { key: "\u2192", action: "Move X Right" },
      { key: "\u2190", action: "Move X Left" },
    ],
  },
  {
    title: "Playback & File",
    shortcuts: [
      { key: "Space", action: "Play / Pause" },
      { key: "Ctrl+S", action: "Save Project" },
      { key: "Ctrl+N", action: "New Chart" },
    ],
  },
];

export function EditorGuideModal({ open, onClose }: EditorGuideModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 100,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        style={{
          width: 720,
          maxWidth: "90vw",
          maxHeight: "80vh",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "guideScaleIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontWeight: 500,
              fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            Editor Guide
          </span>
          <button
            style={{
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 16,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              backgroundColor: "var(--bg-active)",
              border: "none",
              transition: "color 0.1s",
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

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* 1 Getting Started */}
          <Section title="1. Getting Started">
            <p className="mb-2">
              Phichain is a chart editor for the rhythm game <strong>Phigros</strong>.
              Charts consist of <strong>judgment lines</strong> that move, rotate, and
              fade, with <strong>notes</strong> falling toward them. Players tap, drag,
              flick, or hold notes as they reach the line.
            </p>
            <SubSection title="Creating a Chart">
              <p>
                Click <strong>New Chart</strong> or press <Kbd>Ctrl+N</Kbd>.
                Fill in the song name, composer, charter name, illustrator, and
                difficulty level. Optionally attach a music file (MP3/WAV/OGG).
                Click <strong>Create Chart</strong> to enter the editor.
              </p>
            </SubSection>
            <SubSection title="Importing an RPE Chart">
              <p>
                Go to <strong>File &gt; Import RPE Chart...</strong> to load a chart
                made in Re:PhiEdit (RPE format). The importer converts RPE note types,
                event layers, and easing curves into Phichain&rsquo;s native format.
              </p>
            </SubSection>
            <SubSection title="Saving &amp; Exporting">
              <p>
                Press <Kbd>Ctrl+S</Kbd> to save the project. Use{" "}
                <strong>Export &gt; Export as Official</strong> to produce a chart file
                compatible with the Phigros game format.
              </p>
            </SubSection>
          </Section>

          {/* 2 Editor Layout */}
          <Section title="2. Editor Layout">
            <p className="mb-2">
              The editor uses a <strong>tabbed interface</strong> (Home, Charts,
              Settings) with a <strong>resizable mosaic layout</strong> for panels.
              Drag panel edges to resize them. Close panels via their &times; button
              and reopen them from the <strong>View</strong> menu.
            </p>
            <SubSection title="Panels">
              <p className="mb-1"><strong>Timeline</strong> &mdash; The main editing area. Displays notes and events on a vertical beat grid.</p>
              <p className="mb-1"><strong>Preview</strong> &mdash; A live game preview showing exactly how the chart looks during gameplay.</p>
              <p className="mb-1"><strong>Line List</strong> &mdash; Lists all judgment lines. Click to select, use + Add / - Remove.</p>
              <p className="mb-1"><strong>Inspector</strong> &mdash; Properties of the selected line, note, or event.</p>
              <p className="mb-1"><strong>Toolbar</strong> &mdash; Quick-access buttons for all placement tools.</p>
              <p className="mb-1"><strong>Timeline Settings</strong> &mdash; Controls for Zoom, Density, Lanes, Side filter, and Spectrogram.</p>
              <p className="mb-1"><strong>BPM List</strong> &mdash; Manage tempo changes.</p>
              <p className="mb-1"><strong>Chart Settings</strong> &mdash; Edit the song offset.</p>
            </SubSection>
            <SubSection title="Quick Action Bar">
              <p>
                Located below the tab bar on chart tabs. Contains playback controls,
                speed multipliers (0.25x–1x), metronome toggle, seek slider, and time display.
              </p>
            </SubSection>
            <SubSection title="Status Bar">
              <p>
                At the bottom of the screen. Shows version, total note count, event count,
                selected items, and the active tool name.
              </p>
            </SubSection>
          </Section>

          {/* 3 Judgment Lines */}
          <Section title="3. Judgment Lines">
            <p className="mb-2">
              Judgment lines are the core building blocks. Every note belongs to a
              line, and every line has its own <strong>events</strong> that control
              where it appears, how it rotates, and how fast notes approach it.
            </p>
            <p className="mb-2">
              The Phigros coordinate system has its origin at the <strong>center of
              the screen</strong>. The canvas is <strong>1350 units wide</strong> and{" "}
              <strong>900 units tall</strong>:
            </p>
            <ul className="list-disc pl-5 mb-2 space-y-0.5">
              <li>X: <strong>-675</strong> (left) to <strong>+675</strong> (right)</li>
              <li>Y: <strong>-450</strong> (bottom) to <strong>+450</strong> (top)</li>
              <li>Rotation: <strong>degrees</strong>, counter-clockwise positive</li>
              <li>Opacity: <strong>0</strong> (invisible) to <strong>255</strong> (fully visible)</li>
            </ul>
          </Section>

          {/* 4 Line Events */}
          <Section title="4. Line Events (X, Y, R, O, S)">
            <p className="mb-3">
              Events animate a judgment line over time. Each event has a{" "}
              <strong>start beat</strong>, <strong>end beat</strong>, and a{" "}
              <strong>value</strong> that is either a <em>transition</em>{" "}
              (interpolated with easing) or a <em>constant</em> (fixed value).
            </p>

            <SubSection title="X — Horizontal Position (Red)">
              <p>Controls the horizontal position. 0 = center, ±675 = edges.</p>
            </SubSection>
            <SubSection title="Y — Vertical Position (Yellow)">
              <p>Controls the vertical position. 0 = center, ±450 = edges.</p>
            </SubSection>
            <SubSection title="R — Rotation (Green)">
              <p>Controls rotation in degrees. 0 = horizontal, 90 = vertical CCW, -90 = vertical CW.</p>
            </SubSection>
            <SubSection title="O — Opacity (Blue)">
              <p>Controls transparency. 255 = fully visible, 0 = invisible. Invisible lines are still playable.</p>
            </SubSection>
            <SubSection title="S — Speed (Purple)">
              <p>Controls note fall speed multiplier. 1.0 = normal, 0 = frozen, negative = notes move away.</p>
            </SubSection>

            <SubSection title="Transition vs. Constant">
              <p className="mb-1">
                <strong>Transition events</strong> (<Kbd>T</Kbd>) interpolate between start and end values with an easing curve.
              </p>
              <p>
                <strong>Constant events</strong> (<Kbd>Y</Kbd>) hold a fixed value for their duration.
              </p>
            </SubSection>
            <SubSection title="Easing Curves">
              <p>
                30+ easing presets: Linear, Sine, Quad, Cubic, Quart, Quint, Expo, Circ, Back, Elastic, Bounce — each with In, Out, InOut variants. Also supports custom bezier and step functions.
              </p>
            </SubSection>
          </Section>

          {/* 5 Note Types */}
          <Section title="5. Note Types">
            <p className="mb-2">
              Notes have a <strong>type</strong>, <strong>beat</strong>, <strong>X position</strong>,
              <strong> side</strong> (above/below), and <strong>speed</strong> multiplier.
            </p>
            <div className="mb-3">
              <ColorBadge color="#35b5ff" label="Tap" />
              <ColorBadge color="#f0d040" label="Drag" />
              <ColorBadge color="#ff4060" label="Flick" />
              <ColorBadge color="#35b5ff" label="Hold" />
              <ColorBadge color="#32cd32" label="Selected" />
            </div>
            <SubSection title="Tap (Q)">
              <p>Tap the screen precisely when the note crosses the line. Blue rectangle.</p>
            </SubSection>
            <SubSection title="Drag (W)">
              <p>Any touch works — no precise timing. Yellow/gold rectangle (thinner). Used in rapid streams.</p>
            </SubSection>
            <SubSection title="Flick (E)">
              <p>Swipe/flick upward when the note reaches the line. Red rectangle with arrow.</p>
            </SubSection>
            <SubSection title="Hold (R)">
              <p>Press and hold for the note's duration. Blue bar extending from head to tail.</p>
            </SubSection>
          </Section>

          {/* 6 Timeline Workflow */}
          <Section title="6. Timeline Workflow">
            <SubSection title="Placing Notes">
              <p>
                Select a tool (<Kbd>Q</Kbd> <Kbd>W</Kbd> <Kbd>E</Kbd> <Kbd>R</Kbd>) and click on the timeline grid.
                Notes snap to the nearest beat subdivision. A ghost preview follows your cursor.
              </p>
            </SubSection>
            <SubSection title="Selecting Notes">
              <p>
                Use Select tool (<Kbd>V</Kbd>), click to select, <Kbd>Ctrl</Kbd>+click to toggle,
                <Kbd>Ctrl+A</Kbd> to select all. Drag to draw a selection rectangle.
              </p>
            </SubSection>
            <SubSection title="Moving Notes">
              <p>Arrow keys nudge selected notes: <Kbd>↑</Kbd><Kbd>↓</Kbd> for time, <Kbd>←</Kbd><Kbd>→</Kbd> for X position.</p>
            </SubSection>
            <SubSection title="Copy, Cut &amp; Paste">
              <p><Kbd>Ctrl+C</Kbd> copy, <Kbd>Ctrl+X</Kbd> cut, <Kbd>Ctrl+V</Kbd> paste at current playback position.</p>
            </SubSection>
            <SubSection title="Placing Events">
              <p>Use <Kbd>T</Kbd> (Transition) or <Kbd>Y</Kbd> (Constant) tool. Click on timeline to place events.</p>
            </SubSection>
            <SubSection title="Eraser">
              <p>Select Eraser (<Kbd>X</Kbd>) and click any note or event to delete it.</p>
            </SubSection>
          </Section>

          {/* 7 Game Preview */}
          <Section title="7. Game Preview">
            <p className="mb-2">
              The Preview panel shows real-time rendering using Canvas2D.
            </p>
            <SubSection title="Visual Features">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Distinct colors per note type; selected notes appear <strong style={{ color: "#32cd32" }}>green</strong></li>
                <li>Multi-highlight: same-beat notes get a white outline</li>
                <li>Anchor markers at line origins</li>
                <li>Ghost note preview during placement</li>
                <li>Background illustration with dim overlay</li>
              </ul>
            </SubSection>
            <SubSection title="HUD">
              <p>During playback: Score (top-right), Combo (top-center), Chart name (bottom-left), Level (bottom-right).</p>
            </SubSection>
            <SubSection title="FC/AP Indicator">
              <p>When enabled, all notes glow <strong style={{ color: "#feffa9" }}>golden</strong> during FC playback.</p>
            </SubSection>
            <SubSection title="Hit Effects">
              <p>Visual hit effect (expanding ring + particles) at hit position, lasting 0.5s.</p>
            </SubSection>
          </Section>

          {/* 8 Playback */}
          <Section title="8. Playback">
            <p className="mb-2">
              Press <Kbd>Space</Kbd> to toggle play/pause. Use the seek slider and speed multipliers (0.25x–1x).
              Timer-driven when no audio is loaded. Toggle metronome for beat clicks.
            </p>
          </Section>

          {/* 9 Beats & BPM */}
          <Section title="9. Beats &amp; BPM">
            <p className="mb-2">
              Time is measured in beats as rational numbers: <code>[whole, numerator, denominator]</code>.
              Example: <code>[2, 1, 4]</code> = beat 2.25.
            </p>
            <p className="mb-2">
              The BPM list defines tempo. Most songs have one BPM; add change points for tempo variations.
              Density controls grid subdivision (1/4, 1/8, etc.).
            </p>
          </Section>

          {/* 10 Settings */}
          <Section title="10. Settings">
            <p className="mb-2">
              Access via the gear icon (⚙) in the menu bar. Categories: General, Audio, Game Preview,
              Timeline, Editor, Resource Pack. Changes are saved automatically.
            </p>
          </Section>

          {/* 11 Keyboard Shortcuts */}
          <Section title="11. Keyboard Shortcuts">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                    {group.title}
                  </h4>
                  <div className="flex flex-col gap-1">
                    {group.shortcuts.map((s) => (
                      <div key={s.key} className="flex items-center justify-between text-xs gap-2">
                        <span style={{ color: "var(--text-muted)" }}>{s.action}</span>
                        <Kbd>{s.key}</Kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 12 Tips */}
          <Section title="12. Tips &amp; Best Practices">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Start simple.</strong> Begin with one line at center. Add notes first, then animate with events.</li>
              <li><strong>Use the grid.</strong> Set Density to match the song's rhythm (1/4, 1/8, 1/16).</li>
              <li><strong>Preview often.</strong> Press <Kbd>Space</Kbd> for real-time preview. Slow down with 0.5x.</li>
              <li><strong>Use multiple lines.</strong> Phigros charts typically have multiple independently moving lines.</li>
              <li><strong>Undo is your friend.</strong> <Kbd>Ctrl+Z</Kbd> — up to 200 steps preserved.</li>
              <li><strong>Speed events for drama.</strong> Set S to 0 before a drop for freeze, then snap back.</li>
              <li><strong>Above and below.</strong> Use <Kbd>F</Kbd> to flip notes between sides of a line.</li>
              <li><strong>Invisible lines.</strong> Set opacity to 0 — a common technique in harder charts.</li>
            </ul>
          </Section>

          <p className="text-[10px] text-center pb-2" style={{ color: "var(--text-muted)" }}>
            v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}

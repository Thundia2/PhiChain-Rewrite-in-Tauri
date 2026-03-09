// ============================================================
// Home Screen
//
// Landing page shown when no project is loaded. Features:
//   - Welcome message and branding
//   - "New Chart" button
//   - Extremely detailed feature guide covering every aspect
//     of the editor, including event types (X, Y, R, O, S)
//   - Keyboard shortcut reference
// ============================================================

interface HomeScreenProps {
  onNewChart: () => void;
}

// ============================================================
// Section component for visual grouping
// ============================================================

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

// ============================================================
// Shortcut table
// ============================================================

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

// ============================================================
// Main component
// ============================================================

export function HomeScreen({ onNewChart }: HomeScreenProps) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* ---- Branding ---- */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Phichain
          </h1>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Phigros Chart Editor
          </p>
          <button
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--accent-primary)", color: "white" }}
            onClick={onNewChart}
          >
            New Chart
          </button>
        </div>

        {/* ==================================================== */}
        {/* GUIDE                                                 */}
        {/* ==================================================== */}
        <div
          className="rounded-lg p-6 mb-8"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <h2
            className="text-base font-bold mb-4 text-center"
            style={{ color: "var(--text-primary)" }}
          >
            Complete Editor Guide
          </h2>

          {/* ---- 1  Getting Started ---- */}
          <Section title="1. Getting Started">
            <p className="mb-2">
              Phichain is a chart editor for the rhythm game <strong>Phigros</strong>.
              Charts consist of <strong>judgment lines</strong> that move, rotate, and
              fade, with <strong>notes</strong> falling toward them. Players tap, drag,
              flick, or hold notes as they reach the line.
            </p>
            <SubSection title="Creating a Chart">
              <p>
                Click <strong>New Chart</strong> above or press <Kbd>Ctrl+N</Kbd>.
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

          {/* ---- 2  Editor Layout ---- */}
          <Section title="2. Editor Layout">
            <p className="mb-2">
              The editor uses a <strong>tabbed interface</strong> (Home, Charts,
              Settings) with a <strong>resizable mosaic layout</strong> for panels.
              Drag panel edges to resize them. Close panels via their &times; button
              and reopen them from the <strong>Windows</strong> menu.
            </p>
            <SubSection title="Panels">
              <p className="mb-1">
                <strong>Timeline</strong> &mdash; The main editing area. Displays
                notes and events on a vertical beat grid. Scroll to navigate through
                time. Click to place notes, drag to select.
              </p>
              <p className="mb-1">
                <strong>Preview</strong> &mdash; A live game preview showing exactly
                how the chart looks during gameplay. Notes fall toward the judgment
                line in real time.
              </p>
              <p className="mb-1">
                <strong>Line List</strong> &mdash; Lists all judgment lines in the
                chart. Click a line to select it. Use <strong>+ Add</strong> to create
                new lines and <strong>- Remove</strong> to delete them.
              </p>
              <p className="mb-1">
                <strong>Inspector</strong> &mdash; Shows properties of the selected
                line, note, or event. Edit values like beat, X position, speed, and
                kind directly.
              </p>
              <p className="mb-1">
                <strong>Toolbar</strong> &mdash; Quick-access buttons for all
                placement tools (Select, Tap, Drag, Flick, Hold, Transition,
                Constant, Eraser).
              </p>
              <p className="mb-1">
                <strong>Timeline Settings</strong> &mdash; Controls for Zoom,
                Density (grid subdivision), Lanes (vertical guide count), Side
                filter (Above/Below/All), and Spectrogram toggle.
              </p>
              <p className="mb-1">
                <strong>BPM List</strong> &mdash; Manage tempo changes. Add BPM
                points to create speed-ups or slow-downs at specific beats.
              </p>
              <p className="mb-1">
                <strong>Chart Settings</strong> &mdash; Edit the song offset
                (audio sync adjustment in seconds).
              </p>
            </SubSection>
            <SubSection title="Quick Action Bar">
              <p>
                Located below the tab bar on chart tabs. Contains playback
                controls (play/stop), speed multiplier buttons (0.25x, 0.5x,
                0.75x, 1x), metronome toggle, a seek slider, and the current
                time display.
              </p>
            </SubSection>
            <SubSection title="Status Bar">
              <p>
                At the bottom of the screen on chart tabs. Shows the version,
                total note count, event count, number of selected notes/events,
                and the active tool name.
              </p>
            </SubSection>
          </Section>

          {/* ---- 3  Judgment Lines ---- */}
          <Section title="3. Judgment Lines">
            <p className="mb-2">
              Judgment lines are the core building blocks. Every note belongs to a
              line, and every line has its own <strong>events</strong> that control
              where it appears, how it rotates, and how fast notes approach it.
            </p>
            <p className="mb-2">
              The Phigros coordinate system has its origin at the <strong>center of
              the screen</strong>. The canvas is <strong>1350 units wide</strong> and{" "}
              <strong>900 units tall</strong>, so:
            </p>
            <ul className="list-disc pl-5 mb-2 space-y-0.5">
              <li>X ranges from <strong>-675</strong> (left edge) to <strong>+675</strong> (right edge)</li>
              <li>Y ranges from <strong>-450</strong> (bottom) to <strong>+450</strong> (top)</li>
              <li>Rotation is in <strong>degrees</strong>, counter-clockwise positive</li>
              <li>Opacity ranges from <strong>0</strong> (invisible) to <strong>255</strong> (fully visible)</li>
            </ul>
            <p>
              Lines can have <strong>child lines</strong> that inherit their
              parent&rsquo;s transformation. Use the Line List panel to add, remove,
              rename, and select lines.
            </p>
          </Section>

          {/* ---- 4  Events (X, Y, R, O, S) ---- */}
          <Section title="4. Line Events (X, Y, R, O, S)">
            <p className="mb-3">
              Events animate a judgment line over time. Each event has a{" "}
              <strong>start beat</strong>, <strong>end beat</strong>, and a{" "}
              <strong>value</strong> that is either a <em>transition</em>{" "}
              (smoothly interpolates from one value to another using an easing
              curve) or a <em>constant</em> (holds a fixed value).
            </p>
            <p className="mb-3">
              In the Timeline, events are shown as colored vertical columns
              behind the notes. Each event type has its own color:
            </p>

            <SubSection title="X &mdash; Horizontal Position (Red)">
              <p className="mb-1">
                Controls the <strong>horizontal position</strong> of the
                judgment line on screen. The value is in Phigros canvas units.
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>0</strong> = center of screen</li>
                <li><strong>-675</strong> = left edge of screen</li>
                <li><strong>+675</strong> = right edge of screen</li>
              </ul>
              <p className="mt-1">
                <em>Example:</em> To slide a line from left to center over 4 beats,
                create an X transition event from beat 0 to beat 4 with start
                value -400 and end value 0.
              </p>
            </SubSection>

            <SubSection title="Y &mdash; Vertical Position (Yellow)">
              <p className="mb-1">
                Controls the <strong>vertical position</strong> of the judgment
                line on screen.
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>0</strong> = center of screen</li>
                <li><strong>+450</strong> = top edge</li>
                <li><strong>-450</strong> = bottom edge</li>
              </ul>
              <p className="mt-1">
                <em>Example:</em> To make a line rise from the bottom, create a Y
                transition from -300 to 0 over several beats.
              </p>
            </SubSection>

            <SubSection title="R &mdash; Rotation (Green)">
              <p className="mb-1">
                Controls the <strong>rotation angle</strong> of the judgment line
                in degrees.
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>0</strong> = horizontal (default)</li>
                <li><strong>90</strong> = rotated 90&deg; counter-clockwise (vertical, notes fall right-to-left)</li>
                <li><strong>-90</strong> = rotated 90&deg; clockwise (vertical, notes fall left-to-right)</li>
                <li><strong>180</strong> = upside-down (notes fall downward)</li>
              </ul>
              <p className="mt-1">
                <em>Example:</em> For a spinning line, create a rotation transition
                from 0 to 360 with linear easing. Chain multiple events for
                continuous rotation.
              </p>
            </SubSection>

            <SubSection title="O &mdash; Opacity (Blue)">
              <p className="mb-1">
                Controls the <strong>transparency</strong> of the judgment line.
                Notes on invisible lines still fall and can be hit &mdash; the
                line itself just isn&rsquo;t visible.
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>255</strong> = fully visible (default)</li>
                <li><strong>0</strong> = completely invisible</li>
                <li>Values between 0&ndash;255 create partial transparency</li>
              </ul>
              <p className="mt-1">
                <em>Example:</em> To make a line fade out, create an opacity
                transition from 255 to 0. Notes will still be playable even when
                the line is invisible.
              </p>
            </SubSection>

            <SubSection title="S &mdash; Speed (Purple)">
              <p className="mb-1">
                Controls the <strong>note fall speed</strong> on this line. This
                is a <em>multiplier</em> that affects how fast notes approach the
                judgment line.
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>1.0</strong> = normal speed (default)</li>
                <li><strong>2.0</strong> = notes fall twice as fast</li>
                <li><strong>0.5</strong> = notes fall at half speed</li>
                <li><strong>0</strong> = notes are frozen in place</li>
                <li><strong>Negative values</strong> = notes move away from the line</li>
              </ul>
              <p className="mt-1">
                <em>Important:</em> Speed events change the{" "}
                <em>visual distance</em> notes travel. The timing of when a note
                must be hit never changes &mdash; only how far away it appears.
                This is calculated using a <strong>speed integral</strong>{" "}
                (the total distance traveled is the area under the speed curve
                over time).
              </p>
            </SubSection>

            <SubSection title="Event Values: Transition vs. Constant">
              <p className="mb-1">
                <strong>Transition events</strong> smoothly interpolate between a
                start and end value over the event&rsquo;s duration. Use the{" "}
                <Kbd>T</Kbd> tool to place them. You can choose from 30+ easing
                curves (linear, ease-in, ease-out, bounce, elastic, etc.) to
                control the interpolation shape.
              </p>
              <p>
                <strong>Constant events</strong> hold a single fixed value for
                their entire duration. Use the <Kbd>Y</Kbd> tool to place them.
                Useful for snapping a line to a specific position instantly.
              </p>
            </SubSection>

            <SubSection title="Easing Curves">
              <p>
                When creating transition events, you can select an easing function
                that controls the acceleration/deceleration of the animation.
                Supported curves include: Linear, Sine, Quad, Cubic, Quart, Quint,
                Expo, Circ, Back, Elastic, and Bounce &mdash; each with In, Out,
                and InOut variants (30 presets total). You can also use custom cubic
                bezier control points, step functions, or elastic with custom omega.
              </p>
            </SubSection>

            <SubSection title="Default Events">
              <p>
                Every new line starts with default events: X=0, Y=0, Rotation=0,
                Opacity=255, Speed=1. These ensure the line is centered, visible,
                horizontal, and notes fall at normal speed.
              </p>
            </SubSection>
          </Section>

          {/* ---- 5  Note Types ---- */}
          <Section title="5. Note Types">
            <p className="mb-2">
              Notes are the objects players interact with during gameplay. Each
              note has a <strong>type</strong>, <strong>beat</strong> (when it
              should be hit), <strong>X position</strong> (where on the line),
              <strong> side</strong> (above or below), and <strong>speed</strong>{" "}
              (individual fall speed multiplier).
            </p>

            <div className="mb-3">
              <ColorBadge color="#35b5ff" label="Tap" />
              <ColorBadge color="#f0d040" label="Drag" />
              <ColorBadge color="#ff4060" label="Flick" />
              <ColorBadge color="#35b5ff" label="Hold" />
              <ColorBadge color="#32cd32" label="Selected" />
            </div>

            <SubSection title="Tap (Q)">
              <p>
                The most common note. The player must <strong>tap the screen</strong>{" "}
                precisely when the note crosses the judgment line. Shown as a{" "}
                <strong style={{ color: "#35b5ff" }}>blue rectangle</strong> in the
                preview. Place with the <Kbd>Q</Kbd> tool.
              </p>
            </SubSection>

            <SubSection title="Drag (W)">
              <p>
                A lenient note that requires <strong>any touch</strong> &mdash; no
                precise timing needed. The player simply needs to have their finger
                on the note as it crosses the line. Shown as a{" "}
                <strong style={{ color: "#f0d040" }}>yellow/gold rectangle</strong>{" "}
                (thinner height). Place with the <Kbd>W</Kbd> tool. Often used in
                streams of rapid notes.
              </p>
            </SubSection>

            <SubSection title="Flick (E)">
              <p>
                The player must <strong>swipe/flick upward</strong> when the note
                reaches the line. Shown as a{" "}
                <strong style={{ color: "#ff4060" }}>red rectangle with an
                upward arrow</strong>. Place with the <Kbd>E</Kbd> tool.
              </p>
            </SubSection>

            <SubSection title="Hold (R)">
              <p>
                The player must <strong>press and hold</strong> for the note&rsquo;s
                full duration. Shown as a{" "}
                <strong style={{ color: "#35b5ff" }}>blue bar</strong> extending
                from the head (where you first press) to the tail (where you
                release). Place with the <Kbd>R</Kbd> tool &mdash; the note&rsquo;s{" "}
                <code>hold_beat</code> property determines how long to hold.
              </p>
            </SubSection>

            <SubSection title="Note Properties">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <strong>Beat</strong> &mdash; When the note must be hit, expressed
                  as [whole, numerator, denominator]. For example [2, 1, 4] means
                  beat 2&frac14;.
                </li>
                <li>
                  <strong>X</strong> &mdash; Horizontal position on the judgment
                  line (-675 to +675). 0 = center of the line.
                </li>
                <li>
                  <strong>Above</strong> &mdash; If true, the note falls from above
                  the line. If false, it rises from below. Press <Kbd>F</Kbd> to
                  flip selected notes.
                </li>
                <li>
                  <strong>Speed</strong> &mdash; Individual speed multiplier for
                  this note (default 1.0). Multiplied with the line&rsquo;s speed
                  events. Higher = note appears farther away and falls faster.
                </li>
              </ul>
            </SubSection>
          </Section>

          {/* ---- 6  Timeline Workflow ---- */}
          <Section title="6. Timeline Workflow">
            <SubSection title="Placing Notes">
              <p>
                Select a placement tool (<Kbd>Q</Kbd> <Kbd>W</Kbd> <Kbd>E</Kbd>{" "}
                <Kbd>R</Kbd>) and click on the timeline grid. The note snaps to the
                nearest beat subdivision based on the current <strong>Density</strong>{" "}
                setting (e.g., 1/4 = quarter notes, 1/8 = eighth notes). A{" "}
                <strong>ghost preview</strong> follows your cursor showing where the
                note will be placed.
              </p>
            </SubSection>

            <SubSection title="Selecting Notes">
              <p className="mb-1">
                Switch to the Select tool (<Kbd>V</Kbd>), then click a note to
                select it. Hold <Kbd>Ctrl</Kbd> and click to toggle individual
                notes. Press <Kbd>Ctrl+A</Kbd> to select all notes on the current
                line.
              </p>
              <p>
                <strong>Drag selection:</strong> Click and drag on an empty area of
                the timeline to draw a selection rectangle. All notes within the
                rectangle will be selected. A green overlay shows the selection area.
              </p>
            </SubSection>

            <SubSection title="Moving Notes">
              <p>
                Select notes, then use arrow keys to nudge them:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><Kbd>&uarr;</Kbd> Move forward in time by one grid step</li>
                <li><Kbd>&darr;</Kbd> Move backward in time by one grid step</li>
                <li><Kbd>&rarr;</Kbd> Move right by one lane width</li>
                <li><Kbd>&larr;</Kbd> Move left by one lane width</li>
              </ul>
              <p className="mt-1">
                Arrow key movements create a single undo entry, so you can undo an
                entire nudge in one step.
              </p>
            </SubSection>

            <SubSection title="Copy, Cut &amp; Paste">
              <p>
                Select notes or events, then <Kbd>Ctrl+C</Kbd> to copy,{" "}
                <Kbd>Ctrl+X</Kbd> to cut. Press <Kbd>Ctrl+V</Kbd> to paste at
                the current playback position. Pasted items are automatically selected.
              </p>
            </SubSection>

            <SubSection title="Placing Events">
              <p>
                Select the <strong>Transition</strong> (<Kbd>T</Kbd>) or{" "}
                <strong>Constant</strong> (<Kbd>Y</Kbd>) tool. Click on the
                timeline to place events for the selected line. Events control line
                movement (see Section 4).
              </p>
            </SubSection>

            <SubSection title="Eraser">
              <p>
                Select the Eraser tool (<Kbd>X</Kbd>) and click on any note or
                event to delete it instantly.
              </p>
            </SubSection>

            <SubSection title="Curve Note Tracks">
              <p>
                Right-click on the timeline to open a context menu for creating
                curved note tracks. Select a start note, then right-click and
                choose <strong>&ldquo;Start Curve Track From Here&rdquo;</strong>,
                then do the same for the end note. Curve tracks generate
                intermediate notes along an eased path between two anchor notes.
              </p>
            </SubSection>
          </Section>

          {/* ---- 7  Game Preview ---- */}
          <Section title="7. Game Preview">
            <p className="mb-2">
              The Preview panel shows a real-time rendering of your chart exactly
              as it would appear in-game. It updates every frame using Canvas2D.
            </p>
            <SubSection title="Visual Features">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <strong>Note colors</strong> &mdash; Each note type has a
                  distinct color (blue tap, yellow drag, red flick, blue hold).
                  Selected notes appear <strong style={{ color: "#32cd32" }}>green</strong>.
                </li>
                <li>
                  <strong>Multi-highlight</strong> &mdash; Notes that share the
                  same beat get a white outline, helping you spot stacked notes.
                </li>
                <li>
                  <strong>Anchor markers</strong> &mdash; Small circles at each
                  judgment line&rsquo;s origin point. Configurable: Never, Always,
                  or When Visible.
                </li>
                <li>
                  <strong>Ghost note</strong> &mdash; When using a placement tool,
                  a faint preview shows where the note would appear in the game.
                </li>
                <li>
                  <strong>Background illustration</strong> &mdash; If a background
                  image is loaded, it displays behind the dim overlay.
                </li>
              </ul>
            </SubSection>

            <SubSection title="HUD (Heads-Up Display)">
              <p>
                During playback, the preview shows a game-like HUD:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Score</strong> (top-right) &mdash; 7-digit score based on notes hit</li>
                <li><strong>Combo</strong> (top-center) &mdash; Shows when combo &ge; 3</li>
                <li><strong>Chart name</strong> (bottom-left)</li>
                <li><strong>Level</strong> (bottom-right)</li>
              </ul>
            </SubSection>

            <SubSection title="FC/AP Indicator">
              <p>
                When enabled in Settings, all notes glow{" "}
                <strong style={{ color: "#feffa9" }}>golden yellow</strong>{" "}
                during playback while Full Combo is still valid. This helps you
                visualize the FC state.
              </p>
            </SubSection>

            <SubSection title="Hit Effects">
              <p>
                When a note crosses the judgment line during playback, a visual
                hit effect (expanding ring + particles) appears at the hit
                position. Effects last 0.5 seconds and use ease-out animation.
              </p>
            </SubSection>
          </Section>

          {/* ---- 8  Playback ---- */}
          <Section title="8. Playback">
            <p className="mb-2">
              Press <Kbd>Space</Kbd> to toggle play/pause. Use the{" "}
              <strong>seek slider</strong> in the Quick Action Bar to jump to
              any position. Speed multipliers (0.25x, 0.5x, 0.75x, 1x) let
              you slow down playback to inspect complex sections.
            </p>
            <p className="mb-2">
              <strong>Timer-driven playback:</strong> When no audio file is loaded,
              the editor uses a timer-based system to advance the current time.
              When audio is loaded, playback syncs with the music.
            </p>
            <p>
              <strong>Metronome:</strong> Toggle the metronome in the Quick Action
              Bar to hear a click on each beat, helping you place notes in time.
            </p>
          </Section>

          {/* ---- 9  Beats &amp; BPM ---- */}
          <Section title="9. Beats &amp; BPM">
            <p className="mb-2">
              Time in Phichain is measured in <strong>beats</strong>, not seconds.
              A beat is stored as a rational number:{" "}
              <code>[whole, numerator, denominator]</code>. For example:
            </p>
            <ul className="list-disc pl-5 mb-2 space-y-0.5">
              <li><code>[0, 0, 1]</code> = beat 0 (start of song)</li>
              <li><code>[1, 0, 1]</code> = beat 1</li>
              <li><code>[2, 1, 4]</code> = beat 2.25 (beat 2 + one sixteenth)</li>
              <li><code>[3, 1, 2]</code> = beat 3.5 (beat 3 + an eighth)</li>
            </ul>
            <p className="mb-2">
              The <strong>BPM (Beats Per Minute)</strong> list defines the tempo
              of the song. Most songs have a single BPM value, but you can add
              BPM change points for songs with tempo variations.
            </p>
            <p>
              The <strong>Density</strong> setting in Timeline Settings controls
              the grid subdivision. For example, density 1/4 shows quarter-beat
              grid lines, 1/8 shows eighth-beat lines, etc. Notes snap to the
              nearest grid line when placed.
            </p>
          </Section>

          {/* ---- 10  Settings ---- */}
          <Section title="10. Settings">
            <p className="mb-2">
              Access Settings from <strong>File &gt; Preferences</strong> or the
              Settings tab. Changes are saved automatically to local storage.
            </p>
            <SubSection title="Audio">
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Music Volume</strong> &mdash; Master volume for the song audio (0&ndash;100%)</li>
                <li><strong>Hit Sound Volume</strong> &mdash; Volume of note hit sounds (0&ndash;100%)</li>
              </ul>
            </SubSection>
            <SubSection title="Game Preview">
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Note Size</strong> &mdash; Scale multiplier for note rendering (default 1.0x)</li>
                <li><strong>Background Dim</strong> &mdash; Darkness of the background overlay (0&ndash;100%)</li>
                <li><strong>Show FC/AP Indicator</strong> &mdash; Show golden notes during FC playback</li>
                <li><strong>Multi Highlight</strong> &mdash; Outline notes sharing the same beat</li>
                <li><strong>Show HUD</strong> &mdash; Display combo, score, and chart info during playback</li>
                <li><strong>Anchor Markers</strong> &mdash; Show circles at line origins (Never / Always / When Visible)</li>
              </ul>
            </SubSection>
            <SubSection title="Timeline">
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Invert Scroll Direction</strong> &mdash; Reverse the scroll direction in the timeline</li>
              </ul>
            </SubSection>
            <SubSection title="Autosave">
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Enable Autosave</strong> &mdash; Automatically save your work at regular intervals</li>
                <li><strong>Autosave Interval</strong> &mdash; How often to autosave (default 120 seconds)</li>
              </ul>
            </SubSection>
          </Section>

          {/* ---- 11  Keyboard Shortcuts ---- */}
          <Section title="11. Keyboard Shortcuts">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4
                    className="text-xs font-semibold mb-1.5"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {group.title}
                  </h4>
                  <div className="flex flex-col gap-1">
                    {group.shortcuts.map((s) => (
                      <div
                        key={s.key}
                        className="flex items-center justify-between text-xs gap-2"
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {s.action}
                        </span>
                        <Kbd>{s.key}</Kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ---- 12  Tips ---- */}
          <Section title="12. Tips &amp; Best Practices">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Start simple.</strong> Begin with a single line at the center.
                Add notes first, then animate the line with events.
              </li>
              <li>
                <strong>Use the grid.</strong> Set Density to match the song&rsquo;s
                rhythm (1/4 for quarter notes, 1/8 for eighth notes, 1/16 for
                fast passages).
              </li>
              <li>
                <strong>Preview often.</strong> Press <Kbd>Space</Kbd> to see how
                your chart feels in real time. Slow down playback with 0.5x for
                complex sections.
              </li>
              <li>
                <strong>Use multiple lines.</strong> Phigros charts typically have
                multiple judgment lines that move independently, creating visual
                complexity.
              </li>
              <li>
                <strong>Undo is your friend.</strong> Every action is undoable with{" "}
                <Kbd>Ctrl+Z</Kbd>. Up to 200 undo steps are preserved.
              </li>
              <li>
                <strong>Speed events for drama.</strong> Change the S (speed) event
                to 0 right before a drop, making all notes freeze in place, then
                snap back to high speed for dramatic effect.
              </li>
              <li>
                <strong>Above and below.</strong> Notes can fall from both sides of
                a line simultaneously. Use <Kbd>F</Kbd> to flip notes between above
                and below.
              </li>
              <li>
                <strong>Invisible lines.</strong> Set opacity to 0 to create
                invisible judgment lines. Players must memorize the pattern
                &mdash; a common technique in harder charts.
              </li>
            </ul>
          </Section>
        </div>

        {/* ---- Version ---- */}
        <p
          className="text-[10px] text-center pb-6"
          style={{ color: "var(--text-muted)" }}
        >
          v0.1.0
        </p>
      </div>
    </div>
  );
}

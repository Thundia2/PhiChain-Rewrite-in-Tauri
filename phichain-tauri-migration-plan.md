# Phichain Migration Plan: Tauri 2 + React + TypeScript

## Why Migrate? An Honest Breakdown

### What's Wrong with Bevy + egui for an Editor

The current stack uses **Bevy** (a game engine) and **egui** (an immediate-mode GUI library). These are excellent tools — for games. For a complex editor application, they create real problems:

**egui limitations that directly hurt this project:**

- **No CSS, no stylesheets, no themes.** Every single color in the codebase is a hardcoded `Color32` value scattered across 30+ files. Changing the look of the editor means manually finding and editing hundreds of individual lines. In web tech, you change one CSS variable and everything updates.

- **No layout engine.** egui has basic horizontal/vertical layouts and that's it. The timeline panel is built by manually computing pixel positions with arithmetic like `viewport.min.x + (note.x / CANVAS_WIDTH + 0.5) * viewport.width()`. In web tech, CSS Grid and Flexbox handle this automatically.

- **No animation system.** Transitions, hover effects, smooth scrolling — all of these would need manual implementation frame-by-frame. Web CSS transitions handle them in one line.

- **Immediate mode means everything rebuilds every frame.** The entire UI is re-described 60 times per second. This makes stateful interactions (drag-and-drop across panels, multi-step dialogs, complex form validation) extremely awkward to implement — you have to manually stash state in `ui.data()` hacks.

- **No rich text input.** The IME (Input Method Editor) compatibility for Chinese/Japanese text is bolted on as a separate plugin (`ime.rs`) because egui doesn't natively handle it well.

- **Tiny widget ecosystem.** Need a color picker? A tree view? A timeline/sequencer widget? A proper drag-and-drop list? In web-land these are npm packages away. In egui they're multi-hundred-line manual implementations or simply don't exist.

**Bevy limitations for editor work:**

- Bevy is an ECS game engine. Every UI interaction goes through entities, components, systems, events, and system parameters. Adding a checkbox to a panel requires understanding `SystemParam`, `Query`, `Resource`, `EventWriter`, and `SystemState`. In React, it's `<input type="checkbox" onChange={...} />`.

- The tab/docking system (`egui_dock`) is functional but basic — no tab pinning, no drag preview, no split-view handles, limited style control.

- Build times for Rust are slow. A small UI change requires recompiling, which can take 30+ seconds even with incremental builds. Web hot-reload is instantaneous.

### What the Current Stack IS Good At

- **The chart data model** (`phichain-chart`, 3,878 lines of Rust) — type-safe serialization, precise beat math using `Rational32`, format conversion between Official/RPE/Phichain formats, and 5 migration steps. This code is solid and well-tested.

- **The compiler** (`phichain-compiler`, 274 lines) — merges child lines and evaluates curve note tracks. Simple but correct.

- **File I/O and project management** — reading/writing chart.json, meta.json, handling music/illustration files.

### The Recommendation: Tauri 2 + React

**Tauri 2** is the ideal migration target because:

1. **The backend is Rust.** The entire `phichain-chart` crate (data model, serialization, beat math, format conversion, migrations) and `phichain-compiler` can be kept **as-is** with zero changes. They become Tauri "commands" — functions the frontend calls.

2. **The frontend is a webview** — identical capabilities to Electron (HTML, CSS, JavaScript, React, Canvas, WebGL) but using the OS's built-in web renderer instead of shipping Chromium. This means ~5-15 MB binaries instead of ~200 MB.

3. **IPC is fast and typed.** Tauri's invoke system lets the React frontend call Rust functions directly and get typed responses. Chart saves, loads, compilations, and format conversions all happen in Rust at native speed.

4. **The game preview** (2,200 lines of Bevy rendering code) can be rewritten as an HTML5 Canvas renderer. The actual rendering logic is straightforward: draw rotated/positioned lines, draw note sprites at calculated Y positions based on speed events, draw hold note bodies. This is ~400-600 lines of Canvas2D code.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Timeline  │ │ Inspector│ │ Line List│  ...tabs    │
│  │ (Canvas)  │ │ (React)  │ │ (React)  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────────────────────────────────────┐       │
│  │     Game Preview (Canvas2D / WebGL)       │       │
│  └──────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────┐       │
│  │   Toolbar / Quick Actions / Status Bar    │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
│  Audio: Web Audio API (Howler.js)                    │
│  State: Zustand + Immer (undo/redo built-in)        │
│  Docking: react-mosaic or FlexLayout                │
│  Hotkeys: react-hotkeys-hook                        │
│                                                      │
├──────────────── Tauri IPC Bridge ────────────────────┤
│                                                      │
│                   BACKEND (Rust)                     │
│                                                      │
│  ┌────────────────┐  ┌─────────────────┐            │
│  │ phichain-chart  │  │ phichain-compiler│            │
│  │  (UNCHANGED)    │  │   (UNCHANGED)    │            │
│  │                 │  │                  │            │
│  │ • Beat math     │  │ • Compile chart  │            │
│  │ • BPM list      │  │ • Merge lines    │            │
│  │ • Note/Event    │  │ • Curve tracks   │            │
│  │ • Serialization │  └─────────────────┘            │
│  │ • Formats       │                                 │
│  │ • Migrations    │  ┌─────────────────┐            │
│  └────────────────┘  │  phichain-converter│           │
│                       │   (UNCHANGED)    │            │
│  ┌────────────────┐  └─────────────────┘            │
│  │  New: commands  │                                 │
│  │                 │  ┌─────────────────┐            │
│  │ • save_project  │  │ Audio processing │            │
│  │ • load_project  │  │ • Spectrogram    │            │
│  │ • export_chart  │  │ • Waveform data  │            │
│  │ • convert_chart │  └─────────────────┘            │
│  └────────────────┘                                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### What Stays in Rust (Tauri Backend) — ~4,500 lines, unchanged or lightly wrapped

| Crate | Lines | Status | Why |
|-------|-------|--------|-----|
| `phichain-chart` | 3,878 | **Unchanged** | Beat math (Rational32), BPM calculations, format conversion (Official, RPE), 5 migrations, serialization — all battle-tested |
| `phichain-compiler` | 274 | **Unchanged** | Chart compilation (merge children, evaluate curves) |
| `phichain-converter` | 103 | **Unchanged** | Format conversion CLI — now callable as a Tauri command |
| New: `src-tauri/commands/` | ~300 | **New** | Thin wrapper functions exposing the above to the frontend |

### What Gets Rewritten in TypeScript/React — ~12,900 lines → ~8,000-10,000 lines

The editor currently has 12,941 lines of Rust. In React+TypeScript, this will be shorter because:
- No ECS boilerplate (SystemParam, Query, EventWriter, etc.)
- CSS replaces hundreds of lines of manual layout math
- React state management replaces Bevy Resource/Component patterns
- Existing npm packages replace hand-built widgets

### What Gets Ported to Canvas — ~2,900 lines → ~600-800 lines

The Bevy game renderer (`phichain-game`) is mostly Bevy-specific plumbing (systems, components, queries, sprite management). The actual math is simple:
- Evaluate events at a beat → get line position/rotation/opacity/speed
- Calculate note Y position from speed integral (the `distance_at` function — ~40 lines of math)
- Draw rotated sprites

---

## Migration Phases

### Phase 0: Project Scaffolding

**Goal:** Set up the Tauri 2 + React project structure so everything can be developed and tested incrementally.

**Steps:**

1. **Initialize Tauri 2 project** with React + TypeScript template:
   ```
   npm create tauri-app@latest phichain-next -- --template react-ts
   ```

2. **Bring in the existing Rust crates** as dependencies in `src-tauri/Cargo.toml`:
   ```toml
   [dependencies]
   phichain-chart = { path = "../phichain-chart" }
   phichain-compiler = { path = "../phichain-compiler" }
   ```
   This requires removing the `bevy` feature flag from `phichain-chart` (it's already behind a feature gate: `#[cfg_attr(feature = "bevy", ...)]`).

3. **Install frontend dependencies:**
   ```
   npm install react-mosaic-component zustand immer howler
   npm install react-hotkeys-hook @dnd-kit/core @dnd-kit/sortable
   npm install -D tailwindcss @types/howler
   ```

4. **Create the folder structure:**
   ```
   src/
   ├── components/           # Reusable UI components
   │   ├── Timeline/         # Timeline canvas + overlays
   │   ├── GamePreview/      # Game preview canvas
   │   ├── Inspector/        # Property panels
   │   ├── LineList/          # Line management panel
   │   ├── Toolbar/           # Note/event placement tools
   │   └── common/            # Shared widgets
   ├── stores/               # Zustand state stores
   │   ├── chartStore.ts     # Chart data (lines, notes, events)
   │   ├── editorStore.ts    # Editor state (selection, tool, zoom)
   │   ├── audioStore.ts     # Audio playback state
   │   └── historyStore.ts   # Undo/redo
   ├── canvas/               # Canvas rendering code
   │   ├── gameRenderer.ts   # Game preview renderer
   │   ├── timelineRenderer.ts # Timeline renderer
   │   └── easings.ts        # Easing functions (port from Rust)
   ├── hooks/                # Custom React hooks
   ├── types/                # TypeScript type definitions
   │   ├── chart.ts          # Note, LineEvent, Beat, Line, etc.
   │   └── editor.ts         # EditorTool, Selection, etc.
   ├── utils/                # Utility functions
   │   ├── beat.ts           # Beat arithmetic (port from Rust)
   │   ├── bpmList.ts        # BPM list calculations (port from Rust)
   │   └── ipc.ts            # Tauri command wrappers
   ├── App.tsx               # Main layout with docking
   └── main.tsx              # Entry point
   ```

**Files from the old project this replaces:** `main.rs`, `Cargo.toml` (editor), all of `layout/`, `ui/`.

---

### Phase 1: TypeScript Data Types + Tauri Commands

**Goal:** Define the TypeScript types that mirror the Rust chart model, and create the IPC bridge so the frontend can load/save charts via the Rust backend.

#### A. TypeScript Chart Types (`src/types/chart.ts`)

Port the data structures (but NOT the logic — that stays in Rust for save/load/compile):

```typescript
// ============================================================
// CONFIGURABLE: Change these if the chart format changes
// ============================================================
const CANVAS_WIDTH = 1350.0;
const CANVAS_HEIGHT = 900.0;

// Beat is stored as [whole, numerator, denominator]
// e.g., beat 2 and 3/4 = [2, 3, 4]
interface Beat {
  whole: number;
  numer: number;
  denom: number;
}

type NoteKind = 
  | { type: 'tap' }
  | { type: 'drag' }
  | { type: 'flick' }
  | { type: 'hold'; holdBeat: Beat };

interface Note {
  kind: NoteKind;
  above: boolean;
  beat: Beat;
  x: number;      // Position on the line (-675 to 675, where CANVAS_WIDTH=1350)
  speed: number;
}

type LineEventKind = 'x' | 'y' | 'rotation' | 'opacity' | 'speed';

type LineEventValue =
  | { type: 'transition'; start: number; end: number; easing: Easing }
  | { type: 'constant'; value: number };

interface LineEvent {
  kind: LineEventKind;
  startBeat: Beat;
  endBeat: Beat;
  value: LineEventValue;
}

interface Line {
  name: string;
  notes: Note[];
  events: LineEvent[];
  children: Line[];    // Child lines (hierarchy)
  curveNoteTracks: CurveNoteTrack[];
}

interface ProjectMeta {
  composer: string;
  charter: string;
  illustrator: string;
  name: string;
  level: string;
}
```

**What this replaces:** The `Note`, `LineEvent`, `Line`, `Beat` structs from `phichain-chart/src/`. The Rust versions remain authoritative for serialization — these TypeScript types are for the frontend to work with in-memory.

#### B. Beat Arithmetic (`src/utils/beat.ts`)

The Beat type is critical — it uses rational number math to avoid floating-point drift. Port the essential operations:

```typescript
// ============================================================
// Beat math utilities
// Beats use whole + fraction (numerator/denominator) to avoid
// floating-point precision issues in timing calculations
// ============================================================

function beatToFloat(b: Beat): number {
  return b.whole + b.numer / b.denom;
}

function floatToBeat(value: number, maxDenom: number = 32): Beat {
  const whole = Math.floor(value);
  const frac = value - whole;
  // Find closest fraction with denominator <= maxDenom
  // (simplified — the Rust version uses Rational32 for exact math)
  let bestNumer = 0, bestDenom = 1, bestError = frac;
  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(frac * d);
    const error = Math.abs(frac - n / d);
    if (error < bestError) {
      bestNumer = n; bestDenom = d; bestError = error;
    }
  }
  return { whole, numer: bestNumer, denom: bestDenom };
}

function addBeats(a: Beat, b: Beat): Beat { /* ... */ }
function subtractBeats(a: Beat, b: Beat): Beat { /* ... */ }
function compareBeats(a: Beat, b: Beat): number { /* ... */ }
function snapBeat(value: number, density: number): Beat { /* ... */ }
```

**What this replaces:** `phichain-chart/src/beat.rs` (the 300-line Beat implementation with Rational32). Note: for save/load, the Rust backend still handles the authoritative Beat serialization. This TypeScript version is for real-time UI math only.

#### C. BPM List (`src/utils/bpmList.ts`)

Port the BPM list that converts between time (seconds) and beats:

```typescript
interface BpmPoint { beat: Beat; bpm: number; }

class BpmList {
  points: BpmPoint[];
  
  // Convert a time in seconds to the beat at that time
  beatAt(time: number): number { /* ... */ }
  
  // Convert a beat to time in seconds
  timeAt(beat: Beat): number { /* ... */ }
}
```

**What this replaces:** `phichain-chart/src/bpm_list.rs` (175 lines). Again, the Rust version stays for serialization; this is for real-time UI.

#### D. Tauri Commands (`src-tauri/src/commands.rs`)

Create thin Rust functions that expose the existing crate functionality:

```rust
// These wrap the existing phichain-chart and phichain-compiler crates
// No new logic — just bridging Rust → TypeScript

#[tauri::command]
fn load_project(path: String) -> Result<ProjectData, String> {
    // Uses existing phichain_chart::project::Project::open()
    // Returns the full chart + meta as JSON
}

#[tauri::command]
fn save_project(path: String, chart: String) -> Result<(), String> {
    // Deserialize the JSON chart, write to disk using existing serialization
}

#[tauri::command]
fn export_as_official(chart: String) -> Result<String, String> {
    // Uses existing phichain_compiler::compile() + OfficialChart conversion
}

#[tauri::command]
fn convert_chart(input: String, from: String, to: String) -> Result<String, String> {
    // Uses existing phichain_converter logic
}

#[tauri::command]
fn compute_spectrogram(audio_path: String) -> Result<Vec<Vec<u8>>, String> {
    // Port the spectrogram FFT computation from spectrogram.rs
    // Returns raw spectrogram data; frontend renders it on canvas
}
```

**What this replaces:** `phichain-editor/src/project.rs` (project loading/saving logic), `phichain-editor/src/export.rs`.

---

### Phase 2: Docking Layout + Empty Panels

**Goal:** Get the window layout working with all panels visible but empty, establishing the shell that everything else plugs into.

#### A. Docking System (`src/App.tsx`)

Use `react-mosaic` (the same docking library VS Code uses) or `FlexLayout` for a dockable panel system:

```tsx
// ============================================================
// CONFIGURABLE: Adjust the default panel layout here
// ============================================================
const DEFAULT_LAYOUT = {
  direction: 'row',
  first: {
    direction: 'column',
    first: 'line-list',
    second: 'toolbar',
    splitPercentage: 70,
  },
  second: {
    direction: 'row',
    first: 'timeline',
    second: {
      direction: 'column',
      first: 'game-preview',
      second: {
        direction: 'row',
        first: 'inspector',
        second: 'timeline-settings',
        splitPercentage: 50,
      },
      splitPercentage: 60,
    },
    splitPercentage: 55,
  },
  splitPercentage: 15,
};
```

**What this replaces:** `phichain-editor/src/layout/` (all 6 files — `mod.rs`, `ui_state.rs`, `apply.rs`, `create.rs`, `delete.rs`, `rename.rs`, `update.rs`). The `egui_dock` docking state, tab viewer, layout presets — all replaced by `react-mosaic`'s built-in features.

#### B. Menu Bar (`src/components/MenuBar.tsx`)

A standard React menu bar with dropdowns:

**What this replaces:** The menu bar section in `phichain-editor/src/main.rs` → `ui_system` function (the `egui::TopBottomPanel::top` block, ~80 lines).

#### C. Status Bar (`src/components/StatusBar.tsx`)

**What this replaces:** The `egui::TopBottomPanel::bottom` block in `main.rs` (~30 lines).

#### D. Quick Action Bar (`src/components/QuickActionBar.tsx`)

Transport controls (play/pause/stop), speed selector, progress bar, BPM display.

**What this replaces:** `phichain-editor/src/tab/quick_action.rs` (160 lines). In React, this becomes a clean component with proper grouping, icons, and CSS styling.

---

### Phase 3: State Management + Undo/Redo

**Goal:** Build the central state store that holds the chart data, selection state, and editor preferences, with full undo/redo support.

#### A. Chart Store (`src/stores/chartStore.ts`)

Using Zustand + Immer for immutable state updates with undo/redo:

```typescript
// ============================================================
// CONFIGURABLE: Maximum undo history depth
// ============================================================
const MAX_HISTORY_DEPTH = 200;

interface ChartState {
  meta: ProjectMeta;
  bpmList: BpmPoint[];
  lines: Line[];        // The full line hierarchy
  offset: number;
  
  // Mutations (each one is automatically tracked for undo)
  addNote: (lineIndex: number, note: Note) => void;
  editNote: (lineIndex: number, noteIndex: number, changes: Partial<Note>) => void;
  removeNote: (lineIndex: number, noteIndex: number) => void;
  addEvent: (lineIndex: number, event: LineEvent) => void;
  editEvent: (lineIndex: number, eventIndex: number, changes: Partial<LineEvent>) => void;
  addLine: (line?: Partial<Line>) => void;
  removeLine: (lineIndex: number) => void;
  // ... etc
}
```

**What this replaces:**
- `phichain-editor/src/editing/command/` (the entire command directory — `note.rs`, `event.rs`, `line.rs`, `mod.rs`, `CommandSequence`, etc.)
- `phichain-editor/src/editing/history.rs`
- `phichain-editor/src/editing/mod.rs` (the `DoCommandEvent` system)

The current editor uses a custom command pattern where every edit (create note, edit event, move line) is an `EditorCommand` enum variant that implements `undo()` and `redo()`. With Zustand + Immer, you get this for free — every state mutation is automatically diffable and reversible.

#### B. Editor Store (`src/stores/editorStore.ts`)

```typescript
interface EditorState {
  // Selection
  selectedLineId: string | null;
  selectedNoteIds: Set<string>;
  selectedEventIds: Set<string>;
  
  // Current tool
  activeTool: EditorTool;   // 'select' | 'placeTap' | 'placeDrag' | etc.
  
  // Timeline settings
  timelineZoom: number;
  density: number;          // Beat grid subdivision (4 = quarter notes)
  lanes: number;            // Number of vertical lane guides
  noteSideFilter: 'all' | 'above' | 'below';
  
  // Playback
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
}
```

**What this replaces:**
- `phichain-editor/src/selection.rs` (SelectedLine, Selected component, SelectEvent)
- `phichain-editor/src/timeline/settings.rs` (TimelineSettings resource)
- `phichain-editor/src/timing.rs` (ChartTime, Paused, timing systems)
- `phichain-editor/src/editing/tool.rs` (from the previous plan — now built-in from the start)

#### C. Settings Store (`src/stores/settingsStore.ts`)

Persistent settings saved to disk via Tauri's filesystem API.

**What this replaces:** `phichain-editor/src/settings/mod.rs` (EditorSettings, AudioSettings, GameSettings, etc.)

---

### Phase 4: Game Preview Canvas

**Goal:** Recreate the live game preview using HTML5 Canvas, so you can see your chart playing in real time.

#### A. Game Renderer (`src/canvas/gameRenderer.ts`)

The core rendering loop. Here's what the current Bevy code actually does, stripped of all the ECS:

1. **For each line:** evaluate all its events at the current beat → get position (x,y), rotation, opacity, speed
2. **Draw the line:** a horizontal white rectangle, rotated and positioned, with the computed opacity
3. **For each note on that line:** calculate its Y position using the speed integral (`distance_at` function), then draw the note sprite at (note.x, calculated_y), rotated if the note is below the line
4. **For hold notes:** draw the body as a stretched sprite between the start and end Y positions, plus head and tail pieces
5. **Draw UI overlay:** score, combo counter, song name, level — all text

Porting this to Canvas2D:

```typescript
class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private noteSprites: Record<string, HTMLImageElement>;  // tap, drag, hold, flick images
  
  render(chart: ChartState, currentTime: number, viewport: DOMRect) {
    this.ctx.clearRect(0, 0, viewport.width, viewport.height);
    
    const beat = bpmList.beatAt(currentTime);
    
    for (const line of chart.lines) {
      // 1. Evaluate events to get line state
      const lineState = evaluateLineEvents(line.events, beat);
      
      // 2. Draw line
      this.ctx.save();
      this.ctx.translate(/* lineState.x mapped to viewport */);
      this.ctx.rotate(lineState.rotation);
      this.ctx.globalAlpha = lineState.opacity;
      this.ctx.fillRect(/* line rectangle */);
      
      // 3. Draw notes
      for (const note of line.notes) {
        const y = this.calculateNoteY(line.events, note, currentTime);
        this.drawNote(note, y);
      }
      
      this.ctx.restore();
    }
  }
  
  // This is the `distance_at` function from core.rs — the heart of note positioning
  private calculateNoteY(events: LineEvent[], note: Note, currentTime: number): number {
    // Integrate speed events from current time to note time
    // (40 lines of math, ported directly from the Rust version)
  }
}
```

**What this replaces:**
- `phichain-game/src/core.rs` (450 lines — all the Bevy systems for note/line updating)
- `phichain-game/src/hit_effect.rs` (250 lines — particle effects)
- `phichain-game/src/ui.rs` (280 lines — score/combo text)
- `phichain-game/src/illustration.rs` (background image)
- `phichain-game/src/line.rs`, `layer.rs`, `scale.rs`, `constants.rs`
- `phichain-editor/src/tab/game/mod.rs` and `core.rs`

Total: ~2,200 lines of Bevy ECS code → ~600-800 lines of Canvas2D code. The math stays identical, the Bevy plumbing disappears.

#### B. Easing Functions (`src/canvas/easings.ts`)

Direct port of the 30 easing functions from `phichain-chart/src/easing.rs`:

```typescript
// ============================================================
// Easing functions — direct port from phichain-chart
// See https://easings.net/ for visual reference
// ============================================================

type EasingFn = (t: number) => number;

const easings: Record<string, EasingFn> = {
  linear: (t) => t,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInQuad: (t) => t * t,
  // ... all 30 variants including Custom (cubic bezier) and Steps
};
```

**What this replaces:** `phichain-chart/src/easing.rs` (200 lines). The TypeScript version is shorter because we don't need the Bevy/serde derives.

---

### Phase 5: Timeline Canvas

**Goal:** Rebuild the timeline — the central editing workspace where you see and place notes/events.

#### A. Timeline Renderer (`src/canvas/timelineRenderer.ts`)

The timeline is a custom Canvas2D view (not DOM elements) because it needs to render hundreds of notes smoothly. What it draws:

1. **Beat grid lines** — horizontal lines at each beat/subdivision, with beat numbers
2. **Lane guides** — vertical lines dividing the note placement area
3. **Notes** — sprite images (tap, drag, hold, flick) at their (x, beat) positions
4. **Events** — colored rectangles in their respective columns (X, Y, Rot, Opacity, Speed)
5. **The indicator** — a horizontal line showing the current playback time
6. **Selection highlights** — colored outlines around selected notes/events
7. **Drag selection box** — when the user click-drags to select multiple items
8. **Ghost note preview** — semi-transparent note showing where a click would place

**What this replaces:**
- `phichain-editor/src/timeline/note.rs` (340 lines — note rendering + interaction)
- `phichain-editor/src/timeline/event.rs` (similar size — event rendering)
- `phichain-editor/src/timeline/mod.rs` (380 lines — beat lines, indicator, separators)
- `phichain-editor/src/timeline/container.rs` (timeline allocation)
- `phichain-editor/src/timeline/drag_selection.rs` (selection box)
- `phichain-editor/src/tab/timeline/mod.rs` (120 lines — scroll/zoom handling)

#### B. Timeline Interaction Layer (`src/components/Timeline/TimelineInteraction.tsx`)

A transparent React overlay on top of the canvas that handles:
- **Click to select** notes/events (with Ctrl+click for multi-select)
- **Click to place** notes when a placement tool is active
- **Drag to select** (rectangle selection)
- **Scroll to seek** (vertical scroll moves playback time)
- **Ctrl+scroll to zoom** (adjusts timeline zoom)
- **Arrow keys to move** selected notes/events

**What this replaces:**
- `phichain-editor/src/editing/create_note.rs` (175 lines)
- `phichain-editor/src/editing/create_event.rs` (165 lines)
- `phichain-editor/src/editing/moving.rs` (170 lines)
- `phichain-editor/src/editing/delete_selected.rs`
- `phichain-editor/src/timeline/drag_selection.rs`

#### C. Spectrogram Display

The spectrogram (audio waveform visualization) computation stays in Rust (it uses FFT which is faster there) — the Tauri command returns raw data and the Canvas renders it.

**What this replaces:** `phichain-editor/src/spectrogram.rs` (294 lines). The FFT computation moves to a Tauri command; the rendering becomes a few lines of Canvas code.

---

### Phase 6: UI Panels (React Components)

**Goal:** Build all the editor panels as proper React components with real CSS styling.

#### A. Toolbar (`src/components/Toolbar/Toolbar.tsx`)

A vertical panel with icon buttons for each tool: Select, Tap, Drag, Flick, Hold, Transition Event, Constant Event, Eraser. CSS hover effects, active state highlighting, keyboard shortcut badges.

**What this replaces:** Nothing — this is NEW. The current editor has no toolbar (it's keyboard-only). This was Phase 1 of the previous plan.

#### B. Line List (`src/components/LineList/LineList.tsx`)

A tree view with:
- Color-coded line swatches
- Drag-to-reorder via `@dnd-kit`
- Search/filter text input
- Collapsible parent-child groups
- Right-click context menu (add child, move to root, delete)
- Click to select

```tsx
// Each line row shows: color dot, name (editable), note count, event count
// Selected line is highlighted; click to select; drag to reorder
```

**What this replaces:** `phichain-editor/src/tab/line_list.rs` (475 lines of egui manual rendering). The React version will be significantly shorter and far more feature-rich.

#### C. Inspector (`src/components/Inspector/`)

Context-sensitive property panel:
- **Single note selected:** Shows note type icon, beat (editable), x position (editable), above/below toggle, speed (editable), hold duration if hold
- **Single event selected:** Shows event type, start/end beat, value type (transition/constant), start/end values, easing curve selector with visual preview
- **Multiple notes:** Batch operations (flip X, flip side, convert type, adjust speed)
- **Multiple events:** Batch operations (negate values)
- **Nothing selected:** Shows the selected line's properties (name, color, note/event summary)

**What this replaces:**
- `phichain-editor/src/tab/inspector/mod.rs` (100 lines)
- `phichain-editor/src/tab/inspector/single_note.rs` (80 lines)
- `phichain-editor/src/tab/inspector/single_event.rs` (similar)
- `phichain-editor/src/tab/inspector/multiple_notes.rs`
- `phichain-editor/src/tab/inspector/multiple_events.rs`
- `phichain-editor/src/tab/inspector/line.rs`
- `phichain-editor/src/tab/inspector/curve_note_track.rs`

#### D. Timeline Settings (`src/components/TimelineSettings/`)

Clean form with labeled inputs: zoom slider, density dropdown, lane count, note side filter (All/Above/Below), spectrogram toggle + opacity slider, timeline management (add/remove/reorder).

**What this replaces:** `phichain-editor/src/tab/timeline_setting.rs` (190 lines).

#### E. BPM List Editor (`src/components/BpmList/`)

**What this replaces:** `phichain-editor/src/tab/bpm_list.rs` (100 lines).

#### F. Chart Settings (`src/components/ChartSettings/`)

**What this replaces:** `phichain-editor/src/tab/chart_basic_setting.rs` (85 lines).

#### G. Settings Panel (`src/components/Settings/`)

**What this replaces:** `phichain-editor/src/tab/settings/` (all files in this directory, ~500 lines total).

---

### Phase 7: Audio System

**Goal:** Replace Bevy's Kira audio with Web Audio API for playback, seeking, and rate control.

#### A. Audio Engine (`src/audio/audioEngine.ts`)

Using Howler.js (a mature Web Audio API wrapper):

```typescript
class AudioEngine {
  private howl: Howl;
  private startTime: number = 0;
  
  load(audioPath: string): Promise<void> { /* ... */ }
  play(): void { /* ... */ }
  pause(): void { /* ... */ }
  seek(time: number): void { /* ... */ }
  setRate(rate: number): void { /* ... */ }  // 0.25x to 1.0x
  getCurrentTime(): number { /* ... */ }
  getDuration(): number { /* ... */ }
}
```

**What this replaces:**
- `phichain-editor/src/audio.rs` (150 lines)
- `phichain-editor/src/timing.rs` (160 lines)
- `phichain-editor/src/hit_sound.rs` (50 lines)
- `phichain-editor/src/metronome.rs` (65 lines)
- `phichain-game/src/audio.rs` (65 lines)

#### B. Hit Sound System

Play short sound effects when notes pass the judgment line during playback.

**What this replaces:** `phichain-editor/src/hit_sound.rs`

#### C. Metronome

Play a click sound on each beat during playback.

**What this replaces:** `phichain-editor/src/metronome.rs`

---

### Phase 8: Hotkey System

**Goal:** Full keyboard shortcut support with discoverability.

#### A. Hotkey Manager (`src/hooks/useHotkeys.ts`)

Using `react-hotkeys-hook`:

```typescript
// ============================================================
// CONFIGURABLE: All keyboard shortcuts defined here
// Users can override these in settings
// ============================================================
const DEFAULT_HOTKEYS = {
  // Tools
  'phichain.selectTool':   { key: 'v',     modifiers: [] },
  'phichain.placeTap':     { key: 'q',     modifiers: [] },
  'phichain.placeDrag':    { key: 'w',     modifiers: [] },
  'phichain.placeFlick':   { key: 'e',     modifiers: [] },
  'phichain.placeHold':    { key: 'r',     modifiers: [] },
  
  // Editing
  'phichain.undo':         { key: 'z',     modifiers: ['ctrl'] },
  'phichain.redo':         { key: 'z',     modifiers: ['ctrl', 'shift'] },
  'phichain.delete':       { key: 'Delete', modifiers: [] },
  'phichain.selectAll':    { key: 'a',     modifiers: ['ctrl'] },
  
  // Navigation
  'phichain.moveUp':       { key: 'ArrowUp',    modifiers: [] },
  'phichain.moveDown':     { key: 'ArrowDown',  modifiers: [] },
  'phichain.moveLeft':     { key: 'ArrowLeft',  modifiers: [] },
  'phichain.moveRight':    { key: 'ArrowRight', modifiers: [] },
  
  // Playback
  'phichain.playPause':    { key: ' ',     modifiers: [] },
  'phichain.save':         { key: 's',     modifiers: ['ctrl'] },
  
  // Action panel
  'phichain.actionPanel':  { key: 'k',     modifiers: ['ctrl'] },
};
```

**What this replaces:**
- `phichain-editor/src/hotkey/mod.rs` (280 lines)
- `phichain-editor/src/hotkey/modifier.rs` (65 lines)
- `phichain-editor/src/hotkey/record.rs` (65 lines)
- All the `.add_hotkey()` calls scattered across `create_note.rs`, `create_event.rs`, `moving.rs`, `selection.rs`, `zoom.rs`, etc.

#### B. Action Panel (`src/components/ActionPanel/`)

A VS Code-style command palette (Ctrl+K) showing all actions with their shortcuts.

**What this replaces:** `phichain-editor/src/tab/action_panel.rs` (230 lines).

#### C. Hotkey Reference Tab (`src/components/HotkeyReference/`)

A searchable table showing all shortcuts, grouped by category.

**What this replaces:** Nothing — this is NEW (was Phase 6 of the previous plan).

---

### Phase 9: Clipboard, Drag-and-Drop, Polish

**Goal:** Final features and polish.

#### A. Clipboard (`src/hooks/useClipboard.ts`)

Copy/paste notes and events, including cross-line paste.

**What this replaces:** `phichain-editor/src/editing/clipboard/` (all files, ~200 lines).

#### B. Autosave (`src/hooks/useAutosave.ts`)

**What this replaces:** `phichain-editor/src/autosave/` (both files, ~200 lines).

#### C. Export

Export to Official format — calls the Rust backend.

**What this replaces:** `phichain-editor/src/export.rs` (120 lines).

#### D. Localization (i18n)

Use `react-i18next` with the same YAML translation files (or convert to JSON).

**What this replaces:**
- `phichain-editor/src/translation.rs`
- `phichain-editor/src/l10n/` (both files)
- `phichain-editor/lang/en_us.yml`, `zh_cn.yml`, `ja_jp.yml` (these get converted to JSON for react-i18next)

#### E. Home Screen

Modern landing page with recent projects, create new project form, settings access.

**What this replaces:** `phichain-editor/src/home.rs` (380 lines of egui manual layout).

#### F. Onboarding

First-run welcome dialog explaining the editor, tool tips on hover.

**What this replaces:** Nothing — NEW.

---

## Complete Migration Map

### Rust Backend (stays/adapts)

| Old File | New Location | Change |
|----------|-------------|--------|
| `phichain-chart/` (entire crate) | `src-tauri/phichain-chart/` | **Unchanged** — remove `bevy` feature flag |
| `phichain-compiler/` (entire crate) | `src-tauri/phichain-compiler/` | **Unchanged** |
| `phichain-converter/` (entire crate) | `src-tauri/phichain-converter/` | **Unchanged** |
| `phichain-editor/src/spectrogram.rs` | `src-tauri/src/spectrogram.rs` | **Adapted** — FFT stays in Rust, returns raw data |
| (new) | `src-tauri/src/commands.rs` | **New** — Tauri command wrappers |
| (new) | `src-tauri/src/main.rs` | **New** — Tauri app entry point |

### Frontend (rewritten in React+TS)

| Old Rust File(s) | New TS/React File | Phase |
|-------------------|-------------------|-------|
| `main.rs` (ui_system, menu bar, status bar) | `App.tsx`, `MenuBar.tsx`, `StatusBar.tsx` | 2 |
| `layout/` (6 files) | `App.tsx` (react-mosaic config) | 2 |
| `editing/command/` + `editing/history.rs` | `stores/chartStore.ts` (Zustand+Immer) | 3 |
| `selection.rs` | `stores/editorStore.ts` | 3 |
| `timing.rs` | `stores/audioStore.ts` + `audio/audioEngine.ts` | 3, 7 |
| `timeline/settings.rs` | `stores/editorStore.ts` | 3 |
| `tab/game/` + `phichain-game/src/core.rs` | `canvas/gameRenderer.ts` | 4 |
| `phichain-chart/src/easing.rs` | `canvas/easings.ts` | 4 |
| `phichain-game/src/` (all 2,200 lines) | `canvas/gameRenderer.ts` (~700 lines) | 4 |
| `timeline/note.rs`, `event.rs`, `mod.rs` | `canvas/timelineRenderer.ts` | 5 |
| `timeline/container.rs`, `drag_selection.rs` | `components/Timeline/` | 5 |
| `tab/timeline/mod.rs` | `components/Timeline/` | 5 |
| `editing/create_note.rs` | `components/Timeline/TimelineInteraction.tsx` | 5 |
| `editing/create_event.rs` | `components/Timeline/TimelineInteraction.tsx` | 5 |
| `editing/moving.rs` | `components/Timeline/TimelineInteraction.tsx` | 5 |
| `tab/line_list.rs` | `components/LineList/` | 6 |
| `tab/inspector/` (7 files) | `components/Inspector/` | 6 |
| `tab/timeline_setting.rs` | `components/TimelineSettings/` | 6 |
| `tab/bpm_list.rs` | `components/BpmList/` | 6 |
| `tab/chart_basic_setting.rs` | `components/ChartSettings/` | 6 |
| `tab/settings/` (multiple files) | `components/Settings/` | 6 |
| `tab/quick_action.rs` | `components/QuickActionBar.tsx` | 2 |
| `audio.rs`, `hit_sound.rs`, `metronome.rs` | `audio/audioEngine.ts` | 7 |
| `hotkey/` (3 files) | `hooks/useHotkeys.ts` | 8 |
| `tab/action_panel.rs` | `components/ActionPanel/` | 8 |
| `editing/clipboard/` | `hooks/useClipboard.ts` | 9 |
| `autosave/` | `hooks/useAutosave.ts` | 9 |
| `export.rs` | IPC call to Rust backend | 9 |
| `home.rs` | `components/Home/` | 9 |
| `settings/mod.rs` | `stores/settingsStore.ts` | 3 |
| `ui/` (widgets, sides, etc.) | Standard React components + CSS | All |

### Files That Simply Go Away

These files exist purely because of Bevy/egui and have no equivalent in the new architecture:

| File | Why It Disappears |
|------|-------------------|
| `schedule.rs` | Bevy system scheduling — React doesn't need this |
| `identifier.rs` | Custom string ID system for egui_dock tabs — React has native keys |
| `graphics.rs` | Bevy render pipeline config — not applicable |
| `fps.rs` | Bevy frame time diagnostics — browser DevTools covers this |
| `ime.rs` | egui IME workaround — browsers handle IME natively |
| `misc.rs` | Bevy working directory setup — Tauri handles this |
| `notification.rs` | egui toast wrapper — use `react-toastify` |
| `file.rs` | Bevy async file picking — Tauri's dialog API |
| `zoom.rs` | Bevy camera zoom — CSS transform on the game canvas |
| `screenshot.rs` | Bevy screenshot capture — canvas.toDataURL() |
| `telemetry/` (2 files) | Can be rebuilt if needed, but not essential |
| `logging.rs` | Bevy log plugin — console.log / Tauri log |
| `recent_projects.rs` | Simple enough to inline in Home component |
| `ui/compat.rs` | egui compatibility shims — not needed |
| `ui/latch.rs` | egui state latching hack — React state handles this |
| `utils/` (5 files) | Bevy-specific utilities — not applicable |
| `events/` (5 files) | Bevy observer/trigger patterns — React callbacks |

---

## Implementation Priority

| Priority | Phase | Description | Estimated Size | Depends On |
|----------|-------|-------------|---------------|------------|
| 1 | 0 | Project scaffolding | 1 day | — |
| 2 | 1 | TS types + Tauri commands | 2-3 days | Phase 0 |
| 3 | 3 | State management + undo | 2-3 days | Phase 1 |
| 4 | 2 | Docking layout + empty panels | 2 days | Phase 0 |
| 5 | 4 | Game preview canvas | 3-4 days | Phase 1, 3 |
| 6 | 5 | Timeline canvas + interaction | 5-7 days | Phase 1, 3, 4 |
| 7 | 7 | Audio system | 2 days | Phase 3 |
| 8 | 6 | All UI panels | 5-7 days | Phase 3, 5 |
| 9 | 8 | Hotkey system | 2 days | Phase 6 |
| 10 | 9 | Clipboard, autosave, export, i18n, polish | 3-5 days | All above |

**Total estimated effort: 4-6 weeks** for one developer working full-time. The phases are designed so you can test each one independently — after Phase 5, you have a functional editor (just without all the polish).

---

## Key Risks and Mitigations

**Risk: Audio timing precision**
Web Audio API has slightly higher latency than native audio (Kira). For a chart editor (not a player), this is acceptable — you're previewing, not playing for score. If latency is noticeable, use `AudioContext.currentTime` for synchronization instead of `requestAnimationFrame` timestamps.

**Risk: Canvas rendering performance with many notes**
Charts can have 1,000+ notes. Canvas2D handles this fine (games like Osu!Lazer's web version render far more). If performance becomes an issue, switch the renderers to WebGL (via PixiJS) — the rendering API changes but the math stays identical.

**Risk: Beat math precision in JavaScript**
JavaScript's `number` type is 64-bit float, which can accumulate rounding errors with beat fractions. Mitigation: use the Rust backend for all serialization/deserialization (so the authoritative beat values always use `Rational32`), and in the frontend, use a simple rational number class or the `fraction.js` npm package for beat arithmetic.

**Risk: Large chart file I/O**
Chart files can be multi-MB JSON. Tauri's IPC serializes/deserializes this every time. Mitigation: keep the full chart in the Rust backend and only send diffs or individual line data to the frontend when needed. Or accept the ~5ms overhead of JSON parsing a 2MB file — it's negligible.

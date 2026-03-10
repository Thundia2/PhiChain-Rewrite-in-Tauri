# PhiChain Editor — Ultimate UI Overhaul Plan

---

## What's Wrong Now (The Problem Both Plans Agree On)

Your editor currently splits work across **3+ disconnected views:**

1. **LineList panel** — pick a judgment line from a sidebar list
2. **Timeline panel** — shows notes for only that ONE selected line, no events
3. **"Adjust Events" button** → opens a **separate tab** (`LineEventEditor`) with its own canvas (`EventCanvas`), keyframe strip (`KeyframeStrip`), inspector (`EventInspector`), and preview (`EventPreview`)
4. **GamePreview panel** — shows what the chart looks like, but is read-only (only supports clicking a line to select it — see `GamePreview.tsx` line 185-208)

If your chart has 20 lines, you're constantly bouncing between the line list, the timeline, and separate event editor tabs. Each line's events live in complete isolation. You can't see how Line 3's notes relate to Line 7's movement.

**What you want:** A single workspace where you can see judgment lines as they appear in-game, click them, place notes on them, adjust their position/rotation, and edit their events — all without leaving the view.

---

## The Two Approaches (And Why One Wins)

**Plan A proposed:** A DAW-style stacked-lane timeline. Each judgment line gets its own vertical column. Notes are shown in lanes. Events are shown as sub-rows beneath each lane. This modifies the existing `Timeline.tsx` and `timelineRenderer.ts`.

**Plan B proposed:** A unified game-canvas editor. You edit directly on the game preview — the same view the player sees. Lines are clickable and draggable. Notes are placed by clicking near a line. A keyframe bar at the bottom handles event timing. This creates a new tab type alongside the existing views.

### The Verdict: Plan B's Unified Canvas Wins (With Plan A Enhancements)

**Why:** You're making a Phigros chart editor. The whole point is to control how judgment lines look and move *in the game*. Editing directly on the game view is fundamentally the right UX — you're editing what the player sees. A DAW lane view is great for audio, but Phigros charts are *spatial* — lines have X/Y positions, rotations, and notes fall toward them in 2D space. A lane-based timeline flattens all that spatial information into abstract rows.

That said, Plan A had several ideas that genuinely improve Plan B:

| Taken from Plan A | Why it's valuable |
|---|---|
| Detailed `editorStore` field specifications | Plan B was vague about exact state shape |
| Performance warnings (30+ lines at 60fps, culling) | Plan B didn't address performance at all |
| Scroll conflict resolution (vertical vs horizontal input mapping) | Important UX detail Plan B overlooked |
| Event sub-row visualization concept | Enhanced into the keyframe bar's multi-lane view |
| Risk analysis (selection ambiguity, undo/redo) | Plan B assumed everything would "just work" |

What we **don't** take from Plan A: the stacked lane layout as the primary editing view. It's not how you edit a spatial rhythm game chart.

---

## The Architecture

### Core Principle: New Tab, Old Code Untouched

The unified editor is a **new tab type** (`unified_editor`). The existing mosaic layout (`chart` tab), `Timeline.tsx`, `LineEventEditor/`, `GamePreview.tsx`, and all other components remain completely untouched. Both views share the same `chartStore`, `editorStore`, `audioStore`.

This means:
- Zero risk of breaking existing functionality
- You can have both tabs open simultaneously
- If something in the new view isn't working yet, switch to classic view
- Eventually, once the unified editor is mature, the classic view can become a fallback

```typescript
// tabStore.ts — add one new type
type TabType = "home" | "chart" | "settings" | "line_event_editor" | "panel" | "unified_editor";
```

### RenderResult: The Key Architectural Insight

The `GameRenderer` already renders all lines with their correct screen positions (see `gameRenderer.ts` line 262-268 — it computes `screenX`, `screenY`, then calls `ctx.translate` and `ctx.rotate`). But that positional data is thrown away after rendering. The key insight: **collect it during the render pass and return it** so post-render code can do hit-testing without re-evaluating all events.

```typescript
// Added to gameRenderer.ts
interface RenderResult {
  lines: {
    lineIndex: number;
    screenX: number;       // pixel X of line center on canvas
    screenY: number;       // pixel Y of line center on canvas
    rotation: number;      // radians (from state.rotation)
    opacity: number;       // 0-1
    scaleX: number;
    scaleY: number;
    notes: {
      noteIndex: number;
      screenX: number;     // absolute pixel X of note center
      screenY: number;     // absolute pixel Y of note center
      width: number;       // rendered width in pixels
      height: number;      // rendered height in pixels
      kind: NoteKind;
      above: boolean;
      beat: number;        // float beat value
    }[];
  }[];
}
```

This is computed inside `renderLine()` (line 247), which already has all the screen-space math. The renderer just needs to append to a results array before each `ctx.restore()`. No new math needed — just capturing what's already being calculated.

---

## The Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Menu Bar                                                     │
├──────────────────────────────────────────────────────────────┤
│  Tab Bar  [Home] [Unified Editor*] [Classic View]            │
├───┬──────────────────────────────────────────────────┬───────┤
│   │  [Line 1] [Line 2*] [Line 3] [Line 4]  [+]     │       │
│ T ├──────────────────────────────────────────────────┤  I    │
│ o │                                                  │  n    │
│ o │                                                  │  s    │
│ l │          UNIFIED CANVAS                          │  p    │
│ b │        (Game Preview +                           │  e    │
│ a │         Editing Overlays +                       │  c    │
│ r │         Handles + Ghost Notes)                   │  t    │
│   │                                                  │  o    │
│   │                                                  │  r    │
│   │                                                  │       │
├───┼──────┬───────────────────────────────────────────┼───────┤
│   │▶ ⏸ ⏹ │ L0 L1 L2 L3 L4 All │ Keyframe Diamonds  │ Beat  │
└───┴──────┴───────────────────────────────────────────┴───────┘
```

- **Left: Vertical Toolbar** (~40px) — Same tools as current: Select (V), Tap (Q), Drag (W), Flick (E), Hold (R), Eraser (X). Translate/rotation is handled by always-visible handles on the selected line, not a separate tool.
- **Top: Line Strip** — Horizontal chips for quick line switching. Click to select, `[+]` to add.
- **Center: Unified Canvas** — The game preview augmented with editing overlays. This is where all the action happens.
- **Right: Inspector Sidebar** (~220px, collapsible with `I` hotkey) — Context-sensitive properties panel.
- **Bottom: Keyframe Bar** (~70px) — Horizontal beat axis with event diamonds, layer tabs, playback controls.

### The Line Drawer (Slide-Out, `L` Hotkey)

For full line management (reordering, renaming, parent-child hierarchy, visibility toggles, lock toggles), a slide-out drawer overlays from the left edge (~220px). The Line Strip at top handles quick selection; the drawer handles everything else.

Why a drawer instead of a permanent panel: screen real estate. The canvas needs maximum space. Line management is an occasional task, not something you do every second.

**Drawer contents:**
- Full line list with drag-to-reorder
- Per-line: name (double-click to rename), note count, event count
- Per-line toggles: visibility (eye icon), lock (lock icon, prevents accidental edits)
- Parent-child hierarchy: lines with `father_index` shown indented
- Right-click context menu: Rename, Delete, Duplicate, Set Parent, Set Group
- Add/Remove buttons at top

---

## Interaction System: The State Machine

All mouse/keyboard interaction on the unified canvas goes through a state machine. This is critical because the same click position can mean different things depending on context (is a placement tool active? is the user hovering over a handle? are they mid-drag?).

```
IDLE
  ├─ click line body/anchor ──────→ SELECT_LINE (update editorStore.selectedLineIndex)
  ├─ click translate handle ──────→ DRAGGING_TRANSLATE
  ├─ click rotation handle ───────→ DRAGGING_ROTATE
  ├─ click note ──────────────────→ SELECT_NOTE (ctrl+click = multi-select)
  ├─ click empty + place tool ────→ PLACING_NOTE
  ├─ click note + eraser tool ────→ DELETE_NOTE (immediate, no drag)
  ├─ drag empty + select tool ────→ DRAG_SELECT (box selection)
  ├─ scroll wheel ────────────────→ SEEK_TIME (scrub playback position)
  ├─ ctrl + scroll wheel ─────────→ ZOOM (centered on cursor)
  └─ middle mouse / space+drag ──→ PAN (move viewport offset)

DRAGGING_TRANSLATE
  ├─ mousemove → update ghost line position (visual only, no store mutation)
  └─ mouseup → commitValue() for X and Y events at current beat → back to IDLE

DRAGGING_ROTATE
  ├─ mousemove → compute angle from line center to cursor, apply snap
  └─ mouseup → commitValue() for rotation event at current beat → back to IDLE

PLACING_NOTE
  └─ click near selected line → compute beat + noteX + above/below
     → chartStore.addNote() → back to IDLE

DRAG_SELECT
  ├─ mousemove → update selection rectangle overlay
  └─ mouseup → find notes within rect (from RenderResult)
     → editorStore.setNoteSelection() → back to IDLE
```

The `commitValue()` logic already exists in `EventCanvas.tsx` (lines 46-94). It either updates an existing constant event, splits a transition event at the current beat, or creates a new constant event. This is directly reused.

### New editorStore Fields

```typescript
// Add to editorStore.ts
interface EditorState {
  // ... all existing fields stay ...

  // === Unified Canvas State ===

  // Interaction
  canvasInteractionMode: 
    | "idle" 
    | "dragging_translate" 
    | "dragging_rotate" 
    | "placing_note" 
    | "drag_selecting" 
    | "dragging_note" 
    | "panning";
  
  // Viewport (zoom and pan for the unified canvas)
  canvasViewport: { 
    offsetX: number;    // pan offset in pixels
    offsetY: number; 
    zoom: number;       // 1.0 = normal, 2.0 = zoomed in 2x
  };

  // Line visibility and locking
  lineVisibility: Record<number, boolean>;  // default: all true
  lineLocked: Set<number>;                  // locked lines can't be edited

  // Note drag state (for moving selected notes)
  noteDragState: { 
    noteIndices: number[]; 
    startBeat: number; 
    startX: number; 
  } | null;

  // Line drawer open/closed
  lineDrawerOpen: boolean;

  // Inspector open/closed
  inspectorOpen: boolean;

  // === Actions ===
  setCanvasInteractionMode: (mode: ...) => void;
  setCanvasViewport: (viewport: Partial<...>) => void;
  resetCanvasViewport: () => void;
  toggleLineVisibility: (index: number) => void;
  toggleLineLocked: (index: number) => void;
  setNoteDragState: (state: ... | null) => void;
  toggleLineDrawer: () => void;
  toggleInspector: () => void;
}
```

---

## Note Placement on the Game Canvas

This is the trickiest part of the unified canvas — converting a screen-space click into a `beat`, `noteX`, and `above/below` value. Here's the detailed math:

### Step 1: Transform Click to Line-Local Coordinates

The renderer draws each line by doing `ctx.translate(screenX, screenY)` then `ctx.rotate(-state.rotation)` (see `gameRenderer.ts` line 267-269). To reverse this:

```typescript
// Given: clickX, clickY (screen pixels), lineState (from RenderResult)
const dx = clickX - lineState.screenX;
const dy = clickY - lineState.screenY;
const cos = Math.cos(lineState.rotation);
const sin = Math.sin(lineState.rotation);

// Transform to line-local coordinates
// localX = position along the line (left/right)
// localY = perpendicular distance from the line (above/below)
const localX = dx * cos + dy * sin;
const localY = -dx * sin + dy * cos;
```

### Step 2: Determine `noteX` and `above/below`

```typescript
// noteX is in chart coordinates (-675 to +675)
// localX is in screen pixels, so convert using the same scale as renderLine
const noteX = (localX / canvasWidth) * CANVAS_WIDTH;

// above = localY < 0 (note is on the side of the line the click was on)
const above = localY < 0;
```

### Step 3: Determine Beat from Distance

Notes approach the line based on the speed-integral distance function (`distanceAt()` in `events.ts` line 393). The visual distance from the line to where the click landed tells us the beat.

The `distanceAt()` function computes cumulative distance by integrating speed events over time. We need the *inverse* — given a distance, find the time (and thus beat). Since `distanceAt()` is monotonically increasing, binary search works:

```typescript
function beatFromScreenDistance(
  pixelDistance: number,      // how far the click is from the line (absolute)
  line: Line,
  currentBeat: number,
  currentTime: number,
  bpmList: BpmList,
  canvasHeight: number,
): number {
  const speedEvents = line.events.filter(e => e.kind === "speed");
  const distanceScale = canvasHeight * (120.0 / 900.0);  // from gameRenderer.ts line 189
  const bpmTimeAt = (beat: Beat) => bpmList.timeAt(beat);
  const currentDistance = distanceAt(speedEvents, currentTime, bpmTimeAt);
  
  // The visual formula from renderLine (line 304):
  //   rawY = (noteDistance - currentDistance) * note.speed * distanceScale
  // We're solving for noteDistance given rawY = pixelDistance:
  const targetDistance = currentDistance + (pixelDistance / distanceScale);
  // (assuming speed=1 for placement; user can adjust after)
  
  // Binary search: find time where distanceAt() ≈ targetDistance
  let lo = currentTime;
  let hi = currentTime + 30; // search up to 30 seconds ahead
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const d = distanceAt(speedEvents, mid, bpmTimeAt);
    if (d < targetDistance) lo = mid;
    else hi = mid;
  }
  
  const noteTime = (lo + hi) / 2;
  return bpmList.beatAtFloat(noteTime);
}
```

Then snap the beat to the grid using the existing `snapBeat()` utility.

### Ghost Note Preview

While hovering with a placement tool active, the canvas draws a semi-transparent note at the snapped position. This already exists for the current timeline (`pendingNote` in `editorStore`, rendered in `gameRenderer.ts` line 397-412). The unified canvas just needs to compute the pending note using the projection math above and pass it through the existing `pendingNote` option.

---

## Event Editing: Handles + Keyframe Bar + Inspector

Events are edited through three cooperating systems:

### 1. Canvas Handles (Direct Manipulation)

When a line is selected, two handles appear on the canvas:
- **Translate handle** (blue circle at line origin) — drag to change X/Y position
- **Rotation handle** (orange circle at line endpoint) — drag to change rotation angle

These already exist and work in `eventCanvasRenderer.ts` (lines 236-296 for drawing, 370-424 for hit-testing). The rendering code and hit-testing code from `EventCanvasRenderer` gets ported into a new overlay pass that runs after the main `GameRenderer.render()` call.

The `commitValue()` logic from `EventCanvas.tsx` (lines 46-94) handles converting a drag result into event mutations:
- If there's an active constant event at the current beat → update its value
- If there's an active transition event → split it at the current beat
- If there's no event → create a new constant event stretching to beat 1000

This logic is reused exactly as-is.

### 2. Keyframe Bar (Timing & Event Overview)

The bottom bar is derived from the existing `KeyframeStrip.tsx` but enhanced:

**Structure:**
```
[▶ ⏸ ⏹ | 0.5x 1x] [L0 L1 L2 L3 L4 All] [====◇====◇====◇========◇===] [Beat: 12.75]
```

- **Left section:** Playback controls (play/pause/stop, speed presets) — taken from `QuickActionBar.tsx`
- **Layer tabs:** L0-L4 switches which event layer is active, "All" shows all layers. This replaces the layer selector that was in `EventEditorToolbar.tsx` (lines 137-176)
- **Diamond strip:** Colored diamonds on a horizontal beat axis, one row per event property. This is the existing `KeyframeStrip` rendering logic (lines 93-175) but enhanced with multiple property lanes visible simultaneously:

```
  X:  ◇═══════◇════════════◇
  Y:  ◇═════════════◇══════◇
  R:  ◇═══◇═══◇═══◇═══◇═══◇
  O:  ◇═══════════════════════
  S:  ◇═══════════════════════
```

Each property row is thin (~12px). Only the 5 core properties (X, Y, R, O, S) are shown by default; extended properties (ScaleX, ScaleY, Color, Text, Incline) appear if the line has events of those types.

**Interactions:**
- Click on the strip to seek (set current beat + audio position)
- Drag to scrub
- Scroll to pan horizontally, ctrl+scroll to zoom the beat axis
- Click a diamond to select that event (shows details in Inspector)
- Right-click a diamond: Delete, Change Easing, Split
- Double-click empty area in a property row: create new keyframe at that beat

This is a major UX enhancement from Plan A's "event sub-rows" idea, adapted to fit Plan B's bottom bar layout. Instead of sub-rows taking vertical space in a timeline, they're compacted into the keyframe bar):

### 3. Inspector Sidebar (Precise Numeric Editing)

The right sidebar (~220px, toggle with `I` hotkey) shows context-sensitive content:

**No selection → Line Properties:**
- Name, z_order, is_cover, bpm_factor
- Texture path, anchor point
- Father (parent line) selector
- Group selector
- Note control systems (pos, alpha, size, skew, y)

**Note(s) selected → Note Properties:**
- Kind (tap/drag/flick/hold), beat, X position, speed
- Side (above/below), hold duration
- RPE properties: fake, y_offset, size, alpha, visible_time
- Multi-note: batch editing when multiple selected

**Event selected (from keyframe bar click) → Event Properties:**
- Start/end beat
- Value (constant or transition start/end)
- Easing type selector (all 29 + bezier + steps + elastic)
- Easing sub-range (easingLeft / easingRight)
- Type toggle (constant ↔ transition)

**Always visible at top → Current Values:**
- Beat display
- Evaluated X, Y, Rotation, Opacity, Speed at current beat
- Clickable to jump to that property in the keyframe bar

This is essentially the existing `EventInspector.tsx` (lines 79-185) and `Inspector.tsx` merged and made context-sensitive.

---

## Viewport Controls

The unified canvas supports zoom and pan for precise editing.

- **Zoom:** Ctrl+scroll, centered on cursor position
- **Pan:** Middle mouse drag, or Space+left-drag
- **Reset:** Home key or double-click empty canvas area
- **Fit All:** `F` key to fit all visible lines in view

Applied as a canvas transform wrapping the entire render:
```typescript
ctx.save();
ctx.translate(viewport.offsetX, viewport.offsetY);
ctx.scale(viewport.zoom, viewport.zoom);
// ... render everything ...
ctx.restore();
// ... draw overlays (handles, selection rect) in screen space ...
```

All hit-testing applies the inverse transform. The `RenderResult` screen positions are in viewport-transformed space, so hit-testing "just works" as long as the overlay drawing and the game rendering use the same transform.

**Important scroll mapping** (from Plan A's risk analysis):
- Vertical scroll = seek through time (change current beat)
- Ctrl+scroll = zoom canvas
- Shift+scroll = horizontal pan (if canvas is panned)
- Middle drag = free pan

This avoids the conflict Plan A identified where vertical and horizontal scroll compete.

---

## View Switching

**Menu bar additions:**
- View → "Unified Editor" (opens/switches to `unified_editor` tab)
- View → "Classic Editor" (opens/switches to classic `chart` tab)

**Default behavior:** New charts open in `unified_editor` tab. A toggle in Settings lets users pick their default.

**Both tabs can coexist.** They share the same stores, so selecting a line in the unified editor instantly reflects in the classic view's LineList and vice versa. Editing a note in either view is immediately visible in the other.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/components/UnifiedCanvas/UnifiedEditorTab.tsx` | The top-level layout component — composes toolbar, line strip, canvas, inspector, and keyframe bar into the flex layout. Rendered when active tab type is `unified_editor`. |
| `src/components/UnifiedCanvas/UnifiedCanvas.tsx` | The main canvas component. Owns the render loop (augmented `GameRenderer` + overlay pass). Handles all mouse/keyboard events and routes them through the interaction state machine. |
| `src/components/UnifiedCanvas/CanvasInteraction.ts` | Pure logic module for the interaction state machine. Exported functions like `handleMouseDown(state, event, renderResult)` that return new state + side effects. No React, no DOM — pure functions for testability. |
| `src/components/UnifiedCanvas/CanvasOverlays.ts` | Rendering functions for editing overlays drawn on top of the game preview: translate/rotate handles, selection rectangles, ghost notes, beat grid ticks along the selected line, line name labels. Derived from `eventCanvasRenderer.ts` handle-drawing code. |
| `src/components/UnifiedCanvas/NoteProjection.ts` | The screen-to-chart coordinate math: click position → (beat, noteX, above). Contains `beatFromScreenDistance()` and the line-local transform. Also contains the inverse for rendering (chart coords → screen position for ghost notes). |
| `src/components/UnifiedCanvas/UnifiedInspector.tsx` | The collapsible right sidebar. Context-sensitive: shows line props, note props, or event props depending on selection. Merges logic from `Inspector.tsx` and `EventInspector.tsx`. |
| `src/components/KeyframeBar/KeyframeBar.tsx` | The bottom bar with playback controls, layer tabs, and multi-property keyframe diamond strip. Derived from `KeyframeStrip.tsx` + `QuickActionBar.tsx` + `EventEditorToolbar.tsx`. |
| `src/components/LineStrip/LineStrip.tsx` | Horizontal chip strip at the top of the canvas. Each chip = a line name. Click to select, shows note count badge. `[+]` button to add lines. |
| `src/components/LineDrawer/LineDrawer.tsx` | Slide-out panel (~220px) from the left. Full line management: reorder, rename, parent hierarchy, visibility/lock toggles, group assignment. Toggle with `L` hotkey. |

## Files to Modify

| File | Changes |
|---|---|
| `src/canvas/gameRenderer.ts` | Add `RenderResult` return type to `render()`. Inside `renderLine()`, after computing `screenX`/`screenY`/`rotation`/`opacity`, push to a results array. Note positions are collected after the screen-space transforms (lines 264-306 already have all the math). |
| `src/stores/editorStore.ts` | Add the new fields: `canvasInteractionMode`, `canvasViewport`, `lineVisibility`, `lineLocked`, `noteDragState`, `lineDrawerOpen`, `inspectorOpen`, and their actions. |
| `src/stores/tabStore.ts` | Add `"unified_editor"` to the `TabType` union. Add `openUnifiedEditor()` convenience method. |
| `src/types/editor.ts` | Add `"unified_editor"` to `TabType`. Add interaction mode types. |
| `src/App.tsx` | Add rendering path: when `activeTab.type === "unified_editor"`, render `<UnifiedEditorTab />`. (~5 lines of change around line 310-363.) |
| `src/components/MenuBar/MenuBar.tsx` | Add "Unified Editor" and "Classic Editor" menu items under a "View" menu. |
| `src/components/Settings/SettingsPage.tsx` | Add "Default editor view" setting (unified vs classic). |

## Files NOT Modified (Classic View Preserved)

Every existing component remains untouched:

| File | Status |
|---|---|
| `src/components/Timeline/Timeline.tsx` | Kept as-is |
| `src/components/LineEventEditor/*.tsx` (all 5 files) | Kept as-is |
| `src/components/LineList/LineList.tsx` | Kept as-is |
| `src/components/GamePreview/GamePreview.tsx` | Kept as-is |
| `src/components/GamePreview/GamePreviewTab.tsx` | Kept as-is |
| `src/components/Inspector/Inspector.tsx` | Kept as-is |
| `src/canvas/eventCanvasRenderer.ts` | Kept as-is (code ported from it, not moved) |
| `src/canvas/timelineRenderer.ts` | Kept as-is |

## Files Guaranteed Unchanged (RPE Compatibility)

| File | Why |
|---|---|
| `src/types/chart.ts` | Data model untouched — `PhichainChart`, `Line`, `Note`, `LineEvent`, `EventLayer` all stay exactly the same |
| `src/stores/chartStore.ts` | All mutation methods (`addNote`, `editEvent`, `replaceEvent`, `addEventToLayer`, etc.) unchanged — the new UI calls the same methods |
| `src/stores/audioStore.ts` | Audio engine completely separate from UI |
| `src/canvas/events.ts` | Event evaluation (`evaluateLineEventsWithLayers`, `distanceAt`) is read-only logic |
| `src/canvas/easings.ts` | Easing math is pure functions |
| `src/utils/rpeImport.ts` | Import parsing unchanged |
| `src/utils/rpeExport.ts` | Export serialization unchanged |
| `src/utils/beat.ts` | Beat math utilities unchanged |

---

## Implementation Phases

### Phase 1: Foundation — RenderResult + Tab Shell

**Goal:** A new tab exists, shows the game preview, and you can click to select lines.

**Changes:**
1. Modify `gameRenderer.ts` → `render()` now returns `RenderResult`. Inside `renderLine()`, after computing `screenX`/`screenY`/`rotation`/`opacity`, push to a results array. Note positions are collected after the screen-space transforms.
2. Add `unified_editor` tab type to `tabStore.ts` and `editor.ts`
3. Create `UnifiedEditorTab.tsx` — flex layout shell with placeholder areas for toolbar, line strip, canvas, inspector, keyframe bar
4. Create `UnifiedCanvas.tsx` — render loop using augmented `GameRenderer`, plus basic click-to-select-line using `RenderResult` for hit-testing
5. Add the rendering path in `App.tsx` (~5 lines)
6. Add "Unified Editor" to the menu bar

**Verification:** Open the unified editor tab. See the game preview. Click a line — it gets selected (confirm via the existing green anchor marker). Switch to classic view tab — confirm it still works. No store changes needed yet.

### Phase 2: Canvas Interaction — Handles + Note Placement

**Goal:** You can move/rotate lines and place notes directly on the canvas.

**Changes:**
1. Create `CanvasOverlays.ts` — port handle drawing code from `eventCanvasRenderer.ts` (lines 236-296). Draw handles on the selected line as an overlay pass after the game render.
2. Create `CanvasInteraction.ts` — implement the state machine for `IDLE → DRAGGING_TRANSLATE`, `IDLE → DRAGGING_ROTATE`. On mouseup, call `commitValue()` logic (ported from `EventCanvas.tsx` lines 46-94).
3. Create `NoteProjection.ts` — implement `beatFromScreenDistance()` and the line-local coordinate transform. Add ghost note preview.
4. Add placement tool interaction: when a place tool is active and user clicks near the selected line, use NoteProjection to compute beat/X/above, then call `chartStore.addNote()`.
5. Add viewport zoom/pan (ctrl+scroll, middle-drag).
6. Add new `editorStore` fields: `canvasInteractionMode`, `canvasViewport`.

**Verification:** Select a line → see translate/rotate handles. Drag translate handle → line moves, event created (check via classic view Inspector). Switch to Tap tool → hover near line, see ghost note. Click → note placed (verify beat/X are correct). Ctrl+scroll → canvas zooms. Undo → changes revert.

### Phase 3: Keyframe Bar + Event Editing

**Goal:** Full event timeline with layer switching and keyframe interaction.

**Changes:**
1. Create `KeyframeBar.tsx` — horizontal bar with:
   - Playback controls (from `QuickActionBar.tsx`)
   - Layer tabs L0-L4 + All (from `EventEditorToolbar.tsx` lines 137-176)
   - Multi-property keyframe diamond strip (from `KeyframeStrip.tsx` lines 42-205, enhanced with multiple property rows)
2. Wire canvas handle drags to event creation using `commitValue()`
3. Keyframe bar click = seek (set current beat + audio position)
4. Keyframe bar diamond click = select event (store selection in editorStore)
5. Right-click diamond context menu: Delete, Change Easing
6. Double-click empty area in property row: create new keyframe

**Verification:** Select a line → keyframe bar shows its events as colored diamonds. Click to seek — canvas updates, audio seeks. Create events via handle dragging → diamonds appear. Click a diamond → see it highlighted. Switch layers → diamonds filter. Export as RPE JSON → re-import → identical.

### Phase 4: Line Management + Inspector

**Goal:** Complete line management and detailed property editing.

**Changes:**
1. Create `LineStrip.tsx` — horizontal chips with line names, click to select, `[+]` to add
2. Create `LineDrawer.tsx` — slide-out panel with full line management (reorder, rename, parent hierarchy, visibility, lock, groups)
3. Create `UnifiedInspector.tsx` — collapsible right sidebar, context-sensitive:
   - No selection → line properties (name, z_order, is_cover, bpm_factor, texture, anchor, father, group, note controls)
   - Note selected → note properties (kind, beat, x, speed, side, hold, fake, y_offset, size, alpha, visible_time)
   - Event selected → event properties (start/end beat, value, easing type/subrange, constant/transition toggle)
4. Add keyboard shortcuts: `L` for drawer, `I` for inspector
5. Add `lineDrawerOpen`, `inspectorOpen`, `lineVisibility`, `lineLocked` to editorStore

**Verification:** Click chips in line strip → line changes. Open drawer → see all lines, drag to reorder, toggle visibility → hidden lines disappear from canvas. Open inspector → see correct properties for current selection. Edit a note property → changes reflect in canvas.

### Phase 5: Polish + Advanced Features

**Goal:** Full feature parity with the classic view, plus new capabilities.

**Changes:**
1. Drag-select for notes on canvas (box selection using RenderResult)
2. Note dragging (move selected notes in time/position)
3. Eraser tool interaction (click note on canvas → delete)
4. Cursor changes (move cursor over translate handle, grab over rotation handle, crosshair for placement tools)
5. Hover feedback (line highlight on hover, note highlight on hover)
6. Selection highlighting (selected notes glow, selection count badge)
7. Animations for drawer/inspector slide in/out
8. "Fit All" (`F` key) to auto-zoom to show all content
9. View menu completeness (both entries)
10. Default editor view setting in SettingsPage
11. Status bar at bottom showing note count, event count, line count

**Verification:** Full end-to-end workflow: create chart → add lines → position them → place notes → add events → play back → export → re-import → identical result. Confirm ALL RPE features are accessible somewhere in the UI.

---

## RPE Compatibility Checklist

Since the data model is completely untouched, RPE compatibility comes down to making sure every feature has a UI access point somewhere in the unified editor:

- [ ] All 5 event layers editable (layer tabs in keyframe bar + layer selector in inspector)
- [ ] All 10 event types: X, Y, Rotation, Opacity, Speed + ScaleX, ScaleY, Color, Text, Incline (keyframe bar shows all, inspector edits all)
- [ ] All 29 easing types + bezier + steps + elastic (easing picker in inspector when event selected)
- [ ] Easing sub-range: easingLeft / easingRight (fields in inspector)
- [ ] Event gap handling (synthetic constant events — renderer logic in `events.ts`, unchanged)
- [ ] Parent-child hierarchy: father_index, rotateWithFather (line drawer + inspector)
- [ ] Note control systems: pos, alpha, size, skew, y (inspector when line selected, no note selected)
- [ ] z_order, bpmfactor, isCover, texture, anchor (inspector line properties)
- [ ] Line groups / judgeLineGroup (group selector in line drawer)
- [ ] Per-note: fake, y_offset, size, alpha, visible_time (inspector when note selected)
- [ ] Curve note tracks (context menu on canvas, like current timeline right-click)
- [ ] Import/Export produces identical RPEJSON (unchanged — same store, same import/export code)

---

## Performance Considerations

**30+ lines at 60fps:** The `GameRenderer` already renders all lines every frame (it's the game preview). Adding `RenderResult` collection is cheap (pushing to an array). The overlay pass (handles, selection rects) only draws for the selected line — negligible cost. The real risk is the `evaluateLineEventsWithLayers()` call per line per frame, but this is already happening in the current GamePreview, so no regression.

**Keyframe bar rendering:** The multi-property diamond strip renders via Canvas2D at 60fps (same as existing KeyframeStrip). With 5 property rows and potentially hundreds of events, culling is important — only draw diamonds whose beat falls within the visible range. The current KeyframeStrip already does this (line 152: `if (endPx < 0 || startPx > width) continue`).

**Note hit-testing with RenderResult:** Instead of re-evaluating events on click, we use the pre-computed `RenderResult`. This is O(total notes across all lines) for a click, which is fine for charts with thousands of notes. If it becomes an issue, a spatial index (quad-tree) can be added later.

**Viewport zoom edge case:** When zoomed in very far, the canvas coordinate space gets large. The `ctx.scale()` approach is fine for Canvas2D, but text rendering at extreme zoom can get blurry. Solution: draw text labels (line names, beat numbers) at 1:1 scale after restoring the transform, using the viewport math to position them.

---

## Risk Areas

**Selection ambiguity:** When multiple lines overlap, clicking might hit notes from different lines. Solution: clicks always prioritize the *selected* line's notes first. If no note is hit on the selected line, then check other lines (and switch selection to the hit line). This is the same priority logic used in `hitTestLine()` (gameRenderer.ts line 668) but extended to notes.

**Undo/redo:** Since the unified canvas calls the exact same `chartStore` mutation methods (`addNote`, `editEvent`, `replaceEvent`, etc.), and those all call `pushHistory()` internally, undo/redo works automatically. The only thing to verify is that the UI re-renders after an undo — but since it reads from stores reactively, this is fine.

**Note placement accuracy near line edges:** When a line is nearly horizontal and the user clicks far from center, the beat-from-distance binary search might overshoot. The 50-iteration binary search converges to ~10⁻¹⁵ precision, so mathematically it's fine. The real UX concern is the ghost preview — it should show exactly where the note will land, and snapping via `snapBeat()` keeps things grid-aligned.

**Touch/tablet support:** The state machine is mouse-event based. Touch events would need a thin adapter layer mapping `touchstart`→`mousedown`, etc. Not in scope for initial implementation but the state machine makes it easy to add later.

---

## Decision Summary

| Aspect | Decision | Source |
|---|---|---|
| Primary editing metaphor | Game-canvas (edit what you see) | Plan B |
| Classic view preservation | Yes, as fallback tab | Plan B |
| Architecture | RenderResult from GameRenderer | Plan B |
| Interaction model | Explicit state machine | Plan B |
| Line quick-selection | Horizontal chip strip | Plan B |
| Line full-management | Slide-out drawer (`L` hotkey) | Plan B |
| Event overview | Multi-property keyframe bar with lane rows | Both (Plan A's sub-rows adapted into Plan B's bar) |
| Event direct manipulation | Canvas handles (translate + rotate) | Plan B |
| Event detailed editing | Collapsible inspector sidebar (`I` hotkey) | Both |
| Inspector context-sensitivity | Line/Note/Event modes based on selection | Plan B layout, Plan A detail level |
| Data model changes | Detailed editorStore field specs with types | Plan A |
| Performance analysis | Culling, spatial indexing, zoom edge cases | Plan A |
| Risk analysis | Selection priority, undo safety, scroll conflicts | Plan A |
| Scroll mapping | Vertical=seek, Ctrl=zoom, Shift=hpan, Middle=free-pan | Plan A |
| Note placement math | Beat-from-distance binary search with speed integral | Plan B |
| Implementation safety | New files only, no existing code deleted | Plan B |

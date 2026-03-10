# Re:PhiEdit 1.6 & RPEJSON Feature Reference

A developer-oriented reference of every feature in Re:PhiEdit 1.6 and the latest RPEJSON format (up to version 163). Use this to audit your own editor for missing functionality.

---

## Note Types & Properties

RPE supports four note types matching official Phigros: **Tap** (type 1), **Drag** (type 2), **Hold** (type 3), and **Flick** (type 4). Hold notes define both a `startTime` and `endTime` to represent their duration; the other three types only use `startTime`.

Each note carries these per-note properties:

**`positionX`** (float, default 0) — Horizontal position along the judgment line. This is not in pixels; it's a coordinate relative to the line itself.

**`above`** (int, default 1) — Whether the note falls from above the line (1) or below it (0). This controls which side of the judgment line the note approaches from.

**`isFake`** (bool, default false) — Marks a note as decorative. Fake notes render visually and animate normally but cannot be hit and do not affect scoring. This is an RPE-exclusive feature not present in official Phigros and is essential for purely visual effects.

**`speed`** (float, default 1.0) — Per-note speed multiplier that overrides the line's speed events for this specific note. A value of 2.0 makes the note fall at double speed.

**`size`** (float, default 1.0) — Width/scale multiplier for the individual note. Allows making specific notes wider or narrower than the default.

**`alpha`** (int 0–255, default 255) — Per-note transparency. 0 is fully invisible, 255 is fully opaque. Added in format version ~99. Allows ghost notes or partially visible notes.

**`yOffset`** (float, default 0.0) — Vertical offset that shifts where the note visually appears relative to its actual hit position.

**`visibleTime`** (float, default 999999.0) — How many seconds before the note's hit time it becomes visible on screen. The default effectively means always visible. Setting this to a small value like 0.5 creates sudden-appearance notes.

---

## Beat Timing System

All timestamps in RPEJSON use a **three-element integer array**: `[whole, numerator, denominator]`. The real beat value is `whole + (numerator / denominator)`. For example, `[3, 1, 4]` = beat 3.25, and `[10, 3, 8]` = beat 10.375.

This avoids floating-point precision issues entirely. Your editor's grid snapping should work in terms of these fractions — any beat subdivision (1/2, 1/3, 1/4, 1/8, 1/16, 1/32, etc.) is represented exactly by adjusting the denominator.

---

## BPM System

The `BPMList` at the root of the JSON contains entries with a `startTime` (beat array) and a `bpm` (float). Multiple entries allow BPM changes mid-chart. Each entry means "from this beat onward, the BPM is this value" until the next entry overrides it.

Each judgment line also has a **`bpmfactor`** (float, default 1.0) which divides the current global BPM for that specific line. If the global BPM is 180 and a line's bpmfactor is 2.0, that line behaves as if the BPM is 90. This enables lines running at different effective tempos simultaneously.

---

## Judgment Lines

Judgment lines are the structural backbone of every chart. When creating a new chart, RPE pre-creates a configurable number of lines (default 24). Each line is an independent entity with its own notes, events, and properties.

### Core Properties

**`Name`** (string) — A user-facing label for identification in the editor. Purely organizational.

**`Group`** (int) — Index into the root-level `judgeLineGroup` string array. Used for grouping lines in the editor's UI. The root object has a `judgeLineGroup` array like `["Default", "Background", "Effects"]` and each line references an index.

**`zOrder`** (int, range ±100, default 0) — Rendering depth. Higher values render in front of lower values. Controls which lines and their notes appear on top when they overlap.

**`isCover`** (int, default 1) — When enabled, notes that have passed through the judgment line become hidden behind it, mimicking the official Phigros occlusion behavior. Setting to 0 lets notes remain visible after passing.

### Custom Textures

**`Texture`** (string, default "line.png") — Path to an image file (relative to the chart's `/Resources` folder) that replaces the default line appearance. Any PNG or image format works.

**`isGif`** (bool, default false, format version 150+) — When the texture is a GIF file, this flag tells the renderer to animate it.

**`anchor`** (float[2], default [0.5, 0.5], format version 142+) — Controls the pivot point of the texture. `[0.5, 0.5]` centers it on the line's coordinate. `[0.0, 0.0]` would anchor at the top-left corner of the texture. This affects how the texture is positioned and rotated.

### Parent-Child Hierarchy

**`father`** (int, default -1) — Index of another judgment line to use as a parent. When set, this line's position is calculated relative to the parent's position. `-1` means no parent (world-space). Nested parenting (grandchild lines) is supported — your editor needs recursive position resolution.

**`rotateWithFather`** (bool, default true, format version 163+) — Controls whether the child line also inherits the parent's rotation. When false, the child follows the parent's position but maintains its own independent rotation.

### UI Attachment

**`attachUI`** (string or null) — Binds a judgment line to a specific game UI element (score display, pause button, combo counter), making the line follow that element's position. This is a specialized feature. Note that many third-party renderers do not support this.

---

## Five-Layer Event System

Each judgment line can have **up to 5 event layers**, and the values from all layers are **additively combined** for the final result. This means if layer 0 moves X to 100 and layer 1 moves X to 50, the final X position is 150. This additive stacking enables complex composite animations that would be impossible with a single layer.

Each layer contains five event types:

**`moveXEvents`** — Horizontal position. The coordinate range is **-675 to 675**, with 0 at screen center.

**`moveYEvents`** — Vertical position. Range is **-450 to 450**, with 0 at screen center.

**`rotateEvents`** — Rotation in degrees.

**`alphaEvents`** — Line opacity from **0** (fully transparent) to **255** (fully opaque). Negative alpha values are a deprecated but still functional feature — they hide the line AND all of its notes.

**`speedEvents`** — Note scroll/fall speed. Controls how fast notes approach the line. Negative speed makes notes fly upward (away from the line). Speed events gained easing support in format version 162.

### Event Structure

Every event (except legacy speed events) contains:

**`startTime` / `endTime`** — Beat arrays marking when the transition begins and ends.

**`start` / `end`** — The value at the start and end of the transition. The renderer interpolates between them using the easing function.

**`easingType`** (int, 1–29) — Which easing curve to use for interpolation (see full table below).

**`easingLeft` / `easingRight`** (float, 0.0–1.0, default 0.0/1.0) — Clips the easing curve to a sub-range. For example, setting `easingLeft=0.0` and `easingRight=0.5` uses only the first half of the easing curve. Clipping a linear easing has no visible effect, but clipping a curve like EaseOutQuad to 0.0–0.5 produces a deceleration that stops at non-zero velocity. Your editor should allow setting these.

**`bezier`** (int, 0 or 1) — When set to 1, the numbered `easingType` is ignored and replaced by a custom cubic-bezier curve.

**`bezierPoints`** (float[4]) — Four control points defining a CSS-style `cubic-bezier(p1, p2, p3, p4)` curve. Only used when `bezier` is 1. Speed events do NOT support bezier, even after version 162.

**`linkgroup`** (int, default 0) — An editor-side organizational tag for grouping related events visually. Does not affect rendering.

### Event Gap Handling

When there is a time gap between one event's `endTime` and the next event's `startTime`, renderers insert a synthetic constant-value event that holds the last known value across the gap. After the final event in a list, another synthetic event extending to beat 31,250,000 holds that last value indefinitely.

### Multi-Layer Value Resolution

For a given point in time, the renderer sums values from all layers:

```
finalX = layer0.moveX(t) + layer1.moveX(t) + layer2.moveX(t) + ...
finalY = layer0.moveY(t) + layer1.moveY(t) + layer2.moveY(t) + ...
finalRotation = layer0.rotate(t) + layer1.rotate(t) + ...
finalAlpha = layer0.alpha(t) + layer1.alpha(t) + ...
```

Parent positions are resolved recursively and added on top. Before time 0, lines without `attachUI` default to alpha -255 (fully hidden).

---

## The 29 Easing Types

These are the standard Robert Penner easing functions:

| # | Easing | # | Easing |
|---|--------|---|--------|
| 1 | Linear | 16 | EaseOutExpo |
| 2 | EaseOutSine | 17 | EaseInExpo |
| 3 | EaseInSine | 18 | EaseOutCirc |
| 4 | EaseOutQuad | 19 | EaseInCirc |
| 5 | EaseInQuad | 20 | EaseOutBack |
| 6 | EaseInOutSine | 21 | EaseInBack |
| 7 | EaseInOutQuad | 22 | EaseInOutCirc |
| 8 | EaseOutCubic | 23 | EaseInOutBack |
| 9 | EaseInCubic | 24 | EaseOutElastic |
| 10 | EaseOutQuart | 25 | EaseInElastic |
| 11 | EaseInQuart | 26 | EaseOutBounce |
| 12 | EaseInOutCubic | 27 | EaseInBounce |
| 13 | EaseInOutQuart | 28 | EaseInOutBounce |
| 14 | EaseOutQuint | 29 | EaseInOutElastic |
| 15 | EaseInQuint | | |

Note: In RPE, EaseInOutQuint and EaseInOutExpo are reportedly treated identically to Linear (type 1). Whether you replicate this behavior or implement them properly is up to you.

---

## Extended (Special) Events

Beyond the five standard event types, each judgment line has an `extended` object with additional event types. These use the same event structure (startTime, endTime, start, end, easing, bezier, etc.) but with different value types:

**`scaleXEvents`** — Horizontal scale of the judgment line (float, default 1.0). Stretches or compresses the line horizontally.

**`scaleYEvents`** — Vertical scale (float, default 1.0). Y-axis scaling goes beyond what official charts can do.

**`colorEvents`** — RGB color tint of the judgment line. Start and end values are `[R, G, B]` integer arrays (each 0–255). Each color channel is interpolated independently during the transition.

**`textEvents`** — Displays text on the judgment line. Start and end values are strings. There is **no interpolation** — the start value is used for the entire duration. To change text, create a new event.

**`inclineEvents`** — Tilt/incline effect applied to the line (float values).

---

## Note Control Systems

Added in format versions 105–113, these are five control arrays on each judgment line that globally affect **all notes on that line** based on position or other criteria. Each control entry contains an `x` value (position), an `easing` type, and the control value.

**`posControl`** — Adjusts note positions.

**`alphaControl`** — Adjusts note transparency globally (separate from per-note `alpha`).

**`sizeControl`** — Adjusts note sizes globally (separate from per-note `size`).

**`skewControl`** — Applies skew/tilt distortion to notes.

**`yControl`** — Adjusts notes along the Y axis.

These are evaluated based on a note's current state and stacked on top of per-note properties. They allow effects like fading notes out near the edges or scaling notes based on distance from center, without editing every individual note.

---

## Coordinate System

The screen coordinate origin is at the center. X ranges from **-675 to 675**, Y from **-450 to 450**. To convert to normalized 0–1 coordinates:

```
normalized_x = (x + 675) / 1350
normalized_y = 1.0 - (y + 450) / 900
```

Note `positionX` on notes uses its own coordinate space relative to the judgment line, not the screen coordinates.

---

## Improvisation Mode

A mode where notes can be placed in real-time using keyboard keys while the music plays. Specific keys (including `;` and `/`) map to note placement positions on the active judgment line. This functions like tapping along to the rhythm and auto-placing notes at the current beat.

---

## Batch Editing

RPE provides both basic and advanced batch editing for events:

**Basic batch editing** allows simultaneous modification of multiple selected events — operations like adding/subtracting from values, multiplying values, and shifting times.

**Advanced batch editing** extends this with more complex operations for power users, enabling pattern transformations across many events at once.

---

## Curve Note Filling & Trajectory Generation

**Curve note filling** (曲线填充音符) — Places notes along mathematically defined curves automatically, using configurable parameters and the easing system for interpolation between positions.

**Curve trajectory generation** (曲线轨迹生成) — Creates judgment line motion paths using parametric equations with trigonometric functions (sin, cos) and variable expressions. Generates the moveX/moveY events needed to make a line follow a mathematical path.

---

## Chart Error Correction

A built-in validation system with a dedicated error indicator panel. It scans the chart for common issues (overlapping notes, invalid values, timing problems) and displays them directly in the editor for correction.

---

## Undo / Redo

Full undo/redo support covering both note operations and event operations.

---

## File Formats

### RPEJSON (native format)

The root JSON structure:

```json
{
  "META": {
    "RPEVersion": 162,
    "offset": 0,
    "name": "Song Name",
    "id": "1",
    "song": "music.mp3",
    "background": "bg.png",
    "composer": "Artist",
    "charter": "Charter",
    "level": "IN Lv.15"
  },
  "BPMList": [
    { "startTime": [0, 0, 1], "bpm": 180.0 }
  ],
  "judgeLineList": [ ... ],
  "judgeLineGroup": ["Default"]
}
```

### PEZ (exchange format)

A ZIP archive containing the RPEJSON chart file, music file, illustration image, and an `info.txt` specifying which files to load. This is the standard format for sharing charts between RPE, Phira, Ex:PhiEdit, and other tools.

### PEC (legacy text format)

An older text-based format with significantly fewer features. Converting RPEJSON → PEC is lossy (loses event layers, extended events, bezier easing, parent relationships, custom textures, per-note alpha/size/visibleTime). Converting PEC → RPEJSON is lossless. Support this for import if you want backward compatibility with older charts.

### Chart File Structure

Each chart is a folder containing: the JSON chart file, the music file (MP3/WAV/OGG), the background illustration (PNG), and an `info.txt` that specifies the filenames of each.

---

## What RPEJSON Has That Official Phigros JSON Doesn't

For context on what makes RPEJSON more expressive than the official format:

- Five additive event layers (official has one)
- 29 easing types + bezier curves + easing clipping (official has linear only)
- Separate moveX and moveY events (official combines them)
- Parent-child judgment line hierarchy with optional rotation inheritance
- Custom textures including animated GIFs with configurable anchor points
- Extended events: scaleX/Y, color, text, incline
- Five note control systems (pos, alpha, size, skew, y)
- Per-note alpha, size, speed, yOffset, visibleTime
- Fake (non-scoring decorative) notes
- Z-order depth sorting
- BPM factor per line
- UI element attachment
- Fractional beat precision via integer triple arrays

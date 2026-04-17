// ============================================================
// LineEvent model
//
// Recent change (bug audit #9): Extended the event schema to match
// what the TypeScript frontend already supports.
//   - LineEventKind gained 6 RPE-compatible variants: ScaleX, ScaleY,
//     Color, Text, Incline, Gif. Before, strict Rust deserialization
//     would fail on charts containing them, which meant `export_as_official`
//     errored entirely (not just dropped those events).
//   - LineEventValue gained 4 non-float variants: ColorTransition,
//     ColorConstant (RGB 0-255 triples), TextValue, TextTransition.
//     Legacy numeric methods (start/end/negated/into_*) on these
//     variants return sensible defaults (0.0 / self) — callers must
//     check `kind.is_float_valued()` before treating them as numeric.
//   - LineEvent gained optional `easing_left`, `easing_right`,
//     `linkgroup`, `font` fields for RPE round-trip fidelity.
//
// Variants that Official format can't represent (Color, Text, Gif,
// Incline, ScaleX, ScaleY) are skipped with a tracing warning at
// OfficialChart conversion time rather than bringing down the
// export. RPE round-trip preserves everything.
// ============================================================

use crate::easing::{Easing, Tween};
use num_enum::{IntoPrimitive, TryFromPrimitive};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

use crate::beat::Beat;
use crate::primitive;

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, IntoPrimitive, TryFromPrimitive,
)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
pub enum LineEventKind {
    X = 1,
    Y,
    Rotation,
    Opacity,
    Speed,
    // ── Extended RPE variants (bug audit #9) ──
    ScaleX,
    ScaleY,
    Color,
    Text,
    Incline,
    Gif,
}

impl LineEventKind {
    pub fn is_x(&self) -> bool {
        matches!(self, LineEventKind::X)
    }

    pub fn is_y(&self) -> bool {
        matches!(self, LineEventKind::Y)
    }

    pub fn is_rotation(&self) -> bool {
        matches!(self, LineEventKind::Rotation)
    }

    pub fn is_opacity(&self) -> bool {
        matches!(self, LineEventKind::Opacity)
    }

    pub fn is_speed(&self) -> bool {
        matches!(self, LineEventKind::Speed)
    }

    pub fn is_scale_x(&self) -> bool {
        matches!(self, LineEventKind::ScaleX)
    }

    pub fn is_scale_y(&self) -> bool {
        matches!(self, LineEventKind::ScaleY)
    }

    pub fn is_color(&self) -> bool {
        matches!(self, LineEventKind::Color)
    }

    pub fn is_text(&self) -> bool {
        matches!(self, LineEventKind::Text)
    }

    pub fn is_incline(&self) -> bool {
        matches!(self, LineEventKind::Incline)
    }

    pub fn is_gif(&self) -> bool {
        matches!(self, LineEventKind::Gif)
    }

    /// True if the event's value is a simple f32 (the legacy set plus
    /// the extended float-valued variants). False for Color and Text
    /// which carry non-numeric payloads.
    ///
    /// Callers that interpret `LineEventValue::start()` / `end()` as
    /// meaningful numbers MUST filter by this before calling, because
    /// the non-float variants return 0.0 as a placeholder.
    pub fn is_float_valued(&self) -> bool {
        matches!(
            self,
            LineEventKind::X
                | LineEventKind::Y
                | LineEventKind::Rotation
                | LineEventKind::Opacity
                | LineEventKind::Speed
                | LineEventKind::ScaleX
                | LineEventKind::ScaleY
                | LineEventKind::Incline
                | LineEventKind::Gif,
        )
    }

    /// True if this kind can be represented in Official (Phigros)
    /// format. Official supports position (x, y via move_events),
    /// rotation, opacity (alpha), and speed. Everything else —
    /// including the extended float variants — is dropped with a
    /// warning at export time.
    pub fn is_official_representable(&self) -> bool {
        matches!(
            self,
            LineEventKind::X
                | LineEventKind::Y
                | LineEventKind::Rotation
                | LineEventKind::Opacity
                | LineEventKind::Speed,
        )
    }
}

// Note: LineEventValue can no longer be `Copy` because the String
// variants own heap data. `Clone` still works. Callers that relied
// on auto-copy will get helpful errors from the compiler; most of
// them are fine to switch to `.clone()`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineEventValue {
    Transition {
        start: f32,
        end: f32,
        easing: Easing,
    },
    Constant(f32),

    // ── Extended variants (bug audit #9) ──
    /// RGB color transition. Values are 0-255 integer channels as in RPE's tint/color field.
    ColorTransition {
        start: [u8; 3],
        end: [u8; 3],
        easing: Easing,
    },
    /// RGB color constant.
    ColorConstant([u8; 3]),
    /// Static text value (RPE "text" event).
    TextValue(String),
    /// Text transition (cross-fade / typewriter depending on easing).
    TextTransition {
        start: String,
        end: String,
        easing: Easing,
    },
}

impl LineEventValue {
    pub fn transition(start: f32, end: f32, easing: Easing) -> Self {
        Self::Transition { start, end, easing }
    }

    pub fn constant(value: f32) -> Self {
        Self::Constant(value)
    }

    /// Negate a numeric event value (used for Rotation in RPE export).
    /// Non-numeric variants are returned unchanged — rotation can't
    /// apply to a color or text payload.
    pub fn negated(&self) -> Self {
        match self {
            LineEventValue::Transition { start, end, easing } => LineEventValue::Transition {
                start: -start,
                end: -end,
                easing: *easing,
            },
            LineEventValue::Constant(value) => LineEventValue::Constant(-value),
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => self.clone(),
        }
    }

    pub fn is_transition(&self) -> bool {
        matches!(
            self,
            LineEventValue::Transition { .. }
                | LineEventValue::ColorTransition { .. }
                | LineEventValue::TextTransition { .. }
        )
    }

    pub fn is_constant(&self) -> bool {
        matches!(
            self,
            LineEventValue::Constant(_)
                | LineEventValue::ColorConstant(_)
                | LineEventValue::TextValue(_)
        )
    }

    /// Start value as f32. Returns 0.0 for non-numeric variants;
    /// callers that would mis-interpret 0.0 as a real coordinate must
    /// filter by `LineEventKind::is_float_valued()` first.
    pub fn start(&self) -> f32 {
        match self {
            LineEventValue::Transition { start, .. } => *start,
            LineEventValue::Constant(value) => *value,
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => 0.0,
        }
    }

    /// End value as f32; see `start()` for non-numeric semantics.
    pub fn end(&self) -> f32 {
        match self {
            LineEventValue::Transition { end, .. } => *end,
            LineEventValue::Constant(value) => *value,
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => 0.0,
        }
    }

    /// Collapse a transition to a constant holding its start value.
    /// Non-numeric variants are returned unchanged (no meaningful
    /// "flatten" exists for strings/colors in the current model).
    pub fn into_constant(self) -> Self {
        match self {
            LineEventValue::Transition { start, .. } => Self::constant(start),
            LineEventValue::Constant(_)
            | LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => self,
        }
    }

    /// Promote a constant to a linear-easing transition (start == end).
    /// Non-numeric variants are returned unchanged.
    pub fn into_transition(self) -> Self {
        match self {
            LineEventValue::Transition { .. } => self,
            LineEventValue::Constant(value) => Self::transition(value, value, Easing::Linear),
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => self,
        }
    }
}

// `Copy` was dropped (bug audit #9) because LineEventValue now holds
// owned String variants (TextValue, TextTransition). All legitimate
// by-value uses in the codebase compile by `.clone()`-ing when needed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Component))]
pub struct LineEvent {
    pub kind: LineEventKind,
    pub start_beat: Beat,
    pub end_beat: Beat,
    pub value: LineEventValue,

    // ── RPE round-trip fields (bug audit #9) ──
    // These are preserved on import → save → export but not acted on
    // by the core engine/compiler. Defaulting to None keeps charts
    // that don't use them (all pre-RPE charts) unchanged byte-for-byte.
    /// Easing sub-range start (0.0–1.0, default 0.0) — clips easing curve.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing_left: Option<f32>,
    /// Easing sub-range end (0.0–1.0, default 1.0) — clips easing curve.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing_right: Option<f32>,
    /// RPE linkgroup id — events with the same linkgroup edit together in RPE UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linkgroup: Option<i32>,
    /// Custom font (RPE v152+) for text events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
}

impl PartialOrd for LineEvent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.start_beat.partial_cmp(&other.start_beat)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum EventEvaluationResult {
    /// The event is affecting the line at the given beat
    Affecting(f32),
    /// The given beat is later than the end beat of this event
    ///
    /// If there's no other events after this event,
    /// the value is inherited from the end value of this event
    Inherited { from: Beat, value: f32 },
    /// The given beat is before the start beat of this event
    ///
    /// This event does not have any effect on the line
    Unaffected,
}

impl Eq for EventEvaluationResult {}

impl PartialOrd for EventEvaluationResult {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// [`Unaffected`] compares as less than any [`Inherited`] or [`Affecting`]
///
/// [`Inherited`] compares as less than [`Affecting`]
///
/// Two [`Affecting`] compare based on their contained values, two [`Inherited`] compare based on their `from` values
///
/// In other words:
///
/// - [`Unaffected`] < [`Inherited`] < [`Affecting`]
/// - Two [`Affecting`] compare based on their contained values, two [`Inherited`] compare based on their `from` values
///
/// ```rust
/// # use phichain_chart::beat;
/// use phichain_chart::event::EventEvaluationResult as R;
/// assert!(R::Unaffected < R::Affecting(10.0));
/// assert!(R::Unaffected < R::Inherited { from: beat!(0), value: 10.0 });
/// assert!(R::Inherited { from: beat!(0), value: 200.0 } < R::Affecting(10.0));
/// assert!(R::Inherited { from: beat!(0), value: 200.0 } < R::Inherited { from: beat!(2), value: 10.0 });
/// assert!(R::Affecting(5.0) < R::Affecting(10.0));
/// ```
///
/// [`Unaffected`]: EventEvaluationResult::Unaffected
/// [`Inherited`]: EventEvaluationResult::Inherited
/// [`Affecting`]: EventEvaluationResult::Affecting
impl Ord for EventEvaluationResult {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (EventEvaluationResult::Unaffected, EventEvaluationResult::Unaffected) => {
                Ordering::Equal
            }
            (EventEvaluationResult::Unaffected, _) => Ordering::Less,
            (_, EventEvaluationResult::Unaffected) => Ordering::Greater,

            (
                EventEvaluationResult::Inherited { from: a, .. },
                EventEvaluationResult::Inherited { from: b, .. },
            ) => a.cmp(b),
            (EventEvaluationResult::Affecting(a), EventEvaluationResult::Affecting(b)) => {
                a.total_cmp(b)
            }

            (EventEvaluationResult::Inherited { .. }, EventEvaluationResult::Affecting(_)) => {
                Ordering::Less
            }
            (EventEvaluationResult::Affecting(_), EventEvaluationResult::Inherited { .. }) => {
                Ordering::Greater
            }
        }
    }
}

impl EventEvaluationResult {
    /// Returns [`Some`] with the contained value if the variant is [`Affecting`] or [`Inherited`], or [`None`] if [`Unaffected`]
    ///
    /// [`Affecting`]: EventEvaluationResult::Affecting
    /// [`Inherited`]: EventEvaluationResult::Inherited
    /// [`Unaffected`]: EventEvaluationResult::Unaffected
    pub fn value(&self) -> Option<f32> {
        match self {
            EventEvaluationResult::Affecting(value) => Some(*value),
            EventEvaluationResult::Inherited { value, .. } => Some(*value),
            EventEvaluationResult::Unaffected => None,
        }
    }
}

impl LineEvent {
    pub fn evaluate(&self, beat: f32) -> EventEvaluationResult {
        let start_beat = self.start_beat.value();
        let end_beat = self.end_beat.value();
        // Bug audit #9: match by reference since LineEventValue is no
        // longer Copy (TextValue/TextTransition hold owned Strings).
        match &self.value {
            LineEventValue::Transition { start, end, easing } => {
                if beat >= start_beat && beat <= end_beat {
                    let percent = (beat - start_beat) / (end_beat - start_beat);
                    EventEvaluationResult::Affecting(start.ease_to(*end, percent, *easing))
                } else if beat > end_beat {
                    EventEvaluationResult::Inherited {
                        from: self.end_beat,
                        value: *end,
                    }
                } else {
                    EventEvaluationResult::Unaffected
                }
            }
            LineEventValue::Constant(value) => {
                if beat >= start_beat && beat <= end_beat {
                    EventEvaluationResult::Affecting(*value)
                } else if beat > end_beat {
                    EventEvaluationResult::Inherited {
                        from: self.end_beat,
                        value: *value,
                    }
                } else {
                    EventEvaluationResult::Unaffected
                }
            }
            // Non-float variants have no numeric evaluation — report
            // Unaffected so they don't contribute to numeric pipelines.
            // (Renderers that care about color/text read these off the
            // LineEvent directly rather than going through evaluate().)
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => EventEvaluationResult::Unaffected,
        }
    }

    pub fn evaluate_start_no_effect(&self, beat: f32) -> EventEvaluationResult {
        let start_beat = self.start_beat.value();
        let end_beat = self.end_beat.value();
        match &self.value {
            LineEventValue::Transition { start, end, easing } => {
                if beat > start_beat && beat <= end_beat {
                    let percent = (beat - start_beat) / (end_beat - start_beat);
                    EventEvaluationResult::Affecting(start.ease_to(*end, percent, *easing))
                } else if beat > end_beat {
                    EventEvaluationResult::Inherited {
                        from: self.end_beat,
                        value: *end,
                    }
                } else {
                    EventEvaluationResult::Unaffected
                }
            }
            LineEventValue::Constant(value) => {
                if beat > start_beat && beat <= end_beat {
                    EventEvaluationResult::Affecting(*value)
                } else if beat > end_beat {
                    EventEvaluationResult::Inherited {
                        from: self.end_beat,
                        value: *value,
                    }
                } else {
                    EventEvaluationResult::Unaffected
                }
            }
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => EventEvaluationResult::Unaffected,
        }
    }
}

impl From<LineEvent> for primitive::event::LineEvent {
    /// Collapse a LineEvent into the primitive f32-valued representation
    /// used by the compiler pipeline.
    ///
    /// Bug audit #9: non-float variants (ColorTransition, ColorConstant,
    /// TextValue, TextTransition) collapse to `start = end = 0.0` with
    /// Linear easing as a placeholder. Callers that care must filter
    /// by `event.kind.is_float_valued()` before calling this — the
    /// Official format converter already does so via its `_ => {}`
    /// catch-all on the kind.
    fn from(event: LineEvent) -> Self {
        match event.value {
            LineEventValue::Transition { start, end, easing } => Self {
                kind: event.kind,
                start_beat: event.start_beat,
                end_beat: event.end_beat,
                start,
                end,
                easing,
            },
            LineEventValue::Constant(value) => Self {
                kind: event.kind,
                start_beat: event.start_beat,
                end_beat: event.end_beat,
                start: value,
                end: value,
                easing: Easing::Linear,
            },
            // Non-float variants — placeholder, caller must pre-filter.
            LineEventValue::ColorTransition { .. }
            | LineEventValue::ColorConstant(_)
            | LineEventValue::TextValue(_)
            | LineEventValue::TextTransition { .. } => Self {
                kind: event.kind,
                start_beat: event.start_beat,
                end_beat: event.end_beat,
                start: 0.0,
                end: 0.0,
                easing: Easing::Linear,
            },
        }
    }
}

impl From<primitive::event::LineEvent> for LineEvent {
    fn from(event: primitive::event::LineEvent) -> Self {
        Self {
            kind: event.kind,
            start_beat: event.start_beat,
            end_beat: event.end_beat,
            value: LineEventValue::transition(event.start, event.end, event.easing),
            // Primitive has no round-trip metadata — default all to None.
            easing_left: None,
            easing_right: None,
            linkgroup: None,
            font: None,
        }
    }
}

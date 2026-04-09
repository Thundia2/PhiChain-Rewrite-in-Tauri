// ============================================================
// Group Manager — Shared Constants & Styles
//
// Constants and styles used by GroupManager and its extracted
// sub-components (LineBatchOps, NoteBatchOps, GroupRow).
// ============================================================

import type { LineEventKind, NoteKind } from "../../types/chart";
import { INPUT_STYLE as UIK_INPUT_STYLE, SELECT_STYLE as UIK_SELECT_STYLE } from "../common/UIKit";

// ---- Data Constants ----

export const EVENT_KINDS: { value: LineEventKind; label: string }[] = [
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "rotation", label: "Rotation" },
  { value: "opacity", label: "Opacity" },
  { value: "speed", label: "Speed" },
  { value: "scale_x", label: "Scale X" },
  { value: "scale_y", label: "Scale Y" },
];

export const NOTE_KINDS: { value: NoteKind; label: string }[] = [
  { value: "tap", label: "Tap" },
  { value: "drag", label: "Drag" },
  { value: "flick", label: "Flick" },
  { value: "hold", label: "Hold" },
];

// ---- Shared Styles ----

export const SECTION_STYLE: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "var(--text-muted)",
  marginBottom: 6,
  marginTop: 12,
};

export const CARD_STYLE: React.CSSProperties = {
  backgroundColor: "var(--bg-active)",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 8,
};

export const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 10px",
  borderBottom: "1px solid rgba(42, 42, 53, 0.55)",
  fontSize: 11,
};

export const INPUT_STYLE = UIK_INPUT_STYLE;
export const SELECT_STYLE = UIK_SELECT_STYLE;

export const BTN_ACCENT_STYLE: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 10,
  fontWeight: 500,
  background: "var(--accent-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

export const BTN_MUTED_STYLE: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 10,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  cursor: "pointer",
};

export const BTN_DANGER_STYLE: React.CSSProperties = {
  ...BTN_MUTED_STYLE,
  color: "#ff4060",
  borderColor: "rgba(255, 64, 96, 0.3)",
};

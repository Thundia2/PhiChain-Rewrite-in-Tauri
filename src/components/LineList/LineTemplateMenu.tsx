// ============================================================
// Line Template Menu
//
// Dropdown menu with pre-configured line templates for common
// line types. Supports single and batch (e.g., "All UI Lines")
// creation.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import type { Line, LineEvent, Beat } from "../../types/chart";

function defaultEventsWithOpacity(opacity: number): LineEvent[] {
  const start: Beat = [0, 0, 1];
  const end: Beat = [1000, 0, 1];
  return [
    { kind: "x", start_beat: start, end_beat: end, value: { constant: 0 } },
    { kind: "y", start_beat: start, end_beat: end, value: { constant: 0 } },
    { kind: "rotation", start_beat: start, end_beat: end, value: { constant: 0 } },
    { kind: "opacity", start_beat: start, end_beat: end, value: { constant: opacity } },
    { kind: "speed", start_beat: start, end_beat: end, value: { constant: 1 } },
  ];
}

interface LineTemplate {
  id: string;
  label: string;
  icon: string;
  description?: string;
  create?: () => Partial<Line>;
  isBatch?: boolean;
  batchTemplates?: string[];
}

const LINE_TEMPLATES: LineTemplate[] = [
  {
    id: "gameplay", label: "Gameplay Line", icon: "N",
    description: "Standard line with notes",
    create: () => ({ _category: "gameplay" }),
  },
  {
    id: "text", label: "Text / Lyrics Line", icon: "T",
    description: "Invisible line for text events",
    create: () => ({
      _category: "text", name: "Lyrics",
      events: defaultEventsWithOpacity(0),
    }),
  },
  {
    id: "ui-combo", label: "UI: Combo Counter", icon: "#",
    create: () => ({ _category: "visual", name: "UI Combo", attach_ui: "combonumber" }),
  },
  {
    id: "ui-score", label: "UI: Score", icon: "%",
    create: () => ({ _category: "visual", name: "UI Score", attach_ui: "score" }),
  },
  {
    id: "ui-combo-label", label: "UI: Combo Label", icon: "C",
    create: () => ({ _category: "visual", name: "UI Combo Label", attach_ui: "combo" }),
  },
  {
    id: "ui-name", label: "UI: Song Name", icon: "N",
    create: () => ({ _category: "visual", name: "UI Name", attach_ui: "name" }),
  },
  {
    id: "ui-level", label: "UI: Level Label", icon: "L",
    create: () => ({ _category: "visual", name: "UI Level", attach_ui: "level" }),
  },
  {
    id: "ui-bar", label: "UI: Progress Bar", icon: "=",
    create: () => ({ _category: "visual", name: "UI Bar", attach_ui: "bar" }),
  },
  {
    id: "ui-pause", label: "UI: Pause Button", icon: "P",
    create: () => ({ _category: "visual", name: "UI Pause", attach_ui: "pause" }),
  },
  {
    id: "ui-all", label: "All UI Lines (7)", icon: "A",
    description: "Creates all 7 standard UI lines at once",
    isBatch: true,
    batchTemplates: ["ui-combo", "ui-combo-label", "ui-score", "ui-name", "ui-level", "ui-bar", "ui-pause"],
  },
  {
    id: "visual-helper", label: "Visual Helper Line", icon: "H",
    description: "Invisible line for visual effects",
    create: () => ({
      _category: "helper", name: "Helper",
      events: defaultEventsWithOpacity(0),
    }),
  },
  {
    id: "texture", label: "Texture / Image Line", icon: "I",
    description: "Line for displaying a custom image",
    create: () => ({ _category: "visual", name: "Image" }),
  },
];

const templateMap = new Map(LINE_TEMPLATES.filter((t) => t.create).map((t) => [t.id, t]));

export function LineTemplateMenu() {
  const [open, setOpen] = useState(false);
  const addLine = useChartStore((s) => s.addLine);
  const batchAddLines = useChartStore((s) => s.batchAddLines);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleCreate = useCallback((template: LineTemplate) => {
    if (template.isBatch && template.batchTemplates) {
      const partials = template.batchTemplates
        .map((id) => templateMap.get(id)?.create?.())
        .filter(Boolean) as Partial<Line>[];
      batchAddLines(partials);
    } else if (template.create) {
      addLine(template.create());
    }
    setOpen(false);
  }, [addLine, batchAddLines]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "3px 6px", borderRadius: 4,
          border: "1px dashed #444", background: "transparent",
          color: "#555", cursor: "pointer", fontSize: 11,
          fontFamily: "inherit",
        }}
        title="Add from template"
      >
        +T
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 10001,
          background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
          borderRadius: 8, padding: 4, marginTop: 4, width: 220,
          maxHeight: 300, overflowY: "auto",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          {LINE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleCreate(t)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "5px 8px", borderRadius: 4,
                border: "none", background: "transparent",
                color: "var(--text-primary)", cursor: "pointer",
                fontSize: 11, textAlign: "left", fontFamily: "inherit",
              }}
              title={t.description}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-active)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 4,
                background: "var(--bg-primary)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 10, flexShrink: 0,
              }}>
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

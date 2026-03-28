// ============================================================
// Batch Line Dialog — Create N lines with shared properties
// ============================================================

import { useState } from "react";
import { useChartStore } from "../../stores/chartStore";
import type { Line } from "../../types/chart";
import { Card, ActionButton, SectionHeader } from "../common/UIKit";
import { Field, SelectField } from "../common/FormFields";
import { LINE_CATEGORY_LABELS } from "../LineList/lineCategories";

interface BatchLineDialogProps {
  open: boolean;
  onClose: () => void;
}

export function BatchLineDialog({ open, onClose }: BatchLineDialogProps) {
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("Line");
  const [category, setCategory] = useState<Line["_category"]>("visual");
  const [opacity, setOpacity] = useState(0);
  const [copyFromLine, setCopyFromLine] = useState<number | null>(null);
  const lines = useChartStore((s) => s.chart.lines);

  if (!open) return null;

  const handleCreate = () => {
    for (let i = 0; i < count; i++) {
      const lineOverride: Partial<Line> = {
        name: `${prefix} ${i + 1}`,
        _category: category,
      };

      useChartStore.getState().addLine(lineOverride);

      const freshState = useChartStore.getState();
      const newIdx = freshState.chart.lines.length - 1;
      const newLine = freshState.chart.lines[newIdx];

      if (opacity !== 255 && newLine) {
        const opacityIdx = newLine.events.findIndex((e) => e.kind === "opacity");
        if (opacityIdx >= 0) {
          useChartStore.getState().editEvent(newIdx, opacityIdx, {
            value: { constant: opacity },
          });
        }
      }

      if (copyFromLine !== null) {
        const currentState = useChartStore.getState();
        const sourceLine = currentState.chart.lines[copyFromLine];
        if (sourceLine) {
          for (const event of sourceLine.events) {
            useChartStore.getState().addEvent(newIdx, structuredClone(event));
          }
        }
      }
    }

    onClose();
  };

  const categoryOptions = [
    { value: "", label: "None" },
    ...Object.entries(LINE_CATEGORY_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  const lineOptions = [
    { value: "-1", label: "None" },
    ...lines.map((line, i) => ({
      value: String(i),
      label: `${i}: ${line.name}`,
    })),
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 320,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <SectionHeader>Create Multiple Lines</SectionHeader>
        <Card>
          <div
            style={{
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <Field
              label="Count"
              value={count}
              onChange={(v) => setCount(Math.max(1, parseInt(v) || 1))}
              step="1"
              min="1"
              max="50"
            />
            <Field
              label="Prefix"
              value={prefix}
              onChange={(v) => setPrefix(v)}
              type="text"
            />
            <SelectField
              label="Category"
              value={category ?? ""}
              options={categoryOptions}
              onChange={(v) =>
                setCategory((v as Line["_category"]) || undefined)
              }
            />
            <Field
              label="Opacity"
              value={opacity}
              onChange={(v) =>
                setOpacity(Math.max(0, Math.min(255, parseInt(v) || 0)))
              }
              step="1"
              min="0"
              max="255"
            />
            <SelectField
              label="Copy from"
              value={String(copyFromLine ?? -1)}
              options={lineOptions}
              onChange={(v) =>
                setCopyFromLine(parseInt(v) === -1 ? null : parseInt(v))
              }
            />
          </div>
        </Card>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton variant="primary" onClick={handleCreate}>
            Create {count} Lines
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

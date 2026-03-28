// ============================================================
// Validation Panel
//
// Displays chart validation results. Re-validates on demand
// when the user clicks "Validate". Shows errors, warnings,
// and info messages with line/note references.
// ============================================================

import { useState, useCallback } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { validateChart, type ValidationIssue, type ValidationSeverity } from "../../utils/chartValidation";
import { ActionButton, Badge } from "../common/UIKit";

const SEVERITY_COLORS: Record<ValidationSeverity, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--info)",
};

const SEVERITY_ICONS: Record<ValidationSeverity, string> = {
  error: "\u2715",
  warning: "!",
  info: "i",
};

export function ValidationPanel() {
  const chart = useChartStore((s) => s.chart);
  const selectLine = useEditorStore((s) => s.selectLine);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const runValidation = useCallback(() => {
    const result = validateChart(chart);
    setIssues(result);
    setHasRun(true);
  }, [chart]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}
      >
        <ActionButton variant="primary" onClick={runValidation}>
          Validate
        </ActionButton>
        {hasRun && (
          <div style={{ display: "flex", gap: 6 }}>
            <Badge color="#ff4a6a">{errorCount} error{errorCount !== 1 ? "s" : ""}</Badge>
            <Badge color="#ffd43b">{warningCount} warning{warningCount !== 1 ? "s" : ""}</Badge>
            <Badge color="#4dabf7">{infoCount} info</Badge>
          </div>
        )}
      </div>

      {/* Results list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!hasRun && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Click "Validate" to check for issues
            </span>
          </div>
        )}
        {hasRun && issues.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span style={{ fontSize: 11, color: "var(--success)" }}>
              No issues found
            </span>
          </div>
        )}
        {issues.map((issue, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 12px",
              borderBottom: "1px solid rgba(42, 42, 53, 0.4)",
              cursor: "pointer",
            }}
            onClick={() => {
              if (issue.lineIndex !== undefined) {
                selectLine(issue.lineIndex);
              }
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                backgroundColor: SEVERITY_COLORS[issue.severity] + "20" as string,
                color: SEVERITY_COLORS[issue.severity],
                marginTop: 1,
              }}
            >
              {SEVERITY_ICONS[issue.severity]}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.4 }}>
              {issue.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

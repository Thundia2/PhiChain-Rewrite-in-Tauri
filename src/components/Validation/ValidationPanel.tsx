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

const SEVERITY_COLORS: Record<ValidationSeverity, string> = {
  error: "#ff6b6b",
  warning: "#ffd43b",
  info: "#4dabf7",
};

const SEVERITY_ICONS: Record<ValidationSeverity, string> = {
  error: "X",
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-2 py-1 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <button
          className="px-3 py-1 rounded text-xs font-medium"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
          }}
          onClick={runValidation}
        >
          Validate
        </button>
        {hasRun && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: SEVERITY_COLORS.error }}>{errorCount} errors</span>
            {" / "}
            <span style={{ color: SEVERITY_COLORS.warning }}>{warningCount} warnings</span>
            {" / "}
            <span style={{ color: SEVERITY_COLORS.info }}>{infoCount} info</span>
          </span>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {!hasRun && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Click "Validate" to check for issues
            </span>
          </div>
        )}
        {hasRun && issues.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs" style={{ color: "#51cf66" }}>
              No issues found
            </span>
          </div>
        )}
        {issues.map((issue, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 px-2 py-1.5 border-b cursor-pointer hover:bg-white/5"
            style={{ borderColor: "var(--border-primary)" }}
            onClick={() => {
              if (issue.lineIndex !== undefined) {
                selectLine(issue.lineIndex);
              }
            }}
          >
            <span
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: SEVERITY_COLORS[issue.severity] + "30",
                color: SEVERITY_COLORS[issue.severity],
                fontSize: "9px",
              }}
            >
              {SEVERITY_ICONS[issue.severity]}
            </span>
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              {issue.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

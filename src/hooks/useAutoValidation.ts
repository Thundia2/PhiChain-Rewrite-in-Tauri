// ============================================================
// Auto-Validation Hook
//
// Subscribes to chartStore changes and runs chart validation
// automatically with a 2-second debounce. Results are stored
// in editorStore so both the StatusBar badge and the
// ValidationPanel can consume them.
// ============================================================

import { useEffect, useRef } from "react";
import { useChartStore } from "../stores/chartStore";
import { useEditorStore } from "../stores/editorStore";
import { validateChart } from "../utils/chartValidation";

const DEBOUNCE_MS = 2000;

/**
 * Call once (e.g. in StatusBar) to enable auto-validation.
 * Listens to `chartStore.chart` changes, debounces 2 s, then
 * writes results into `editorStore.validationIssues`.
 */
export function useAutoValidation(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevChartRef = useRef(useChartStore.getState().chart);

  useEffect(() => {
    // Use zustand v5 subscribe(listener) — fires on every state change.
    // We compare the chart reference to skip unrelated state updates
    // (e.g. isDirty, meta, _past/_future changes that don't touch chart).
    const unsub = useChartStore.subscribe((state) => {
      if (state.chart === prevChartRef.current) return;
      prevChartRef.current = state.chart;

      // Clear any pending debounce timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const issues = validateChart(state.chart);
        useEditorStore.getState().setValidationIssues(issues);
      }, DEBOUNCE_MS);
    });

    // Run an initial validation on mount so the badge is accurate
    // even before the first edit.
    const initialTimer = setTimeout(() => {
      const chart = useChartStore.getState().chart;
      const issues = validateChart(chart);
      useEditorStore.getState().setValidationIssues(issues);
    }, 500);

    return () => {
      unsub();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      clearTimeout(initialTimer);
    };
  }, []);
}

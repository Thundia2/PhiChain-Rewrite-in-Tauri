// ============================================================
// HotkeySettings — Configurable Keyboard Shortcuts Panel
//
// Shows all available hotkeys grouped by category. Users can
// click on a binding to enter capture mode and press a new key
// combination. Conflicts are highlighted in red.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  DEFAULT_HOTKEYS,
  HOTKEY_CATEGORIES,
  formatHotkeyDisplay,
} from "../../constants/defaultHotkeys";

/**
 * Convert a keyboard event into a react-hotkeys-hook key string.
 * e.g., Ctrl+Shift+Z -> "ctrl+shift+z"
 */
function keyEventToString(e: KeyboardEvent): string | null {
  // Ignore bare modifier keys
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");

  let key = e.key.toLowerCase();
  // Normalize special keys
  if (key === " ") key = "space";
  if (key === "arrowup") key = "up";
  if (key === "arrowdown") key = "down";
  if (key === "arrowleft") key = "left";
  if (key === "arrowright") key = "right";
  if (key === "escape") return null; // Escape cancels capture

  parts.push(key);
  return parts.join("+");
}

/**
 * Build a reverse map from key binding -> action name to find conflicts.
 */
function buildConflictMap(
  overrides: Record<string, string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const [action, def] of Object.entries(DEFAULT_HOTKEYS)) {
    const key = overrides[action] ?? def.key;
    // For multi-key bindings ("ctrl+z, meta+z"), check each combo
    for (const combo of key.split(",").map((s) => s.trim())) {
      const existing = map.get(combo) ?? [];
      existing.push(action);
      map.set(combo, existing);
    }
  }

  return map;
}

function findConflictFor(
  action: string,
  key: string,
  overrides: Record<string, string>,
): string | null {
  const conflictMap = buildConflictMap(overrides);
  for (const combo of key.split(",").map((s) => s.trim())) {
    const actions = conflictMap.get(combo);
    if (actions && actions.length > 1) {
      const other = actions.find((a) => a !== action);
      if (other) return other;
    }
  }
  return null;
}

export function HotkeySettings() {
  const overrides = useSettingsStore((s) => s.hotkeyOverrides);
  const setHotkeyOverride = useSettingsStore((s) => s.setHotkeyOverride);
  const resetHotkey = useSettingsStore((s) => s.resetHotkey);
  const resetAllHotkeys = useSettingsStore((s) => s.resetAllHotkeys);

  const [capturingAction, setCapturingAction] = useState<string | null>(null);

  const handleCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!capturingAction) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setCapturingAction(null);
        return;
      }

      const keyStr = keyEventToString(e);
      if (!keyStr) return;

      setHotkeyOverride(capturingAction, keyStr);
      setCapturingAction(null);
    },
    [capturingAction, setHotkeyOverride],
  );

  useEffect(() => {
    if (capturingAction) {
      window.addEventListener("keydown", handleCapture, true);
      return () => window.removeEventListener("keydown", handleCapture, true);
    }
  }, [capturingAction, handleCapture]);

  return (
    <div className="flex flex-col gap-4">
      {HOTKEY_CATEGORIES.map((category) => {
        const actions = Object.entries(DEFAULT_HOTKEYS).filter(
          ([, def]) => def.category === category,
        );
        if (actions.length === 0) return null;

        return (
          <div key={category}>
            <h4
              className="text-xs font-semibold uppercase tracking-wider mb-2 pb-1"
              style={{
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              {category}
            </h4>
            <div className="flex flex-col gap-1">
              {actions.map(([action, def]) => {
                const currentKey = overrides[action] ?? def.key;
                const isOverridden = !!overrides[action];
                const isCapturing = capturingAction === action;
                const conflictAction = findConflictFor(
                  action,
                  currentKey,
                  overrides,
                );
                const conflictLabel = conflictAction
                  ? DEFAULT_HOTKEYS[conflictAction]?.label ?? conflictAction
                  : null;

                return (
                  <div
                    key={action}
                    className="flex items-center gap-2 py-1 px-1 rounded"
                    style={{
                      backgroundColor: isCapturing
                        ? "var(--bg-active)"
                        : "transparent",
                    }}
                  >
                    {/* Action label */}
                    <span
                      className="flex-1 text-xs"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {def.label}
                    </span>

                    {/* Key binding button */}
                    <button
                      className="px-2 py-0.5 rounded text-xs font-mono min-w-[100px] text-center transition-colors"
                      style={{
                        backgroundColor: isCapturing
                          ? "var(--accent-primary)"
                          : "var(--bg-active)",
                        color: isCapturing
                          ? "#fff"
                          : conflictLabel
                            ? "#ff4060"
                            : isOverridden
                              ? "var(--accent-primary)"
                              : "var(--text-primary)",
                        border: conflictLabel
                          ? "1px solid #ff4060"
                          : "1px solid var(--border-color)",
                      }}
                      onClick={() =>
                        setCapturingAction(isCapturing ? null : action)
                      }
                      title={
                        conflictLabel
                          ? `Conflict: same binding as "${conflictLabel}"`
                          : isCapturing
                            ? "Press a key combination (Escape to cancel)"
                            : "Click to rebind"
                      }
                    >
                      {isCapturing
                        ? "Press a key..."
                        : formatHotkeyDisplay(currentKey)}
                    </button>

                    {/* Reset button (only visible if overridden) */}
                    <button
                      className="px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-white/10"
                      style={{
                        color: "var(--text-muted)",
                        visibility: isOverridden ? "visible" : "hidden",
                      }}
                      onClick={() => resetHotkey(action)}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Reset all button */}
      <div
        className="pt-3 mt-2"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <button
          className="px-3 py-1.5 rounded text-xs transition-colors hover:opacity-80"
          style={{ color: "#ff4060", border: "1px solid #ff4060" }}
          onClick={() => {
            if (
              confirm("Reset all hotkeys to their default bindings?")
            ) {
              resetAllHotkeys();
            }
          }}
        >
          Reset All Hotkeys
        </button>
      </div>
    </div>
  );
}

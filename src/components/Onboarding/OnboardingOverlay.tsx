// ============================================================
// Onboarding Overlay
//
// First-run experience that introduces new users to the editor.
// Shows 5 steps highlighting key areas of the UI.
// ============================================================

import { useState, useCallback } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

const STEPS = [
  {
    title: "Welcome to PhiChain",
    body: "PhiChain is a chart editor for the rhythm game Phigros. Create judgment lines, place notes, and animate line events to build playable charts.",
  },
  {
    title: "Toolbar",
    body: "Use the toolbar on the left to switch between tools: Select (V), Tap (Q), Drag (W), Flick (E), Hold (R), and Eraser (X). Each tool changes how clicks on the timeline behave.",
  },
  {
    title: "Timeline",
    body: "The timeline is your main editing workspace. Scroll to navigate through beats, click to place notes, and drag to select. The beat grid snaps notes to the current density.",
  },
  {
    title: "Inspector",
    body: "When you select a note or event, the Inspector shows its properties. Edit beat positions, X coordinates, speed, and easing curves directly.",
  },
  {
    title: "Keyboard Shortcuts",
    body: "Press Ctrl+K to open the command palette. Use Space for play/pause, Ctrl+Z/Ctrl+Shift+Z for undo/redo, and arrow keys to nudge selected items.",
  },
];

export function OnboardingOverlay() {
  const hasSeenOnboarding = useSettingsStore((s) => s.hasSeenOnboarding);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [visible, setVisible] = useState(true);

  const handleDismiss = useCallback(() => {
    if (dontShowAgain) {
      updateSettings({ hasSeenOnboarding: true });
    } else {
      // Just close without persisting — will show again next launch
      setVisible(false);
    }
  }, [dontShowAgain, updateSettings]);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleDismiss();
    }
  }, [currentStep, handleDismiss]);

  const handleSkip = useCallback(() => {
    handleDismiss();
  }, [handleDismiss]);

  if (hasSeenOnboarding || !visible) return null;

  const step = STEPS[currentStep];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
    >
      <div
        className="rounded-xl p-6 max-w-md w-full mx-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* Step indicator */}
        <div className="flex gap-1.5 mb-4 justify-center">
          {STEPS.map((_, idx) => (
            <div
              key={idx}
              className="rounded-full transition-all"
              style={{
                width: idx === currentStep ? 20 : 8,
                height: 8,
                backgroundColor: idx === currentStep
                  ? "var(--accent-primary)"
                  : idx < currentStep
                    ? "var(--accent-primary)"
                    : "var(--bg-active)",
                opacity: idx <= currentStep ? 1 : 0.4,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <h2 className="text-base font-bold mb-2 text-center">{step.title}</h2>
        <p
          className="text-xs leading-relaxed text-center mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          {step.body}
        </p>

        {/* Step counter */}
        <div className="text-[10px] text-center mb-4" style={{ color: "var(--text-muted)" }}>
          Step {currentStep + 1} of {STEPS.length}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={{ accentColor: "var(--accent-primary)" }}
            />
            Don't show again
          </label>

          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded text-xs"
              style={{
                backgroundColor: "var(--bg-active)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
              onClick={handleSkip}
            >
              Skip
            </button>
            <button
              className="px-4 py-1.5 rounded text-xs font-medium"
              style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
              onClick={handleNext}
            >
              {currentStep < STEPS.length - 1 ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Favorites Wizard — First-open setup for easing, preset, and
// shader favorites. Reopenable from command palette.
// ============================================================

import { useState } from "react";
import { useFavoritesStore } from "../../../stores/favoritesStore";
import { EasingStepGrid } from "./EasingStepGrid";
import { PresetStepList } from "./PresetStepList";
import { ShaderStepPlaceholder } from "./ShaderStepPlaceholder";

const STEPS = ["Easings", "Presets", "Shaders"];

export function FavoritesWizard() {
  const showWizard = useFavoritesStore((s) => s.showFavoritesWizard);
  const closeWizard = useFavoritesStore((s) => s.closeWizard);
  const completeSetup = useFavoritesStore((s) => s.completeSetup);

  const [step, setStep] = useState(0);

  if (!showWizard) return null;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      completeSetup();
      setStep(0);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    completeSetup();
    setStep(0);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWizard();
      }}
    >
      <div
        style={{
          width: 520,
          maxHeight: "80vh",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "wizFadeIn 0.2s ease-out",
        }}
      >
        <style>{`
          @keyframes wizFadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                Configure Favorites
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Pick your most-used items for quick access
              </div>
            </div>
            <button
              onClick={closeWizard}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 16,
                fontFamily: "inherit",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
                onClick={() => setStep(i)}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      i === step
                        ? "var(--accent-primary)"
                        : i < step
                          ? "var(--accent-primary)"
                          : "var(--bg-active)",
                    opacity: i === step ? 1 : 0.5,
                    transition: "all 0.2s",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: i === step ? "var(--accent-primary)" : "var(--text-muted)",
                    fontWeight: i === step ? 600 : 400,
                  }}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
          {step === 0 && <EasingStepGrid />}
          {step === 1 && <PresetStepList />}
          {step === 2 && <ShaderStepPlaceholder />}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "inherit",
              padding: "6px 12px",
            }}
          >
            Skip for now
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-active)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                padding: "6px 20px",
                borderRadius: 6,
                border: "none",
                background: "var(--accent-primary)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              {step === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

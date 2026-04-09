// ============================================================
// Preset Step — Step 2 of Favorites Wizard
// Categorized list of presets with checkboxes
// ============================================================

import { useFavoritesStore } from "../../../stores/favoritesStore";
import { BUILTIN_PRESETS } from "../../../presets/builtinPresets";

const CATEGORY_COLORS: Record<string, string> = {
  movement: "#4dabf7",
  visibility: "#cc5de8",
  rotation: "#ffd43b",
  speed: "#51cf66",
  compound: "#ff922b",
};

const CATEGORY_ORDER = ["movement", "visibility", "rotation", "speed", "compound"];

export function PresetStepList() {
  const favoritePresets = useFavoritesStore((s) => s.favoritePresetIds);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavoritePreset);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    presets: BUILTIN_PRESETS.filter((p) => p.category === cat),
  })).filter((g) => g.presets.length > 0);

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
        Select your favorite presets. They'll appear at the top of preset lists for quick application.
      </div>

      {grouped.map(({ category, presets }) => (
        <div key={category} style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 0",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: CATEGORY_COLORS[category] ?? "var(--text-muted)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {category}
            </span>
          </div>

          {presets.map((preset) => {
            const selected = favoritePresets.includes(preset.id);
            return (
              <button
                key={preset.id}
                onClick={() => toggleFavorite(preset.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 3,
                  borderRadius: 6,
                  border: selected
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-color)",
                  background: selected
                    ? "rgba(108,138,255,0.06)"
                    : "var(--bg-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "all 0.12s",
                }}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: selected
                      ? "1.5px solid var(--accent-primary)"
                      : "1.5px solid var(--border-color)",
                    background: selected ? "var(--accent-primary)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    color: "#fff",
                  }}
                >
                  {selected && "✓"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 1 }}>
                    {preset.name}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {preset.description}
                  </div>
                </div>

                {/* Category badge */}
                <span
                  style={{
                    fontSize: 8,
                    padding: "1px 5px",
                    borderRadius: 8,
                    background: `${CATEGORY_COLORS[category]}15`,
                    color: CATEGORY_COLORS[category],
                    flexShrink: 0,
                    textTransform: "uppercase",
                    fontWeight: 600,
                    letterSpacing: "0.3px",
                  }}
                >
                  {category}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

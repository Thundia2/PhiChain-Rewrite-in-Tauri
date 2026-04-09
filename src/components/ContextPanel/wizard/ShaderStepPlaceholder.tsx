// ============================================================
// Shader Step — Step 3 of Favorites Wizard (Placeholder)
// ============================================================

export function ShaderStepPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      {/* Decorative icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "rgba(108,138,255,0.08)",
          border: "1px solid rgba(108,138,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          marginBottom: 16,
        }}
      >
        ✦
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 6,
        }}
      >
        Shader Favorites
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        Shader effects and visual filters are coming in a future update.
        You'll be able to favorite your most-used shaders here.
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "4px 12px",
          borderRadius: 12,
          background: "var(--bg-active)",
          fontSize: 10,
          color: "var(--text-muted)",
        }}
      >
        Coming soon
      </div>
    </div>
  );
}

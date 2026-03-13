// ============================================================
// Texture Panel — Manage texture lines in canvas mode
//
// Shows all lines with textures, thumbnail previews, and lets
// users select, upload, change, or remove textures.
// Provides quick access to texture line properties.
// ============================================================

import { useMemo } from "react";
import { useChartStore } from "../../stores/chartStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTabStore } from "../../stores/tabStore";

function TextureThumb({ textureName }: { textureName: string }) {
  const lineTextures = useChartStore((s) => s.lineTextures);

  const url = useMemo(() => {
    const blob = lineTextures.get(textureName);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [textureName, lineTextures]);

  if (!url) {
    return (
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 4,
          background: "var(--bg-active)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        ?
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={textureName}
      style={{
        width: 40,
        height: 40,
        borderRadius: 4,
        objectFit: "cover",
        border: "1px solid var(--border)",
        background: "rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
    />
  );
}

export function TexturePanel() {
  const lines = useChartStore((s) => s.chart.lines);
  const lineTextures = useChartStore((s) => s.lineTextures);
  const setLineTexture = useChartStore((s) => s.setLineTexture);
  const removeLineTexture = useChartStore((s) => s.removeLineTexture);
  const editLine = useChartStore((s) => s.editLine);
  const addLine = useChartStore((s) => s.addLine);
  const selectedLineIndex = useEditorStore((s) => s.selectedLineIndex);
  const selectLine = useEditorStore((s) => s.selectLine);
  const openLineEventEditor = useTabStore((s) => s.openLineEventEditor);

  // Find all lines with textures
  const texturedLines = useMemo(() => {
    return lines
      .map((line, idx) => (line.texture ? { line, idx } : null))
      .filter(Boolean) as { line: (typeof lines)[0]; idx: number }[];
  }, [lines]);

  // All unique texture assets loaded
  const textureAssets = useMemo(() => {
    return [...lineTextures.entries()].map(([name, blob]) => ({
      name,
      size: blob.size,
    }));
  }, [lineTextures]);

  const handleUploadTexture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      setLineTexture(file.name, blob);
    };
    input.click();
  };

  const handleAddTextureLine = () => {
    // Create a new line, then prompt to assign a texture
    const newIndex = lines.length;
    addLine({ name: `Texture Line ${newIndex + 1}` });
    selectLine(newIndex);
    // Prompt file pick immediately
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      setLineTexture(file.name, blob);
      editLine(newIndex, { texture: file.name });
    };
    input.click();
  };

  const handleAssignTexture = (lineIdx: number, texName: string) => {
    editLine(lineIdx, { texture: texName });
  };

  const handleRemoveTexture = (lineIdx: number) => {
    editLine(lineIdx, { texture: undefined });
  };

  return (
    <div className="flex flex-col h-full text-xs" style={{ minHeight: 0 }}>
      {/* Header actions */}
      <div
        className="flex gap-1 p-1.5 border-b flex-wrap items-center"
        style={{ borderColor: "var(--border-primary)", flexShrink: 0 }}
      >
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
          onClick={handleAddTextureLine}
          title="Add a new line with a texture image"
        >
          + Texture Line
        </button>
        <button
          className="px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: "var(--bg-active)", color: "var(--text-primary)" }}
          onClick={handleUploadTexture}
          title="Upload a texture image asset"
        >
          Upload Asset
        </button>
        <span className="ml-auto" style={{ color: "var(--text-muted)", fontSize: 10 }}>
          {texturedLines.length} line{texturedLines.length !== 1 ? "s" : ""} &middot;{" "}
          {textureAssets.length} asset{textureAssets.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Texture lines section */}
        {texturedLines.length === 0 && textureAssets.length === 0 ? (
          <div className="p-3 text-center" style={{ color: "var(--text-muted)" }}>
            <div style={{ fontSize: 11, marginBottom: 4 }}>No texture lines</div>
            <div style={{ fontSize: 10 }}>
              Import an RPE chart with textures, or click "+ Texture Line" to create one.
            </div>
          </div>
        ) : (
          <>
            {/* Lines with textures */}
            {texturedLines.length > 0 && (
              <div>
                <div
                  className="px-2 py-1 font-medium"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: "var(--bg-primary)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  Texture Lines
                </div>
                {texturedLines.map(({ line, idx }) => {
                  const isSelected = selectedLineIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1.5"
                      style={{
                        backgroundColor: isSelected ? "var(--bg-active)" : "transparent",
                        borderLeft: isSelected
                          ? "2px solid var(--accent-primary)"
                          : "2px solid transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => selectLine(idx)}
                    >
                      {line.texture && <TextureThumb textureName={line.texture} />}
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate"
                          style={{
                            color: "var(--text-primary)",
                            fontSize: 11,
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {line.name || `Line ${idx + 1}`}
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                          #{idx} &middot; {line.texture}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--accent-primary)",
                            color: "#fff",
                            fontSize: 9,
                            border: "none",
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openLineEventEditor(idx, line.name || `Line ${idx + 1}`);
                          }}
                          title="Edit events for this texture line"
                        >
                          Events
                        </button>
                        <button
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--error)",
                            color: "#fff",
                            fontSize: 9,
                            border: "none",
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTexture(idx);
                          }}
                          title="Remove texture from this line"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Texture assets */}
            {textureAssets.length > 0 && (
              <div>
                <div
                  className="px-2 py-1 font-medium"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: "var(--bg-primary)",
                    borderBottom: "1px solid var(--border)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  Loaded Assets
                </div>
                {textureAssets.map((asset) => {
                  const usedBy = lines.filter((l) => l.texture === asset.name).length;
                  return (
                    <div
                      key={asset.name}
                      className="flex items-center gap-2 px-2 py-1"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <TextureThumb textureName={asset.name} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ color: "var(--text-primary)", fontSize: 10 }}>
                          {asset.name}
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                          {(asset.size / 1024).toFixed(0)} KB &middot; used by {usedBy} line
                          {usedBy !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {/* Assign to selected line button */}
                        {selectedLineIndex !== null && !lines[selectedLineIndex]?.texture && (
                          <button
                            className="px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--accent-primary)",
                              color: "#fff",
                              fontSize: 9,
                              border: "none",
                              cursor: "pointer",
                            }}
                            onClick={() => handleAssignTexture(selectedLineIndex, asset.name)}
                            title={`Assign to selected line`}
                          >
                            Assign
                          </button>
                        )}
                        {usedBy === 0 && (
                          <button
                            className="px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--error)",
                              color: "#fff",
                              fontSize: 9,
                              border: "none",
                              cursor: "pointer",
                            }}
                            onClick={() => removeLineTexture(asset.name)}
                            title="Remove unused asset"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

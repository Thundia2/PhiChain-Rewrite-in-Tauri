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
import { SectionHeader, ActionButton, EmptyState } from "../common/UIKit";

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
          borderRadius: 6,
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
        borderRadius: 6,
        objectFit: "cover",
        border: "1px solid var(--border-color)",
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12, minHeight: 0 }}>
      {/* Header actions */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
          flexWrap: "wrap",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <ActionButton variant="primary" onClick={handleAddTextureLine} title="Add a new line with a texture image">
          + Texture Line
        </ActionButton>
        <ActionButton variant="default" onClick={handleUploadTexture} title="Upload a texture image asset">
          Upload Asset
        </ActionButton>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 10 }}>
          {texturedLines.length} line{texturedLines.length !== 1 ? "s" : ""} &middot;{" "}
          {textureAssets.length} asset{textureAssets.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Empty state */}
        {texturedLines.length === 0 && textureAssets.length === 0 ? (
          <EmptyState>
            <div style={{ fontSize: 11, marginBottom: 4 }}>No texture lines</div>
            <div style={{ fontSize: 10 }}>
              Import an RPE chart with textures, or click "+ Texture Line" to create one.
            </div>
          </EmptyState>
        ) : (
          <>
            {/* Lines with textures */}
            {texturedLines.length > 0 && (
              <div>
                <div style={{ padding: "4px 12px" }}>
                  <SectionHeader>Texture Lines</SectionHeader>
                </div>
                <div
                  style={{
                    backgroundColor: "var(--bg-active)",
                    borderRadius: 10,
                    overflow: "hidden",
                    margin: "0 8px 8px",
                  }}
                >
                  {texturedLines.map(({ line, idx }, i) => {
                    const isSelected = selectedLineIndex === idx;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderBottom: i < texturedLines.length - 1 ? "1px solid rgba(42, 42, 53, 0.55)" : "none",
                          borderLeft: isSelected
                            ? "2px solid var(--accent-primary)"
                            : "2px solid transparent",
                          background: isSelected ? "rgba(108, 138, 255, 0.06)" : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => selectLine(idx)}
                      >
                        {line.texture && <TextureThumb textureName={line.texture} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: "var(--text-primary)",
                              fontSize: 11,
                              fontWeight: isSelected ? 600 : 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {line.name || `Line ${idx + 1}`}
                          </div>
                          <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                            #{idx} &middot; {line.texture}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <ActionButton
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              openLineEventEditor(idx, line.name || `Line ${idx + 1}`);
                            }}
                            title="Edit events for this texture line"
                          >
                            Events
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTexture(idx);
                            }}
                            title="Remove texture from this line"
                          >
                            X
                          </ActionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Texture assets */}
            {textureAssets.length > 0 && (
              <div>
                <div style={{ padding: "4px 12px" }}>
                  <SectionHeader>Loaded Assets</SectionHeader>
                </div>
                <div
                  style={{
                    backgroundColor: "var(--bg-active)",
                    borderRadius: 10,
                    overflow: "hidden",
                    margin: "0 8px 8px",
                  }}
                >
                  {textureAssets.map((asset, i) => {
                    const usedBy = lines.filter((l) => l.texture === asset.name).length;
                    return (
                      <div
                        key={asset.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderBottom: i < textureAssets.length - 1 ? "1px solid rgba(42, 42, 53, 0.55)" : "none",
                        }}
                      >
                        <TextureThumb textureName={asset.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: "var(--text-primary)",
                              fontSize: 10,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {asset.name}
                          </div>
                          <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
                            {(asset.size / 1024).toFixed(0)} KB &middot; used by {usedBy} line
                            {usedBy !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {/* Assign to selected line button */}
                          {selectedLineIndex !== null && !lines[selectedLineIndex]?.texture && (
                            <ActionButton
                              variant="primary"
                              onClick={() => handleAssignTexture(selectedLineIndex, asset.name)}
                              title="Assign to selected line"
                            >
                              Assign
                            </ActionButton>
                          )}
                          {usedBy === 0 && (
                            <ActionButton
                              variant="danger"
                              onClick={() => removeLineTexture(asset.name)}
                              title="Remove unused asset"
                            >
                              Delete
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

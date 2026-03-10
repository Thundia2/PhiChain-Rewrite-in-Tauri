// ============================================================
// Unified Editor Tab — Layout Shell
//
// The top-level layout for the unified canvas editor.
// Composes: Toolbar (left) + LineStrip + Canvas + LineDrawer
//           + Inspector (right) + KeyframeBar (bottom)
//           + StatusBar (bottom)
//
// This is rendered when the active tab type is "unified_editor".
// ============================================================

import { Toolbar } from "../Toolbar/Toolbar";
import { UnifiedCanvas } from "./UnifiedCanvas";
import { UnifiedInspector } from "./UnifiedInspector";
import { KeyframeBar } from "../KeyframeBar/KeyframeBar";
import { LineStrip } from "../LineStrip/LineStrip";
import { LineDrawer } from "../LineDrawer/LineDrawer";
import { StatusBar } from "../StatusBar/StatusBar";

export function UnifiedEditorTab() {
  return (
    <div
      className="unified-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {/* Main content area: Toolbar + Center + Inspector */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left toolbar */}
        <Toolbar />

        {/* Center column: LineStrip + Canvas + LineDrawer overlay */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Line Strip (30px) */}
          <LineStrip />

          {/* Canvas area with LineDrawer overlay */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <UnifiedCanvas />
            <LineDrawer />
          </div>
        </div>

        {/* Right: Inspector sidebar */}
        <UnifiedInspector />
      </div>

      {/* Bottom: Keyframe bar */}
      <KeyframeBar />

      {/* Bottom: Status bar */}
      <StatusBar />
    </div>
  );
}

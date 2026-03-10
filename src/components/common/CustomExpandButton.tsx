// ============================================================
// Custom Expand Button for Mosaic Panels
//
// First click:  Expands (maximizes) the panel within the mosaic.
// Second click: Opens the panel as a standalone tab.
//
// Uses react-mosaic-component's context API to perform the
// expand action, and the app's tabStore to open standalone tabs.
// ============================================================

import { useContext, useCallback } from "react";
import {
  MosaicContext,
  MosaicWindowContext,
} from "react-mosaic-component";
import type { PanelId } from "../../types/editor";

interface Props {
  panelId: PanelId;
  /** Whether this panel is currently maximized in the mosaic */
  isExpanded: boolean;
  /** Called when the panel should be expanded (maximized) */
  onExpand: (panelId: PanelId) => void;
  /** Called when the panel should be opened as a standalone tab */
  onOpenAsTab: (panelId: PanelId) => void;
}

export function CustomExpandButton({ panelId, isExpanded, onExpand, onOpenAsTab }: Props) {
  const mosaicCtx = useContext(MosaicContext);
  const windowCtx = useContext(MosaicWindowContext);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isExpanded) {
        // Already expanded → open as standalone tab
        onOpenAsTab(panelId);
      } else {
        // First click → expand (maximize) in mosaic
        if (mosaicCtx?.mosaicActions && windowCtx?.mosaicWindowActions) {
          const path = windowCtx.mosaicWindowActions.getPath();
          mosaicCtx.mosaicActions.expand(path, 100);
        }
        onExpand(panelId);
      }
    },
    [panelId, isExpanded, onExpand, onOpenAsTab, mosaicCtx, windowCtx],
  );

  return (
    <button
      className={`mosaic-default-control bp3-button bp3-minimal custom-expand-button ${isExpanded ? "is-expanded" : ""}`}
      title={isExpanded ? "Open in tab" : "Expand"}
      onClick={handleClick}
    />
  );
}

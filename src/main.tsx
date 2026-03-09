import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { useChartStore } from "./stores/chartStore";
import { useAudioStore } from "./stores/audioStore";
import { useEditorStore } from "./stores/editorStore";
import { useTabStore } from "./stores/tabStore";
import { useRespackStore } from "./stores/respackStore";

// Expose stores on window for debugging (dev only)
if (import.meta.env.DEV) {
  (window as Record<string, unknown>).__chartStore = useChartStore;
  (window as Record<string, unknown>).__audioStore = useAudioStore;
  (window as Record<string, unknown>).__editorStore = useEditorStore;
  (window as Record<string, unknown>).__tabStore = useTabStore;
  (window as Record<string, unknown>).__respackStore = useRespackStore;
}

// Initialize respacks from IndexedDB (non-blocking)
useRespackStore.getState().initFromDb().catch((err) => {
  console.warn("Failed to initialize respacks from IndexedDB:", err);
});

// Suppress known warnings from react-mosaic-component's react-dnd dependency
// which hasn't been updated for React 19. These are cosmetic and don't affect
// functionality. Remove this once react-mosaic-component updates react-dnd.
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === "string" ? args[0] : "";
  if (
    msg.includes("Accessing element.ref was removed in React 19") ||
    msg.includes("Each child in a list should have a unique")
  ) {
    return;
  }
  origConsoleError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

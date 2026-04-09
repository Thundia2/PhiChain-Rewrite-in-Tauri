// ============================================================
// usePopoutWindow — Shared hook for pop-out windows
//
// Recent change: Added Tauri fallback. window.open() is blocked
// by Tauri's WebView2, so when running inside Tauri we render a
// draggable floating overlay in the main window instead. The API
// surface (containerEl, isPopped, openPopout, closePopout) stays
// identical — consumers don't need to know which mode is active.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { isTauri } from "../utils/ipc";

/** Copy all stylesheets from the parent window into a child window */
export function copyStylesToWindow(targetDoc: Document) {
  // Copy <style> tags
  document.querySelectorAll("style").forEach((style) => {
    const clone = targetDoc.createElement("style");
    clone.textContent = style.textContent;
    targetDoc.head.appendChild(clone);
  });

  // Copy <link rel="stylesheet"> tags
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const clone = targetDoc.createElement("link");
    clone.rel = "stylesheet";
    clone.href = (link as HTMLLinkElement).href;
    targetDoc.head.appendChild(clone);
  });
}

export interface PopoutWindowOptions {
  width?: number;
  height?: number;
  windowName?: string;
}

export interface PopoutWindowResult {
  popoutWindow: Window | null;
  containerEl: HTMLDivElement | null;
  isPopped: boolean;
  openPopout: () => void;
  closePopout: () => void;
}

// ---- Floating overlay styles (used as Tauri fallback) ----

function createFloatingOverlay(title: string, width: number, height: number): {
  overlay: HTMLDivElement;
  container: HTMLDivElement;
} {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 50px; left: 50%;
    transform: translateX(-50%);
    width: ${width}px; height: ${height}px;
    min-width: 200px; min-height: 150px;
    background: var(--bg-primary, #111118);
    border: 1px solid var(--border-color, #2a2a35);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
    z-index: 9000;
    display: flex; flex-direction: column;
    overflow: hidden;
    resize: both;
  `;

  // ---- Title bar (draggable) ----
  const titleBar = document.createElement("div");
  titleBar.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px;
    background: var(--bg-secondary, #1a1a24);
    border-bottom: 1px solid var(--border-color, #2a2a35);
    cursor: grab; user-select: none; flex-shrink: 0;
    font-size: 11px; font-family: inherit;
    color: var(--text-secondary, #aaa);
  `;
  titleBar.textContent = title;

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715";
  closeBtn.style.cssText = `
    background: none; border: none; color: var(--text-muted, #666);
    font-size: 13px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
    line-height: 1;
  `;
  closeBtn.onmouseenter = () => { closeBtn.style.background = "rgba(255,255,255,0.08)"; closeBtn.style.color = "#fff"; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = "none"; closeBtn.style.color = "var(--text-muted, #666)"; };
  titleBar.appendChild(closeBtn);

  // ---- Content container (for React portal) ----
  const container = document.createElement("div");
  container.style.cssText = `
    flex: 1; overflow: auto;
    color: var(--text-primary, #e0e0e8);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  `;

  overlay.appendChild(titleBar);
  overlay.appendChild(container);

  // ---- Drag logic ----
  let isDragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  titleBar.addEventListener("mousedown", (e) => {
    if (e.target === closeBtn) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = overlay.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    titleBar.style.cursor = "grabbing";
    e.preventDefault();
  });

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    overlay.style.left = `${startLeft + dx}px`;
    overlay.style.top = `${startTop + dy}px`;
    overlay.style.transform = "none"; // Remove the initial centering transform
  };

  const onMouseUp = () => {
    isDragging = false;
    titleBar.style.cursor = "grab";
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // Store cleanup for later
  (overlay as any).__cleanupDrag = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
  (overlay as any).__closeBtn = closeBtn;

  return { overlay, container };
}

/** Hook to manage a popout window with React portal rendering.
 *  In Tauri: renders a draggable floating overlay in the main window.
 *  In browser: opens a real OS window via window.open(). */
export function usePopoutWindow(
  title: string,
  options: PopoutWindowOptions = {},
): PopoutWindowResult {
  const { width = 800, height = 500, windowName = "" } = options;

  const [popoutWindow, setPopoutWindow] = useState<Window | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const windowRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const openPopout = useCallback(() => {
    // ---- Tauri mode: floating overlay (window.open is blocked by WebView2) ----
    if (isTauri()) {
      if (overlayRef.current) return; // Already open

      const { overlay, container } = createFloatingOverlay(title, width, height);
      document.body.appendChild(overlay);
      overlayRef.current = overlay;

      // Wire close button
      const closeBtn = (overlay as any).__closeBtn as HTMLButtonElement;
      closeBtn.onclick = () => {
        (overlay as any).__cleanupDrag?.();
        overlay.remove();
        overlayRef.current = null;
        setPopoutWindow(null);
        setContainerEl(null);
      };

      // Use window as the "popoutWindow" for compatibility with isPopped checks
      setPopoutWindow(window);
      setContainerEl(container);
      return;
    }

    // ---- Browser mode: real OS window ----
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return;
    }

    const features = `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no`;
    const w = window.open("", windowName, features);
    if (!w) return;

    w.document.title = title;
    copyStylesToWindow(w.document);

    // Match app theme
    w.document.body.style.margin = "0";
    w.document.body.style.padding = "0";
    w.document.body.style.backgroundColor = "var(--bg-primary, #111118)";
    w.document.body.style.color = "var(--text-primary, #e0e0e8)";
    w.document.body.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
    w.document.body.style.overflow = "hidden";
    w.document.body.style.height = "100vh";

    // Create container for React portal
    const container = w.document.createElement("div");
    container.id = "popout-root";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    w.document.body.appendChild(container);

    windowRef.current = w;
    setPopoutWindow(w);
    setContainerEl(container);

    // Clear any previous interval
    if (intervalRef.current !== null) clearInterval(intervalRef.current);

    // Poll for window close
    intervalRef.current = setInterval(() => {
      if (w.closed) {
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = null;
        windowRef.current = null;
        setPopoutWindow(null);
        setContainerEl(null);
      }
    }, 500);
  }, [title, width, height, windowName]);

  const closePopout = useCallback(() => {
    // ---- Tauri mode: remove floating overlay ----
    if (overlayRef.current) {
      (overlayRef.current as any).__cleanupDrag?.();
      overlayRef.current.remove();
      overlayRef.current = null;
      setPopoutWindow(null);
      setContainerEl(null);
      return;
    }

    // ---- Browser mode: close real window ----
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close();
    }
    windowRef.current = null;
    setPopoutWindow(null);
    setContainerEl(null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Tauri overlay cleanup
      if (overlayRef.current) {
        (overlayRef.current as any).__cleanupDrag?.();
        overlayRef.current.remove();
        overlayRef.current = null;
      }
      // Browser window cleanup
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close();
      }
    };
  }, []);

  return {
    popoutWindow,
    containerEl,
    isPopped: containerEl !== null,
    openPopout,
    closePopout,
  };
}

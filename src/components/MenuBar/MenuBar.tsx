import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { useChartStore } from "../../stores/chartStore";
import { useTabStore, type TabType } from "../../stores/tabStore";
import { useAudioStore } from "../../stores/audioStore";
import { audioEngine } from "../../audio/audioEngine";
import { saveProject, exportAsOfficial } from "../../utils/ipc";
import { convertRpeToPhichain, extractRpeMeta } from "../../utils/rpeImport";
import { convertPhichainToRpe } from "../../utils/rpeExport";
import { convertPecToPhichain } from "../../utils/pecImport";
import type { PanelId } from "../../types/editor";

// ============================================================
// CONFIGURABLE: Menu structure
// Add/remove/reorder menu items here.
// ============================================================
interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

function useMenus(
  onTogglePanel?: (id: PanelId) => void,
  onResetLayout?: () => void,
  onNewChart?: () => void,
  onOpenSettings?: () => void,
): Menu[] {
  const projectPath = useChartStore((s) => s.projectPath);
  const getChartJson = useChartStore((s) => s.getChartJson);
  const markClean = useChartStore((s) => s.markClean);
  const closeProject = useChartStore((s) => s.closeProject);
  const undo = useChartStore((s) => s.undo);
  const redo = useChartStore((s) => s.redo);
  const canUndo = useChartStore((s) => s.canUndo);
  const canRedo = useChartStore((s) => s.canRedo);
  const isLoaded = useChartStore((s) => s.isLoaded);
  const getMeta = useChartStore((s) => s.meta);
  const openUnifiedEditor = useTabStore((s) => s.openUnifiedEditor);

  return [
    {
      label: "File",
      items: [
        { label: "New Chart...", shortcut: "Ctrl+N", action: onNewChart },
        { separator: true, label: "" },
        {
          label: "Save Project",
          shortcut: "Ctrl+S",
          disabled: !isLoaded,
          action: async () => {
            if (!projectPath) return;
            try {
              await saveProject(projectPath, getChartJson());
              markClean();
            } catch (e) {
              console.error("Save failed:", e);
            }
          },
        },
        { label: "Close Project", disabled: !isLoaded, action: closeProject },
        { separator: true, label: "" },
        {
          label: "Import RPE Chart...",
          action: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,.zip";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                let chartText: string;
                let musicBlob: Blob | null = null;
                let musicExt: string | null = null;
                let illustrationBlob: Blob | null = null;

                if (file.name.toLowerCase().endsWith(".zip")) {
                  // ZIP import: extract chart JSON, music, and illustration
                  const zipData = await file.arrayBuffer();
                  const zip = await JSZip.loadAsync(zipData);

                  let chartEntry: JSZip.JSZipObject | null = null;
                  let audioEntry: JSZip.JSZipObject | null = null;
                  let imageEntry: JSZip.JSZipObject | null = null;

                  zip.forEach((relativePath, entry) => {
                    if (entry.dir) return;
                    const baseName = relativePath.split("/").pop()?.toLowerCase() ?? "";
                    if (baseName.endsWith(".json") && !chartEntry) {
                      chartEntry = entry;
                    } else if (/\.(mp3|ogg|wav|flac|m4a)$/.test(baseName) && !audioEntry) {
                      audioEntry = entry;
                      musicExt = baseName.split(".").pop() ?? "mp3";
                    } else if (/\.(jpg|jpeg|png|webp)$/.test(baseName) && !imageEntry) {
                      imageEntry = entry;
                    }
                  });

                  if (!chartEntry) {
                    throw new Error("No .json chart file found in the zip archive.");
                  }
                  chartText = await chartEntry.async("string");

                  if (audioEntry) {
                    musicBlob = await (audioEntry as JSZip.JSZipObject).async("blob");
                  }
                  if (imageEntry) {
                    illustrationBlob = await (imageEntry as JSZip.JSZipObject).async("blob");
                  }
                } else {
                  // Plain JSON import
                  chartText = await file.text();
                }

                const chart = convertRpeToPhichain(chartText);
                const meta = extractRpeMeta(chartText);
                const cs = useChartStore.getState();

                cs.loadFromProjectData({
                  project_path: null,
                  music_path: null,
                  illustration_path: null,
                  meta,
                  chart_json: JSON.stringify(chart),
                });

                // Load music if found in zip
                if (musicBlob && musicExt) {
                  const musicUrl = URL.createObjectURL(musicBlob);
                  await audioEngine.load(musicUrl, musicExt);
                  useAudioStore.getState().setMusicLoaded(true);
                }

                // Load illustration if found in zip
                if (illustrationBlob) {
                  const illustrationUrl = URL.createObjectURL(illustrationBlob);
                  await cs.loadIllustration(illustrationUrl);
                }

                useTabStore.getState().openChart("rpe-import", meta.name || "Imported RPE Chart");
              } catch (e) {
                console.error("RPE import failed:", e);
                alert("Failed to import RPE chart. Check the console for details.");
              }
            };
            input.click();
          },
        },
        {
          label: "Import PEC Chart...",
          action: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".pec,.txt";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const pecText = await file.text();
                const chart = convertPecToPhichain(pecText);
                const cs = useChartStore.getState();

                cs.loadFromProjectData({
                  project_path: null,
                  music_path: null,
                  illustration_path: null,
                  meta: { name: file.name.replace(/\.(pec|txt)$/i, ""), composer: "", charter: "", illustrator: "", level: "" },
                  chart_json: JSON.stringify(chart),
                });

                useTabStore.getState().openChart("pec-import", file.name.replace(/\.(pec|txt)$/i, "") || "Imported PEC Chart");
              } catch (e) {
                console.error("PEC import failed:", e);
                alert("Failed to import PEC chart. Check the console for details.");
              }
            };
            input.click();
          },
        },
        { separator: true, label: "" },
        { label: "Preferences...", action: onOpenSettings },
        { separator: true, label: "" },
        { label: "Quit", action: () => console.log("TODO: quit") },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo(), action: undo },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: !canRedo(), action: redo },
      ],
    },
    {
      label: "Windows",
      items: [
        { label: "Timeline", action: () => onTogglePanel?.("timeline") },
        { label: "Inspector", action: () => onTogglePanel?.("inspector") },
        { label: "Line List", action: () => onTogglePanel?.("line-list") },
        { label: "Toolbar", action: () => onTogglePanel?.("toolbar") },
        { label: "Timeline Settings", action: () => onTogglePanel?.("timeline-settings") },
        { label: "BPM List", action: () => onTogglePanel?.("bpm-list") },
        { label: "Chart Settings", action: () => onTogglePanel?.("chart-settings") },
        { separator: true, label: "" },
        { label: "Validation", action: () => onTogglePanel?.("validation") },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Unified Editor",
          disabled: !isLoaded,
          action: () => openUnifiedEditor(),
        },
        { separator: true, label: "" },
        {
          label: "Classic Editor",
          disabled: !isLoaded,
          action: () => {
            const ts = useTabStore.getState();
            const chartTab = ts.tabs.find((t) => t.type === "chart");
            if (chartTab) {
              ts.setActiveTab(chartTab.id);
            } else {
              // Create a classic chart tab if none exists
              const meta = useChartStore.getState().meta;
              ts.openTab({
                id: "chart:current",
                type: "chart",
                label: meta.name || "Chart",
                closable: true,
              });
            }
          },
        },
      ],
    },
    {
      label: "Export",
      items: [
        {
          label: "Export as Official",
          disabled: !isLoaded,
          action: async () => {
            try {
              const result = await exportAsOfficial(getChartJson());
              console.log("Export result:", result);
            } catch (e) {
              console.error("Export failed:", e);
            }
          },
        },
        {
          label: "Export as RPE JSON",
          disabled: !isLoaded,
          action: () => {
            try {
              const chart = JSON.parse(getChartJson());
              const meta = useChartStore.getState().meta;
              const rpeJson = convertPhichainToRpe(chart, meta);
              // Download as file
              const blob = new Blob([rpeJson], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${meta.name || "chart"}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("RPE export failed:", e);
              alert("Failed to export RPE chart. Check the console for details.");
            }
          },
        },
      ],
    },
    {
      label: "Layout",
      items: [
        { label: "Apply Default Layout", action: onResetLayout },
      ],
    },
  ];
}

export function MenuBar({
  onTogglePanel,
  onResetLayout,
  onNewChart,
  onOpenSettings,
}: {
  onTogglePanel?: (id: PanelId) => void;
  onResetLayout?: () => void;
  onNewChart?: () => void;
  onOpenSettings?: () => void;
}) {
  const MENUS = useMenus(onTogglePanel, onResetLayout, onNewChart, onOpenSettings);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={menuRef}
      className="flex items-center h-7 px-2 gap-1 flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {MENUS.map((menu, menuIndex) => (
        <div key={menu.label} className="relative">
          <button
            className="px-3 py-1 text-xs rounded hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-primary)" }}
            onClick={() => setOpenMenu(openMenu === menuIndex ? null : menuIndex)}
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(menuIndex);
            }}
          >
            {menu.label}
          </button>

          {openMenu === menuIndex && (
            <div
              className="absolute top-full left-0 mt-0.5 py-1 min-w-48 rounded shadow-xl z-50"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div
                    key={i}
                    className="my-1 mx-2"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  />
                ) : (
                  <button
                    key={item.label}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/10 transition-colors disabled:opacity-40"
                    style={{ color: "var(--text-primary)" }}
                    disabled={item.disabled}
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span style={{ color: "var(--text-muted)" }}>{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

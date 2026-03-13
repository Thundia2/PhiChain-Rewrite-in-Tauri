import type JSZip from "jszip";
import { useChartStore } from "../stores/chartStore";
import { useTabStore } from "../stores/tabStore";
import { useAudioStore } from "../stores/audioStore";
import { audioEngine } from "../audio/audioEngine";
import { saveProject } from "../utils/ipc";
import type { ExtraConfig } from "../types/extra";
import type { PanelId } from "../types/editor";
import { useEditorStore } from "../stores/editorStore";
import { useGroupStore } from "../stores/groupStore";
import { useRecentProjectsStore } from "../stores/recentProjectsStore";
import { useToastStore } from "../stores/toastStore";
import { saveStoredProject } from "../utils/projectStorage";
import { showConfirm } from "../components/common/ConfirmDialog";

/** Helper to pick a file via a temporary input element. Returns null if cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
        window.removeEventListener("focus", onFocus);
      }, 300);
    };
    window.addEventListener("focus", onFocus);
    input.click();
  });
}

export interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

export function useMenus(
  onTogglePanel?: (id: PanelId) => void,
  onResetLayout?: () => void,
  onNewChart?: () => void,
  onShowParametric?: () => void,
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
            input.accept = ".json,.zip,.pez";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                let chartText: string;
                let musicBlob: Blob | null = null;
                let musicExt: string | null = null;
                let illustrationBlob: Blob | null = null;
                let extraJson: string | null = null;
                let groupsJson: string | null = null;
                let fontEntry: JSZip.JSZipObject | null = null;
                let infoYmlEntry: JSZip.JSZipObject | null = null;

                if (file.name.toLowerCase().endsWith(".zip") || file.name.toLowerCase().endsWith(".pez")) {
                  const { default: JSZipLib } = await import("jszip");
                  const zipData = await file.arrayBuffer();
                  const zip = await JSZipLib.loadAsync(zipData);

                  let chartEntry: JSZip.JSZipObject | null = null;
                  let audioEntry: JSZip.JSZipObject | null = null;
                  let imageEntry: JSZip.JSZipObject | null = null;
                  let extraEntry: JSZip.JSZipObject | null = null;
                  let groupsEntry: JSZip.JSZipObject | null = null;

                  zip.forEach((relativePath, entry) => {
                    if (entry.dir) return;
                    const baseName = relativePath.split("/").pop()?.toLowerCase() ?? "";
                    if ((baseName === "info.yml" || baseName === "info.yaml") && !infoYmlEntry) {
                      infoYmlEntry = entry;
                    } else if (baseName === "groups.json" && !groupsEntry) {
                      groupsEntry = entry;
                    } else if (baseName === "extra.json" && !extraEntry) {
                      extraEntry = entry;
                    } else if (baseName.endsWith(".json") && !chartEntry) {
                      chartEntry = entry;
                    } else if (/\.(mp3|ogg|wav|flac|m4a)$/.test(baseName) && !audioEntry) {
                      audioEntry = entry;
                      musicExt = baseName.split(".").pop() ?? "mp3";
                    } else if (/\.(jpg|jpeg|png|webp)$/.test(baseName) && !imageEntry) {
                      imageEntry = entry;
                    } else if (/\.(otf|ttf|woff|woff2)$/.test(baseName) && !fontEntry) {
                      fontEntry = entry;
                    }
                  });

                  if (!chartEntry) {
                    throw new Error("No .json chart file found in the zip archive.");
                  }
                  chartText = await (chartEntry as JSZip.JSZipObject).async("string");

                  if (audioEntry) {
                    musicBlob = await (audioEntry as JSZip.JSZipObject).async("blob");
                  }
                  if (imageEntry) {
                    illustrationBlob = await (imageEntry as JSZip.JSZipObject).async("blob");
                  }
                  if (extraEntry) {
                    extraJson = await (extraEntry as JSZip.JSZipObject).async("string");
                  }
                  if (groupsEntry) {
                    groupsJson = await (groupsEntry as JSZip.JSZipObject).async("string");
                  }
                } else {
                  chartText = await file.text();
                }

                const { convertRpeToPhichain, extractRpeMeta } = await import("../utils/rpeImport");
                const chart = convertRpeToPhichain(chartText);
                const meta = extractRpeMeta(chartText);

                // Parse info.yml if present (Phira extended metadata)
                if (infoYmlEntry) {
                  try {
                    const { parsePhiraInfoYml } = await import("../utils/infoYmlParser");
                    const infoYmlText = await (infoYmlEntry as JSZip.JSZipObject).async("string");
                    const phiraMeta = parsePhiraInfoYml(infoYmlText);
                    Object.assign(meta, phiraMeta);
                  } catch { /* ignore invalid info.yml */ }
                }

                const cs = useChartStore.getState();

                cs.loadFromProjectData({
                  project_path: "",
                  music_path: null,
                  illustration_path: null,
                  meta,
                  chart_json: JSON.stringify(chart),
                });

                if (musicBlob && musicExt) {
                  const musicUrl = URL.createObjectURL(musicBlob);
                  await audioEngine.load(musicUrl, musicExt);
                  useAudioStore.getState().setMusicLoaded(true);
                }

                if (illustrationBlob) {
                  const illustrationUrl = URL.createObjectURL(illustrationBlob);
                  await cs.loadIllustration(illustrationUrl);
                }

                if (extraJson) {
                  try {
                    cs.setExtraConfig(JSON.parse(extraJson) as ExtraConfig);
                  } catch { /* ignore invalid extra.json */ }
                }

                if (groupsJson) {
                  try {
                    useGroupStore.getState().loadGroupsJson(groupsJson);
                  } catch { /* ignore invalid groups.json */ }
                }

                if (fontEntry) {
                  try {
                    const fontBlob = await (fontEntry as JSZip.JSZipObject).async("blob");
                    const fontUrl = URL.createObjectURL(fontBlob);
                    const fontFace = new FontFace("ChartCustomFont", `url(${fontUrl})`);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                    cs.setChartFontFamily("ChartCustomFont");
                  } catch (e) {
                    console.warn("Failed to load chart font:", e);
                  }
                }

                if (file.name.toLowerCase().endsWith(".zip") || file.name.toLowerCase().endsWith(".pez")) {
                  const textureNames = new Set<string>();
                  for (const line of chart.lines) {
                    if (line.texture && line.texture !== "line.png") {
                      textureNames.add(line.texture);
                    }
                  }
                  if (textureNames.size > 0) {
                    const { default: JSZipLib2 } = await import("jszip");
                    const zip2 = await JSZipLib2.loadAsync(await file.arrayBuffer());
                    for (const texName of textureNames) {
                      let texEntry: JSZip.JSZipObject | null = null;
                      zip2.forEach((relativePath, entry) => {
                        if (entry.dir) return;
                        const baseName = relativePath.split("/").pop() ?? "";
                        if (baseName === texName && !texEntry) {
                          texEntry = entry;
                        }
                      });
                      if (texEntry) {
                        const texBlob = await (texEntry as JSZip.JSZipObject).async("blob");
                        cs.setLineTexture(texName, texBlob);
                      }
                    }
                  }
                }

                let totalNotes = 0;
                for (const line of chart.lines) totalNotes += line.notes?.length ?? 0;
                const projectId = crypto.randomUUID();
                await saveStoredProject({
                  id: projectId,
                  chartJson: JSON.stringify(chart),
                  meta,
                  audioBlob: musicBlob ? await musicBlob.arrayBuffer() : null,
                  audioExt: musicExt ?? null,
                  savedAt: Date.now(),
                });
                useRecentProjectsStore.getState().addRecent({
                  id: projectId,
                  name: meta.name || file.name.replace(/\.(json|zip|pez)$/i, ""),
                  composer: meta.composer || "",
                  level: meta.level || "",
                  lineCount: chart.lines.length,
                  noteCount: totalNotes,
                  importType: "rpe",
                });

                useTabStore.getState().openChart("rpe-import", meta.name || "Imported RPE Chart");
              } catch (e) {
                console.error("RPE import failed:", e);
                useToastStore.getState().addToast({ message: "Failed to import RPE chart. Check the console for details.", type: "error" });
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
                const { convertPecToPhichain } = await import("../utils/pecImport");
                const chart = convertPecToPhichain(pecText);
                const cs = useChartStore.getState();

                cs.loadFromProjectData({
                  project_path: "",
                  music_path: null,
                  illustration_path: null,
                  meta: { name: file.name.replace(/\.(pec|txt)$/i, ""), composer: "", charter: "", illustrator: "", level: "" },
                  chart_json: JSON.stringify(chart),
                });

                const chartName = file.name.replace(/\.(pec|txt)$/i, "");
                const pecMeta = { name: chartName, composer: "", charter: "", illustrator: "", level: "" };
                let totalNotes = 0;
                for (const line of chart.lines) totalNotes += line.notes?.length ?? 0;
                const projectId = crypto.randomUUID();
                await saveStoredProject({
                  id: projectId,
                  chartJson: JSON.stringify(chart),
                  meta: pecMeta,
                  audioBlob: null,
                  audioExt: null,
                  savedAt: Date.now(),
                });
                useRecentProjectsStore.getState().addRecent({
                  id: projectId,
                  name: chartName,
                  composer: "",
                  level: "",
                  lineCount: chart.lines.length,
                  noteCount: totalNotes,
                  importType: "pec",
                });

                useTabStore.getState().openChart("pec-import", chartName || "Imported PEC Chart");
              } catch (e) {
                console.error("PEC import failed:", e);
                useToastStore.getState().addToast({ message: "Failed to import PEC chart. Check the console for details.", type: "error" });
              }
            };
            input.click();
          },
        },
        {
          label: "Import Official Chart...",
          action: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const jsonText = await file.text();
                const { convertOfficialToPhichain } = await import("../utils/officialImport");
                const chart = convertOfficialToPhichain(jsonText);
                const cs = useChartStore.getState();

                cs.loadFromProjectData({
                  project_path: "",
                  music_path: null,
                  illustration_path: null,
                  meta: { name: file.name.replace(/\.json$/i, ""), composer: "", charter: "", illustrator: "", level: "" },
                  chart_json: JSON.stringify(chart),
                });

                const chartName = file.name.replace(/\.json$/i, "");
                const officialMeta = { name: chartName, composer: "", charter: "", illustrator: "", level: "" };
                let totalNotes = 0;
                for (const line of chart.lines) totalNotes += line.notes?.length ?? 0;
                const projectId = crypto.randomUUID();
                await saveStoredProject({
                  id: projectId,
                  chartJson: JSON.stringify(chart),
                  meta: officialMeta,
                  audioBlob: null,
                  audioExt: null,
                  savedAt: Date.now(),
                });
                useRecentProjectsStore.getState().addRecent({
                  id: projectId,
                  name: chartName,
                  composer: "",
                  level: "",
                  lineCount: chart.lines.length,
                  noteCount: totalNotes,
                  importType: "official",
                });

                useTabStore.getState().openChart("official-import", chartName || "Imported Official Chart");
              } catch (e) {
                console.error("Official chart import failed:", e);
                useToastStore.getState().addToast({ message: "Failed to import Official chart. Check the console for details.", type: "error" });
              }
            };
            input.click();
          },
        },
        {
          label: "Import extra.json...",
          action: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const config = JSON.parse(text) as ExtraConfig;
                useChartStore.getState().setExtraConfig(config);
              } catch (e) {
                console.error("extra.json import failed:", e);
                useToastStore.getState().addToast({ message: "Failed to import extra.json. Check the console for details.", type: "error" });
              }
            };
            input.click();
          },
        },
        {
          label: "Export extra.json",
          disabled: !isLoaded,
          action: () => {
            const config = useChartStore.getState().extraConfig;
            const json = JSON.stringify(config, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "extra.json";
            a.click();
            URL.revokeObjectURL(url);
          },
        },
        { separator: true, label: "" },
        { label: "Quit", action: () => console.log("TODO: quit") },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo(), action: undo },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: !canRedo(), action: redo },
        { separator: true, label: "" },
        {
          label: "Create Group from Selection",
          shortcut: "Ctrl+G",
          disabled: !isLoaded,
          action: () => {
            const es = useEditorStore.getState();
            const gs = useGroupStore.getState();
            const linesToAdd = es.multiSelectedLineIndices.length > 0
              ? es.multiSelectedLineIndices
              : es.selectedLineIndex !== null ? [es.selectedLineIndex] : [];
            if (linesToAdd.length === 0) return;
            const groupId = gs.createLineGroup(`Group ${gs.groups.length + 1}`, [0, 0, 1], [999, 0, 1]);
            for (const li of linesToAdd) gs.addLineToGroup(groupId, li);
            gs.enterGroupEditMode(groupId);
            useEditorStore.getState().setCanvasActivePanel("group-manager");
          },
        },
        {
          label: "Exit Group Mode",
          disabled: !useGroupStore.getState().activeGroupId,
          action: () => useGroupStore.getState().exitGroupEditMode(),
        },
        { separator: true, label: "" },
        {
          label: "Parametric Trajectory...",
          disabled: !isLoaded,
          action: () => onShowParametric?.(),
        },
        {
          label: "Improvisation Mode",
          shortcut: "Shift+I",
          disabled: !isLoaded,
          action: () => {
            useEditorStore.getState().toggleImprovisationMode();
          },
        },
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
        {
          label: "Classic Editor",
          disabled: !isLoaded,
          action: () => {
            const ts = useTabStore.getState();
            const chartTab = ts.tabs.find((t) => t.type === "chart");
            if (chartTab) {
              ts.setActiveTab(chartTab.id);
            } else {
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
        { separator: true, label: "" },
        { label: "Timeline", action: () => onTogglePanel?.("timeline") },
        { label: "Inspector", action: () => onTogglePanel?.("inspector") },
        { label: "Line List", action: () => onTogglePanel?.("line-list") },
        { label: "Toolbar", action: () => onTogglePanel?.("toolbar") },
        { label: "Timeline Settings", action: () => onTogglePanel?.("timeline-settings") },
        { label: "BPM List", action: () => onTogglePanel?.("bpm-list") },
        { label: "Chart Settings", action: () => onTogglePanel?.("chart-settings") },
        { separator: true, label: "" },
        { label: "Validation", action: () => onTogglePanel?.("validation") },
        { label: "Effects", action: () => onTogglePanel?.("effects") },
        { label: "Textures", action: () => onTogglePanel?.("textures") },
        { label: "Groups", action: () => onTogglePanel?.("group-manager") },
        { separator: true, label: "" },
        { label: "Apply Default Layout", action: onResetLayout },
      ],
    },
    {
      label: "Export",
      items: [
        {
          label: "Export as Official JSON",
          disabled: !isLoaded,
          action: async () => {
            try {
              const { convertPhichainToOfficial } = await import("../utils/officialExport");
              const chart = JSON.parse(getChartJson());
              const officialJson = convertPhichainToOfficial(chart);
              const blob = new Blob([officialJson], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const meta = useChartStore.getState().meta;
              a.download = `${meta.name || "chart"}_official.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("Official export failed:", e);
              useToastStore.getState().addToast({ message: "Failed to export Official chart. Check the console for details.", type: "error" });
            }
          },
        },
        {
          label: "Export as RPE JSON",
          disabled: !isLoaded,
          action: async () => {
            try {
              const { convertPhichainToRpe } = await import("../utils/rpeExport");
              const chart = JSON.parse(getChartJson());
              const meta = useChartStore.getState().meta;
              const rpeJson = convertPhichainToRpe(chart, meta);
              const blob = new Blob([rpeJson], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${meta.name || "chart"}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("RPE export failed:", e);
              useToastStore.getState().addToast({ message: "Failed to export RPE chart. Check the console for details.", type: "error" });
            }
          },
        },
        {
          label: "Export as PEC",
          disabled: !isLoaded,
          action: async () => {
            try {
              const { convertPhichainToPec } = await import("../utils/pecExport");
              const chart = JSON.parse(getChartJson());
              const pecText = convertPhichainToPec(chart);
              const blob = new Blob([pecText], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const meta = useChartStore.getState().meta;
              a.download = `${meta.name || "chart"}.pec`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("PEC export failed:", e);
              useToastStore.getState().addToast({ message: "Failed to export PEC chart. Check the console for details.", type: "error" });
            }
          },
        },
        {
          label: "Export as PEZ (ZIP bundle)...",
          disabled: !isLoaded,
          action: async () => {
            try {
              const chart = JSON.parse(getChartJson());
              const cs = useChartStore.getState();
              const meta = cs.meta;

              let musicFile: File | null = null;
              const musicConfirm = await showConfirm("Include a music file in the PEZ bundle?");
              if (musicConfirm) {
                musicFile = await pickFile(".mp3,.ogg,.wav,.flac");
              }

              let illustrationFile: File | null = null;
              const hasLoadedIllustration = cs.illustrationImage !== null;
              if (!hasLoadedIllustration) {
                const illuConfirm = await showConfirm("Include an illustration file in the PEZ bundle?");
                if (illuConfirm) {
                  illustrationFile = await pickFile(".png,.jpg,.jpeg,.bmp,.webp");
                }
              }

              const { createPezBundle } = await import("../utils/pezExport");
              const groups = useGroupStore.getState().groups;
              const pezBlob = await createPezBundle({
                chart,
                meta,
                musicFile,
                illustrationImage: cs.illustrationImage,
                illustrationFile,
                extraConfig: cs.extraConfig,
                lineTextures: cs.lineTextures,
                groups: groups.length > 0 ? groups : null,
              });

              const url = URL.createObjectURL(pezBlob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${meta.name || "chart"}.pez`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("PEZ export failed:", e);
              useToastStore.getState().addToast({ message: "Failed to export PEZ bundle. Check the console for details.", type: "error" });
            }
          },
        },
      ],
    },
  ];
}

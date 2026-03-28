// ============================================================
// Import Chart — Shared utility
//
// Opens a file picker for .json/.zip/.pez files and imports
// the chart using the RPE importer. Records to recent projects.
// This is extracted so it can be called from both the HomeScreen
// card, the Ctrl+O hotkey, and the File menu.
// ============================================================

import type JSZip from "jszip";
import { useChartStore } from "../stores/chartStore";
import { useTabStore } from "../stores/tabStore";
import { useAudioStore } from "../stores/audioStore";
import { audioEngine } from "../audio/audioEngine";
import { useGroupStore } from "../stores/groupStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useRecentProjectsStore } from "../stores/recentProjectsStore";
import { useToastStore } from "../stores/toastStore";
import { saveStoredProject } from "./projectStorage";
import {
  saveSession,
  registerSession,
  setSkipNextSave,
  setSkipNextRestore,
} from "./chartSessions";
import type { ExtraConfig } from "../types/extra";

/**
 * Opens a file picker and imports an RPE chart (.json, .zip, .pez).
 * Records the import to the recent projects store.
 */
export function triggerImportChart() {
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
      let bookmarksJson: string | null = null;
      let fontEntry: JSZip.JSZipObject | null = null;
      let zip: JSZip | null = null;

      if (
        file.name.toLowerCase().endsWith(".zip") ||
        file.name.toLowerCase().endsWith(".pez")
      ) {
        const { default: JSZipLib } = await import("jszip");
        const zipData = await file.arrayBuffer();
        zip = await JSZipLib.loadAsync(zipData);

        let chartEntry: JSZip.JSZipObject | null = null;
        let audioEntry: JSZip.JSZipObject | null = null;
        let imageEntry: JSZip.JSZipObject | null = null;
        let extraEntry: JSZip.JSZipObject | null = null;
        let groupsEntry: JSZip.JSZipObject | null = null;
        let bookmarksEntry: JSZip.JSZipObject | null = null;

        zip.forEach((relativePath, entry) => {
          if (entry.dir) return;
          const baseName =
            relativePath.split("/").pop()?.toLowerCase() ?? "";
          const pathLower = relativePath.toLowerCase();
          if (
            (pathLower === "canvas/groups.json" || baseName === "groups.json") &&
            !groupsEntry
          ) {
            groupsEntry = entry;
          } else if (pathLower === "canvas/bookmarks.json" && !bookmarksEntry) {
            bookmarksEntry = entry;
          } else if (baseName === "extra.json" && !extraEntry) {
            extraEntry = entry;
          } else if (baseName.endsWith(".json") && !chartEntry) {
            chartEntry = entry;
          } else if (
            /\.(mp3|ogg|wav|flac|m4a)$/.test(baseName) &&
            !audioEntry
          ) {
            audioEntry = entry;
            musicExt = baseName.split(".").pop() ?? "mp3";
          } else if (
            /\.(jpg|jpeg|png|webp)$/.test(baseName) &&
            !imageEntry
          ) {
            imageEntry = entry;
          } else if (
            /\.(otf|ttf|woff|woff2)$/.test(baseName) &&
            !fontEntry
          ) {
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
          illustrationBlob = await (imageEntry as JSZip.JSZipObject).async(
            "blob",
          );
        }
        if (extraEntry) {
          extraJson = await (extraEntry as JSZip.JSZipObject).async("string");
        }
        if (groupsEntry) {
          groupsJson = await (groupsEntry as JSZip.JSZipObject).async(
            "string",
          );
        }
        if (bookmarksEntry) {
          bookmarksJson = await (bookmarksEntry as JSZip.JSZipObject).async(
            "string",
          );
        }
      } else {
        chartText = await file.text();
      }

      const { convertRpeToPhichain, extractRpeMeta, collectUnknownRpeFields } = await import(
        "./rpeImport"
      );
      const chart = convertRpeToPhichain(chartText);
      const meta = extractRpeMeta(chartText);

      // Warn about unrecognized RPE fields
      const unknownFields = collectUnknownRpeFields(chartText);
      if (unknownFields.length > 0) {
        useToastStore.getState().addToast({
          message: `Import skipped unknown fields: ${unknownFields.join(", ")}`,
          type: "info",
          duration: 6000,
        });
      }
      const cs = useChartStore.getState();

      // Save the old chart's session before replacing it
      const tabState = useTabStore.getState();
      const currentTab = tabState.tabs.find((t) => t.id === tabState.activeTabId);
      if (
        currentTab &&
        (currentTab.type === "chart" || currentTab.type === "unified_editor") &&
        cs.isLoaded
      ) {
        saveSession(currentTab.id);
      }
      setSkipNextSave();

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
        } catch {
          /* ignore invalid extra.json */
        }
      }

      if (groupsJson) {
        try {
          useGroupStore.getState().loadGroupsJson(groupsJson);
        } catch {
          /* ignore invalid groups.json */
        }
      }

      if (bookmarksJson) {
        try {
          useBookmarkStore.getState().loadBookmarksJson(bookmarksJson);
        } catch {
          /* ignore invalid bookmarks.json */
        }
      }

      if (fontEntry) {
        try {
          const fontBlob = await (fontEntry as JSZip.JSZipObject).async(
            "blob",
          );
          const fontUrl = URL.createObjectURL(fontBlob);
          const fontFace = new FontFace("ChartCustomFont", `url(${fontUrl})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          cs.setChartFontFamily("ChartCustomFont");
        } catch (e) {
          console.warn("Failed to load chart font:", e);
        }
      }

      // Load line textures from zip
      if (zip) {
        const textureNames = new Set<string>();
        for (const line of chart.lines) {
          if (line.texture && line.texture !== "line.png") {
            textureNames.add(line.texture);
          }
        }
        if (textureNames.size > 0) {
          for (const texName of textureNames) {
            let texEntry: JSZip.JSZipObject | null = null;
            zip.forEach((relativePath, entry) => {
              if (entry.dir) return;
              const baseName = relativePath.split("/").pop() ?? "";
              if (baseName === texName && !texEntry) {
                texEntry = entry;
              }
            });
            if (texEntry) {
              const texBlob = await (texEntry as JSZip.JSZipObject).async(
                "blob",
              );
              cs.setLineTexture(texName, texBlob);
            }
          }
        }
      }

      // Record to recent projects
      let totalNotes = 0;
      for (const line of chart.lines) {
        totalNotes += line.notes?.length ?? 0;
      }
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

      const importChartId = `rpe-import-${projectId}`;
      const chartName = meta.name || "Imported RPE Chart";
      useTabStore.getState().openChart(importChartId, chartName);
      setSkipNextRestore();
      registerSession(useTabStore.getState().getChartTabId(importChartId));
    } catch (e) {
      console.error("RPE import failed:", e);
      useToastStore.getState().addToast({ message: "Failed to import RPE chart. Check the console for details.", type: "error" });
    }
  };
  input.click();
}

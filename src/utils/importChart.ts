// ============================================================
// Unified Chart Import
//
// Single entry point for importing charts in any supported format:
// RPE (.json, .zip, .pez), PEC (.pec, .txt), Official Phigros
// (.json), or zip bundles containing any of these with optional
// info.txt / info.yml metadata.
//
// Format is auto-detected from content (no user selection needed),
// matching Phira's approach. Zip bundles can include audio,
// illustration, fonts, textures, extra.json, groups, bookmarks.
//
// Recent change: Unified importer — merged the previously separate
// RPE/PEC/Official import paths into one auto-detecting pipeline.
// Added info.txt parsing for Phigros Official zip packages and
// zip support for all chart formats. Removed RPE-only assumption.
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
  setAudioBlobUrl,
  setStoredProjectId,
} from "./chartSessions";
import type { ExtraConfig } from "../types/extra";
import type { ProjectMeta, PhichainChart } from "../types/chart";
import type { DetectedChartFormat } from "./chartFormatDetect";
import type { InfoTxtResult } from "./infoTxtParser";

// ============================================================
// Resource cleanup tracking
//
// Track blob Object URLs and custom FontFace objects so they can
// be revoked/removed when a new project is imported or the current
// project is closed. Without this, each import leaked one URL per
// music/illustration/font blob and accumulated FontFace entries.
// ============================================================
let _trackedMusicUrl: string | null = null;
let _trackedIllustrationUrl: string | null = null;
let _trackedFontUrl: string | null = null;
let _trackedFontFace: FontFace | null = null;

/** Revoke all tracked blob URLs and remove custom font. */
function cleanupTrackedResources() {
  if (_trackedMusicUrl) {
    URL.revokeObjectURL(_trackedMusicUrl);
    _trackedMusicUrl = null;
  }
  if (_trackedIllustrationUrl) {
    URL.revokeObjectURL(_trackedIllustrationUrl);
    _trackedIllustrationUrl = null;
  }
  if (_trackedFontFace) {
    document.fonts.delete(_trackedFontFace);
    _trackedFontFace = null;
  }
  if (_trackedFontUrl) {
    URL.revokeObjectURL(_trackedFontUrl);
    _trackedFontUrl = null;
  }
}

// Auto-cleanup when project is closed (same pattern as bookmarkStore/groupStore)
let _lastImportIsLoaded = false;
useChartStore.subscribe((state) => {
  if (_lastImportIsLoaded && !state.isLoaded) {
    queueMicrotask(cleanupTrackedResources);
  }
  _lastImportIsLoaded = state.isLoaded;
});

/**
 * Search a ZIP archive for an entry whose basename (filename without path)
 * matches the target name, case-insensitively. Returns the first match or null.
 * Used to locate the exact audio/illustration file specified by RPE META fields
 * or info.txt file pointers even when the ZIP contains nested directories or
 * multiple files with the same extension.
 */
function findZipEntryByBasename(
  zip: JSZip,
  targetName: string,
): JSZip.JSZipObject | null {
  const target = targetName.toLowerCase();
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((relativePath, entry) => {
    if (found || entry.dir) return;
    const baseName = relativePath.split("/").pop()?.toLowerCase() ?? "";
    if (baseName === target) found = entry;
  });
  return found;
}

// ============================================================
// Zip scanning — categorize entries into known roles
// ============================================================

interface ZipScanResult {
  infoTxtEntry: JSZip.JSZipObject | null;
  infoYmlEntry: JSZip.JSZipObject | null;
  jsonChartEntry: JSZip.JSZipObject | null;
  pecChartEntry: JSZip.JSZipObject | null;
  audioEntry: JSZip.JSZipObject | null;
  imageEntry: JSZip.JSZipObject | null;
  extraEntry: JSZip.JSZipObject | null;
  groupsEntry: JSZip.JSZipObject | null;
  bookmarksEntry: JSZip.JSZipObject | null;
  fontEntry: JSZip.JSZipObject | null;
  musicExt: string | null;
}

/** Scan a zip archive and categorize entries by role. */
function scanZipEntries(zip: JSZip): ZipScanResult {
  const result: ZipScanResult = {
    infoTxtEntry: null,
    infoYmlEntry: null,
    jsonChartEntry: null,
    pecChartEntry: null,
    audioEntry: null,
    imageEntry: null,
    extraEntry: null,
    groupsEntry: null,
    bookmarksEntry: null,
    fontEntry: null,
    musicExt: null,
  };

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    const baseName = relativePath.split("/").pop()?.toLowerCase() ?? "";
    const pathLower = relativePath.toLowerCase();

    // Info metadata files
    if ((baseName === "info.yml" || baseName === "info.yaml") && !result.infoYmlEntry) {
      result.infoYmlEntry = entry;
    } else if (baseName === "info.txt" && !result.infoTxtEntry) {
      result.infoTxtEntry = entry;
    }
    // Editor config files
    else if (
      (pathLower === "canvas/groups.json" || baseName === "groups.json") &&
      !result.groupsEntry
    ) {
      result.groupsEntry = entry;
    } else if (pathLower === "canvas/bookmarks.json" && !result.bookmarksEntry) {
      result.bookmarksEntry = entry;
    } else if (baseName === "extra.json" && !result.extraEntry) {
      result.extraEntry = entry;
    }
    // Chart files (JSON has priority, PEC/TXT as fallback)
    else if (baseName.endsWith(".json") && !result.jsonChartEntry) {
      result.jsonChartEntry = entry;
    } else if (/\.(pec|txt)$/.test(baseName) && !result.pecChartEntry) {
      result.pecChartEntry = entry;
    }
    // Media files
    else if (/\.(mp3|ogg|wav|flac|m4a)$/.test(baseName) && !result.audioEntry) {
      result.audioEntry = entry;
      result.musicExt = baseName.split(".").pop() ?? "mp3";
    } else if (/\.(jpg|jpeg|png|webp)$/.test(baseName) && !result.imageEntry) {
      result.imageEntry = entry;
    }
    // Font files (RPE-specific)
    else if (/\.(otf|ttf|woff|woff2)$/.test(baseName) && !result.fontEntry) {
      result.fontEntry = entry;
    }
  });

  return result;
}

// ============================================================
// Main Import Function
// ============================================================

/**
 * Opens a file picker and imports a chart in any supported format.
 * Auto-detects RPE, Official (Phigros), or PEC from content.
 * Handles zip bundles with audio, illustration, and metadata.
 * Records the import to the recent projects store.
 */
export function triggerImportChart() {
  const input = document.createElement("input");
  input.type = "file";
  // Accept all supported formats: RPE (.json, .zip, .pez), PEC (.pec, .txt), Official (.json)
  input.accept = ".json,.zip,.pez,.pec,.txt";
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
      let infoTxtParsed: InfoTxtResult | null = null;
      let infoYmlEntry: JSZip.JSZipObject | null = null;

      const isZipFile =
        file.name.toLowerCase().endsWith(".zip") ||
        file.name.toLowerCase().endsWith(".pez");

      if (isZipFile) {
        // ── ZIP / PEZ: extract and scan ──────────────────────
        const { default: JSZipLib } = await import("jszip");
        const zipData = await file.arrayBuffer();
        zip = await JSZipLib.loadAsync(zipData);

        const scan = scanZipEntries(zip);
        musicExt = scan.musicExt;
        fontEntry = scan.fontEntry;
        infoYmlEntry = scan.infoYmlEntry;

        // Parse info files if present (info.txt provides file pointers)
        if (scan.infoTxtEntry) {
          try {
            const { parseInfoTxt } = await import("./infoTxtParser");
            const infoTxtText = await scan.infoTxtEntry.async("string");
            infoTxtParsed = parseInfoTxt(infoTxtText);
          } catch { /* ignore invalid info.txt */ }
        }

        // Resolve chart entry: info.txt Chart pointer > first .json > first .pec/.txt
        let chartEntry: JSZip.JSZipObject | null = null;
        if (infoTxtParsed?.chart) {
          chartEntry = findZipEntryByBasename(zip, infoTxtParsed.chart);
        }
        if (!chartEntry) chartEntry = scan.jsonChartEntry;
        if (!chartEntry) chartEntry = scan.pecChartEntry;
        if (!chartEntry) {
          throw new Error("No chart file found in the zip archive.");
        }
        chartText = await chartEntry.async("string");

        // Resolve audio: info.txt Music pointer > generic scan
        if (infoTxtParsed?.music) {
          const infoAudio = findZipEntryByBasename(zip, infoTxtParsed.music);
          if (infoAudio) {
            musicBlob = await infoAudio.async("blob");
            musicExt = infoTxtParsed.music.split(".").pop()?.toLowerCase() ?? "mp3";
          }
        }
        if (!musicBlob && scan.audioEntry) {
          musicBlob = await scan.audioEntry.async("blob");
        }

        // Resolve illustration: info.txt Image pointer > generic scan
        if (infoTxtParsed?.image) {
          const infoImage = findZipEntryByBasename(zip, infoTxtParsed.image);
          if (infoImage) {
            illustrationBlob = await infoImage.async("blob");
          }
        }
        if (!illustrationBlob && scan.imageEntry) {
          illustrationBlob = await scan.imageEntry.async("blob");
        }

        // Extract editor config files
        if (scan.extraEntry) {
          extraJson = await scan.extraEntry.async("string");
        }
        if (scan.groupsEntry) {
          groupsJson = await scan.groupsEntry.async("string");
        }
        if (scan.bookmarksEntry) {
          bookmarksJson = await scan.bookmarksEntry.async("string");
        }
      } else {
        // ── Plain file: read as text ─────────────────────────
        chartText = await file.text();
      }

      // ── Auto-detect chart format ────────────────────────────
      const { detectChartFormat } = await import("./chartFormatDetect");
      const format: DetectedChartFormat = detectChartFormat(chartText);

      // ── Parse chart with the appropriate converter ──────────
      let chart: PhichainChart;
      let meta: ProjectMeta;

      switch (format) {
        case "rpe": {
          const { convertRpeToPhichain, extractRpeMeta, collectUnknownRpeFields } =
            await import("./rpeImport");

          try {
            chart = convertRpeToPhichain(chartText);
          } catch (parseErr) {
            const reason = parseErr instanceof Error ? parseErr.message : "Unknown parse error";
            throw new Error(`Failed to parse RPE chart: ${reason}`);
          }
          meta = extractRpeMeta(chartText);

          // RPE META overrides for audio/illustration (META.song and META.background
          // name the correct files — the initial scan may have picked a sound effect)
          if (zip && meta.rpe_song) {
            const metaAudio = findZipEntryByBasename(zip, meta.rpe_song);
            if (metaAudio) {
              musicBlob = await metaAudio.async("blob");
              musicExt = meta.rpe_song.split(".").pop()?.toLowerCase() ?? "mp3";
            }
          }
          if (zip && meta.rpe_background) {
            const metaImage = findZipEntryByBasename(zip, meta.rpe_background);
            if (metaImage) {
              illustrationBlob = await metaImage.async("blob");
            }
          }

          // Warn about unrecognized RPE fields
          const unknownFields = collectUnknownRpeFields(chartText);
          if (unknownFields.length > 0) {
            useToastStore.getState().addToast({
              message: `Import skipped unknown fields: ${unknownFields.join(", ")}`,
              type: "info",
              duration: 6000,
            });
          }
          break;
        }
        case "official": {
          const { convertOfficialToPhichain } = await import("./officialImport");
          try {
            chart = convertOfficialToPhichain(chartText);
          } catch (parseErr) {
            const reason = parseErr instanceof Error ? parseErr.message : "Unknown parse error";
            throw new Error(`Failed to parse Official chart: ${reason}`);
          }
          meta = {
            name: file.name.replace(/\.(json|zip|pez)$/i, ""),
            composer: "",
            charter: "",
            illustrator: "",
            level: "",
          };
          break;
        }
        case "pec": {
          const { convertPecToPhichain } = await import("./pecImport");
          try {
            chart = convertPecToPhichain(chartText);
          } catch (parseErr) {
            const reason = parseErr instanceof Error ? parseErr.message : "Unknown parse error";
            throw new Error(`Failed to parse PEC chart: ${reason}`);
          }
          meta = {
            name: file.name.replace(/\.(pec|txt|zip|pez)$/i, ""),
            composer: "",
            charter: "",
            illustrator: "",
            level: "",
          };
          break;
        }
      }

      // ── Apply info file metadata (layered: defaults → info.txt → info.yml) ──
      if (infoTxtParsed) {
        if (infoTxtParsed.name) meta.name = infoTxtParsed.name;
        if (infoTxtParsed.composer) meta.composer = infoTxtParsed.composer;
        if (infoTxtParsed.charter) meta.charter = infoTxtParsed.charter;
        if (infoTxtParsed.illustrator) meta.illustrator = infoTxtParsed.illustrator;
        if (infoTxtParsed.level) meta.level = infoTxtParsed.level;
      }

      // info.yml has highest priority (Phira extended metadata)
      if (infoYmlEntry) {
        try {
          const { parsePhiraInfoYml } = await import("./infoYmlParser");
          const infoYmlText = await infoYmlEntry.async("string");
          const phiraMeta = parsePhiraInfoYml(infoYmlText);
          Object.assign(meta, phiraMeta);
        } catch { /* ignore invalid info.yml */ }
      }

      // ── Load chart into editor ──────────────────────────────
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

      // ── Load audio ──────────────────────────────────────────
      if (musicBlob && musicExt) {
        // Revoke previous music URL before creating a new one
        if (_trackedMusicUrl) URL.revokeObjectURL(_trackedMusicUrl);
        const musicUrl = URL.createObjectURL(musicBlob);
        _trackedMusicUrl = musicUrl;
        await audioEngine.load(musicUrl, musicExt);
        useAudioStore.getState().setMusicLoaded(true);
        // Track the blob URL + format so tab session restore can reuse it
        setAudioBlobUrl(musicUrl, musicExt);
      }

      // ── Load illustration ───────────────────────────────────
      if (illustrationBlob) {
        // Revoke previous illustration URL before creating a new one
        if (_trackedIllustrationUrl) URL.revokeObjectURL(_trackedIllustrationUrl);
        const illustrationUrl = URL.createObjectURL(illustrationBlob);
        _trackedIllustrationUrl = illustrationUrl;
        await cs.loadIllustration(illustrationUrl);
      }

      // ── Load extra.json (effects/video config) ──────────────
      if (extraJson) {
        try {
          cs.setExtraConfig(JSON.parse(extraJson) as ExtraConfig);
        } catch {
          /* ignore invalid extra.json */
        }
      }

      // ── Load editor groups ──────────────────────────────────
      if (groupsJson) {
        try {
          useGroupStore.getState().loadGroupsJson(groupsJson);
        } catch {
          /* ignore invalid groups.json */
        }
      }

      // ── Load bookmarks ──────────────────────────────────────
      if (bookmarksJson) {
        try {
          useBookmarkStore.getState().loadBookmarksJson(bookmarksJson);
        } catch {
          /* ignore invalid bookmarks.json */
        }
      }

      // ── Load custom font (RPE-specific) ─────────────────────
      if (format === "rpe" && fontEntry) {
        try {
          // Clean up previous custom font before loading a new one
          if (_trackedFontFace) document.fonts.delete(_trackedFontFace);
          if (_trackedFontUrl) URL.revokeObjectURL(_trackedFontUrl);
          _trackedFontFace = null;
          _trackedFontUrl = null;

          const fontBlob = await (fontEntry as JSZip.JSZipObject).async(
            "blob",
          );
          const fontUrl = URL.createObjectURL(fontBlob);
          const fontFace = new FontFace("ChartCustomFont", `url(${fontUrl})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          _trackedFontUrl = fontUrl;
          _trackedFontFace = fontFace;
          cs.setChartFontFamily("ChartCustomFont");
        } catch (e) {
          console.warn("Failed to load chart font:", e);
        }
      }

      // ── Load line textures from zip (RPE-specific) ──────────
      if (format === "rpe" && zip) {
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

      // ── Record to recent projects ───────────────────────────
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
        illustrationBlob: illustrationBlob ? await illustrationBlob.arrayBuffer() : null,
        savedAt: Date.now(),
      });
      // Bug audit #4: record the IndexedDB id so chartSessions can
      // rematerialize audio from disk if this tab's blob URL dies
      // while the user is on another tab.
      setStoredProjectId(projectId);
      useRecentProjectsStore.getState().addRecent({
        id: projectId,
        name: meta.name || file.name.replace(/\.(json|zip|pez|pec|txt)$/i, ""),
        composer: meta.composer || "",
        level: meta.level || "",
        lineCount: chart.lines.length,
        noteCount: totalNotes,
        importType: format,
      });

      // ── Open new tab ────────────────────────────────────────
      const importChartId = `${format}-import-${projectId}`;
      const chartName = meta.name || `Imported ${format.toUpperCase()} Chart`;
      useTabStore.getState().openChart(importChartId, chartName);
      setSkipNextRestore();
      registerSession(useTabStore.getState().getChartTabId(importChartId));
    } catch (e) {
      console.error("Chart import failed:", e);
      useToastStore.getState().addToast({
        message: "Failed to import chart. Check the console for details.",
        type: "error",
      });
    }
  };
  input.click();
}

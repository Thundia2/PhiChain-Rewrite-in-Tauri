// ============================================================
// Audio Metadata Extraction
//
// Extracts title, artist, and cover art from audio files using
// ID3/Vorbis/MP4 tags. Used by NewProjectDialog to auto-fill
// chart metadata when a music file is selected.
// ============================================================

export interface AudioMetadata {
  title: string | null;
  artist: string | null;
  coverArt: { data: Uint8Array; format: string } | null;
}

const EMPTY: AudioMetadata = { title: null, artist: null, coverArt: null };

const MIME_HINTS: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

/**
 * Extract metadata from a browser File object.
 * Used in browser mode when the user picks/drops a file.
 */
export async function extractMetadataFromFile(file: File): Promise<AudioMetadata> {
  try {
    const { parseBlob, selectCover } = await import("music-metadata");
    const metadata = await parseBlob(file);
    return mapMetadata(metadata, selectCover as CoverSelector);
  } catch {
    return EMPTY;
  }
}

/**
 * Extract metadata from a file path on disk.
 * Used in Tauri mode where we have a filesystem path.
 */
export async function extractMetadataFromPath(filePath: string): Promise<AudioMetadata> {
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const data = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const { parseBuffer, selectCover } = await import("music-metadata");
    const metadata = await parseBuffer(data, { mimeType: MIME_HINTS[ext] });
    return mapMetadata(metadata, selectCover as CoverSelector);
  } catch {
    return EMPTY;
  }
}

// Type for the selectCover function from music-metadata (avoids IPicture import issues)
type CoverSelector = (pictures?: unknown[]) => { data: Uint8Array | Buffer; format: string } | null;

function mapMetadata(
  metadata: { common: { title?: string; artist?: string; picture?: unknown[] } },
  selectCover: CoverSelector,
): AudioMetadata {
  const { common } = metadata;
  const cover = selectCover(common.picture);
  return {
    title: common.title ?? null,
    artist: common.artist ?? null,
    coverArt: cover
      ? { data: new Uint8Array(cover.data), format: cover.format }
      : null,
  };
}

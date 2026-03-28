// ============================================================
// Texture Image Cache
//
// Lazily loads line texture images from Blob data and caches
// the resulting HTMLImageElement for Canvas2D rendering.
// ============================================================

const cache = new Map<string, HTMLImageElement>();
const loading = new Set<string>();

/**
 * Get a cached HTMLImageElement for the given texture name.
 * If not yet loaded, starts an async load and returns null
 * (the image will be available on the next render frame).
 */
export function getTextureImage(
  name: string,
  textures: Map<string, Blob>,
): HTMLImageElement | null {
  if (cache.has(name)) return cache.get(name)!;
  if (loading.has(name)) return null;

  const blob = textures.get(name);
  if (!blob) return null;

  loading.add(name);
  const img = new Image();
  const url = URL.createObjectURL(blob);
  img.src = url;
  img.onload = () => {
    cache.set(name, img);
    loading.delete(name);
  };
  img.onerror = () => {
    loading.delete(name);
    console.warn(`Failed to load texture: ${name}`);
  };

  return null; // Available next frame
}

/**
 * Clear the texture cache and revoke all blob URLs.
 * Call when closing a project.
 */
export function clearTextureCache() {
  for (const [, img] of cache) {
    URL.revokeObjectURL(img.src);
  }
  cache.clear();
  loading.clear();
}

// ============================================================
// *** PAUSED / ON HOLD ***
// GPU-accelerated PixiJS renderer — feature-flagged behind
// usePixiRenderer setting (default: false). Functional but still
// undergoing visual parity testing. Safe to ignore for now.
//
// Pixi Renderer — Public API
// ============================================================

export { PixiGameRenderer } from "./PixiGameRenderer";
export type { RenderResult, RenderOptions, RenderedLineInfo, RenderedNoteInfo } from "./PixiGameRenderer";
export { PixiTextureManager } from "./PixiTextureManager";
export type { PixiRespackTextures, PixiHoldTextures } from "./PixiTextureManager";
export { PixiHitEffectLayer } from "./PixiHitEffects";
export { createChartFilter, updateChartFilterUniforms, isEffectActive } from "./PixiShaderFilter";

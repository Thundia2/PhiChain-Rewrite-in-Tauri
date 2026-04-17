// *** PAUSED / ON HOLD — Part of GPU renderer (usePixiRenderer setting) ***
// ============================================================
// SpritePool — Object pool for PixiJS display objects
//
// Recent change: Initial creation for GPU-accelerated rendering migration.
// Manages a pool of reusable Sprite/Container instances to avoid GC pressure
// from creating and destroying display objects every frame.
//
// Usage pattern per frame:
//   1. pool.beginFrame()          — mark all sprites as unused
//   2. pool.acquire()             — get a sprite (recycled or new)
//   3. pool.endFrame()            — hide all unused sprites
// ============================================================

import { Sprite, Container, TilingSprite, Graphics, Text } from "pixi.js";

// ============================================================
// Generic pool for any PixiJS DisplayObject
// ============================================================

/**
 * Object pool that recycles PixiJS display objects to avoid allocation churn.
 *
 * Each frame:
 *   1. Call beginFrame() to mark all pooled objects as "unused"
 *   2. Call acquire() for each visible element — returns a recycled or new object
 *   3. Call endFrame() to hide objects that weren't acquired this frame
 *
 * Objects are added to the given parent container and remain in the scene graph
 * (hidden via visible=false when idle). This avoids the cost of addChild/removeChild.
 */
export class SpritePool<T extends Sprite | Container | Graphics | Text | TilingSprite> {
  private pool: T[] = [];
  private activeCount = 0;
  private factory: () => T;
  private parent: Container;

  /**
   * @param parent  Container to add new sprites to
   * @param factory Function that creates a new instance of the pooled type
   */
  constructor(parent: Container, factory: () => T) {
    this.parent = parent;
    this.factory = factory;
  }

  /**
   * Call at the start of each frame to reset the acquisition counter.
   * All previously active sprites become candidates for reuse.
   */
  beginFrame(): void {
    this.activeCount = 0;
  }

  /**
   * Get a display object from the pool.
   * Returns a recycled instance if available, or creates a new one.
   * The returned object has visible=true and renderable=true.
   */
  acquire(): T {
    let obj: T;

    if (this.activeCount < this.pool.length) {
      // Reuse an existing pooled object
      obj = this.pool[this.activeCount];
    } else {
      // Create a new one and add to the pool
      obj = this.factory();
      this.pool.push(obj);
      this.parent.addChild(obj);
    }

    obj.visible = true;
    obj.renderable = true;
    this.activeCount++;
    return obj;
  }

  /**
   * Call at the end of each frame to hide all objects that weren't acquired.
   * Hidden objects remain in the pool for future reuse.
   */
  endFrame(): void {
    for (let i = this.activeCount; i < this.pool.length; i++) {
      this.pool[i].visible = false;
      this.pool[i].renderable = false;
    }
  }

  /**
   * Get the number of currently active (visible) objects.
   */
  get active(): number {
    return this.activeCount;
  }

  /**
   * Get the total pool size (active + idle).
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Trim the pool to at most maxSize, destroying excess objects.
   * Call periodically during idle frames to free GPU memory.
   * Only trims idle (non-active) objects.
   */
  trim(maxSize: number): void {
    if (this.pool.length <= maxSize) return;

    // Only remove idle objects (index >= activeCount)
    const trimStart = Math.max(this.activeCount, maxSize);
    for (let i = trimStart; i < this.pool.length; i++) {
      this.parent.removeChild(this.pool[i]);
      this.pool[i].destroy();
    }
    this.pool.length = trimStart;
  }

  /**
   * Destroy all pooled objects and clear the pool.
   */
  destroy(): void {
    for (const obj of this.pool) {
      this.parent.removeChild(obj);
      obj.destroy();
    }
    this.pool = [];
    this.activeCount = 0;
  }
}

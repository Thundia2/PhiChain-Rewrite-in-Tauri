// ============================================================
// Shared Undo Sequence Counter
//
// Recent change: Created this module to provide a global action
// ordering across chartStore and bookmarkStore. Each store records
// sequence numbers alongside its undo history so Ctrl+Z/Ctrl+Y
// can correctly interleave undos between stores.
// ============================================================

// Monotonically increasing counter shared across all undo-capable stores.
// Each call to nextUndoSeq() returns a unique, increasing integer.
let _seq = 0;

/**
 * Get the next undo sequence number.
 * Call this in each store's pushHistory() to timestamp the action.
 */
export function nextUndoSeq(): number {
  return ++_seq;
}

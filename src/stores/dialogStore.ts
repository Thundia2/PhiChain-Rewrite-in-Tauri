// Dialog management store — replaces 14+ useState variables in App.tsx
// Eliminates prop drilling of onShowX callbacks through component tree
//
// Recent change: Added clearAll() action to close all dialogs at once.
// Called from App.tsx when a project is closed to prevent orphaned dialogs.

import { create } from "zustand";

/** All dialog IDs used in the application */
export type DialogId =
  | "new-project"
  | "parametric"
  | "batch-line"
  | "lyrics-sync"
  | "note-pattern"
  | "spin-generator"
  | "shake-generator"
  | "paste-special"
  | "go-to-beat"
  | "export-diff"
  | "selective-export"
  | "record-review"
  | "settings"
  | "command-palette";

interface DialogStore {
  /** Set of currently open dialog IDs */
  openDialogs: Set<DialogId>;
  /** Open a dialog by ID */
  openDialog: (id: DialogId) => void;
  /** Close a dialog by ID */
  closeDialog: (id: DialogId) => void;
  /** Toggle a dialog open/closed */
  toggleDialog: (id: DialogId) => void;
  /** Check if a dialog is currently open */
  isOpen: (id: DialogId) => boolean;
  /** Close all open dialogs (used on project close to prevent orphaned dialogs) */
  clearAll: () => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  openDialogs: new Set(),

  openDialog: (id) =>
    set((state) => {
      const next = new Set(state.openDialogs);
      next.add(id);
      return { openDialogs: next };
    }),

  closeDialog: (id) =>
    set((state) => {
      const next = new Set(state.openDialogs);
      next.delete(id);
      return { openDialogs: next };
    }),

  toggleDialog: (id) => {
    const { openDialogs, openDialog, closeDialog } = get();
    if (openDialogs.has(id)) closeDialog(id);
    else openDialog(id);
  },

  isOpen: (id) => get().openDialogs.has(id),

  clearAll: () => set({ openDialogs: new Set() }),
}));

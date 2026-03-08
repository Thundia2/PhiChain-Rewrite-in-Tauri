/**
 * The bottom status bar showing version info, counts, and status.
 *
 * In later phases this will read from the chart store to show
 * real note/event counts and selection state.
 */
export function StatusBar() {
  return (
    <div
      className="flex items-center h-6 px-3 gap-4 text-xs flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderTop: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
      }}
    >
      <span>Phichain v0.1.0</span>
      <span>Notes: 0</span>
      <span>Events: 0</span>
      <span>Selected Notes: 0</span>
      <span>Selected Events: 0</span>
    </div>
  );
}

// ============================================================
// Hotkey Reference Panel
//
// Quick-reference card showing all keyboard shortcuts grouped
// by category. Accessible via Command Palette or View menu.
// ============================================================

const HOTKEY_GROUPS: { title: string; keys: { key: string; description: string }[] }[] = [
  {
    title: "Tools",
    keys: [
      { key: "V", description: "Select tool" },
      { key: "X", description: "Eraser tool" },
      { key: "Q", description: "Place Tap" },
      { key: "W", description: "Place Drag" },
      { key: "E", description: "Place Flick" },
      { key: "R", description: "Place Hold" },
    ],
  },
  {
    title: "Panels",
    keys: [
      { key: "L", description: "Toggle line drawer" },
      { key: "I", description: "Toggle inspector" },
      { key: "K", description: "Toggle keyframe bar" },
      { key: "Shift+K", description: "Toggle curve editor" },
      { key: "Alt+1", description: "Timeline panel" },
      { key: "Alt+2", description: "Lines panel" },
      { key: "Alt+3", description: "Effects panel" },
    ],
  },
  {
    title: "Playback",
    keys: [
      { key: "Space", description: "Play / Pause" },
      { key: "Left / Right", description: "Seek backward / forward" },
    ],
  },
  {
    title: "Editing",
    keys: [
      { key: "Ctrl+Z", description: "Undo" },
      { key: "Ctrl+Shift+Z", description: "Redo" },
      { key: "Ctrl+C", description: "Copy" },
      { key: "Ctrl+X", description: "Cut" },
      { key: "Ctrl+V", description: "Paste" },
      { key: "Delete", description: "Delete selected" },
      { key: "F", description: "Flip above/below" },
    ],
  },
  {
    title: "Other",
    keys: [
      { key: "Ctrl+K", description: "Command palette" },
      { key: "Ctrl+N", description: "New chart" },
      { key: "Ctrl+S", description: "Save project" },
      { key: "Alt+R", description: "Toggle record mode" },
      { key: "Alt+M", description: "Toggle improvisation mode" },
    ],
  },
];

export function HotkeyReferencePanel() {
  return (
    <div style={{ padding: 12, overflow: "auto", height: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: "bold", color: "var(--text-primary)", marginBottom: 12 }}>
        Keyboard Shortcuts
      </div>
      {HOTKEY_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: "bold", color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
          }}>
            {group.title}
          </div>
          {group.keys.map((entry) => (
            <div key={entry.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "3px 0", fontSize: 12,
            }}>
              <span style={{ color: "var(--text-secondary)" }}>{entry.description}</span>
              <kbd style={{
                background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                borderRadius: 3, padding: "1px 6px", fontSize: 11,
                fontFamily: "monospace", color: "var(--text-primary)",
              }}>
                {entry.key}
              </kbd>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";

// ============================================================
// CONFIGURABLE: Menu structure
// Add/remove/reorder menu items here.
// ============================================================
interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

const MENUS: Menu[] = [
  {
    label: "File",
    items: [
      { label: "Save Project", shortcut: "Ctrl+S", action: () => console.log("TODO: save") },
      { label: "Close Project", action: () => console.log("TODO: close") },
      { separator: true, label: "" },
      { label: "Quit", action: () => console.log("TODO: quit") },
    ],
  },
  {
    label: "Windows",
    items: [
      { label: "Timeline", action: () => console.log("TODO: toggle timeline") },
      { label: "Inspector", action: () => console.log("TODO: toggle inspector") },
      { label: "Line List", action: () => console.log("TODO: toggle line list") },
      { label: "Settings", action: () => console.log("TODO: toggle settings") },
    ],
  },
  {
    label: "Export",
    items: [
      { label: "Export as Official", action: () => console.log("TODO: export") },
    ],
  },
  {
    label: "Layout",
    items: [
      { label: "Apply Default Layout", action: () => console.log("TODO: reset layout") },
    ],
  },
];

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={menuRef}
      className="flex items-center h-7 px-2 gap-0 flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {MENUS.map((menu, menuIndex) => (
        <div key={menu.label} className="relative">
          <button
            className="px-3 py-1 text-xs rounded hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-primary)" }}
            onClick={() => setOpenMenu(openMenu === menuIndex ? null : menuIndex)}
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(menuIndex);
            }}
          >
            {menu.label}
          </button>

          {openMenu === menuIndex && (
            <div
              className="absolute top-full left-0 mt-0.5 py-1 min-w-48 rounded shadow-xl z-50"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div
                    key={i}
                    className="my-1 mx-2"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  />
                ) : (
                  <button
                    key={item.label}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/10 transition-colors disabled:opacity-40"
                    style={{ color: "var(--text-primary)" }}
                    disabled={item.disabled}
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span style={{ color: "var(--text-muted)" }}>{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

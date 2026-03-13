import { useState, useRef, useEffect, useMemo } from "react";
import { useMenus } from "../../hooks/useMenus";
import type { Menu } from "../../hooks/useMenus";

interface CommandItem {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
}

function flattenMenus(menus: Menu[]): CommandItem[] {
  const items: CommandItem[] = [];
  for (const menu of menus) {
    for (const item of menu.items) {
      if (item.separator) continue;
      items.push({
        id: `${menu.label.toLowerCase()}:${item.label.toLowerCase().replace(/\s+/g, "-")}`,
        label: item.label,
        section: menu.label,
        shortcut: item.shortcut,
        action: item.action,
        disabled: item.disabled,
      });
    }
  }
  return items;
}

function filterCommands(commands: CommandItem[], query: string): CommandItem[] {
  if (!query.trim()) return commands;
  const q = query.toLowerCase();
  return commands.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.section.toLowerCase().includes(q),
  );
}

function groupBySection(commands: CommandItem[]): [string, CommandItem[]][] {
  const map = new Map<string, CommandItem[]>();
  for (const cmd of commands) {
    const group = map.get(cmd.section) ?? [];
    group.push(cmd);
    map.set(cmd.section, group);
  }
  return Array.from(map.entries());
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const menus = useMenus();
  const allCommands = useMemo(() => flattenMenus(menus), [menus]);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterCommands(allCommands, query), [allCommands, query]);
  const grouped = useMemo(() => groupBySection(filtered), [filtered]);

  // Flat list for keyboard navigation
  const flatFiltered = useMemo(() => {
    const flat: CommandItem[] = [];
    for (const [, items] of grouped) {
      flat.push(...items);
    }
    return flat;
  }, [grouped]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after animation frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Clamp selectedIndex when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeSelected = () => {
    const item = flatFiltered[selectedIndex];
    if (item && !item.disabled && item.action) {
      item.action();
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatFiltered.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatFiltered.length) % Math.max(1, flatFiltered.length));
        break;
      case "Enter":
        e.preventDefault();
        executeSelected();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.5)",
        paddingTop: "15vh",
        animation: "cmdFadeIn 0.15s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <style>{`
        @keyframes cmdFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmdScaleIn {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
          animation: "cmdScaleIn 0.15s ease-out",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-color)" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            style={{
              width: "100%",
              padding: "6px 0",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{ padding: 4, maxHeight: 320, overflowY: "auto" }}>
          {flatFiltered.length === 0 && (
            <div style={{ padding: "16px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No results found
            </div>
          )}
          {grouped.map(([section, items]) => (
            <div key={section}>
              <div
                style={{
                  padding: "6px 10px 4px",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {section}
              </div>
              {items.map((item) => {
                const thisIndex = flatIndex++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <button
                    key={item.id}
                    data-selected={isSelected}
                    className="w-full flex items-center justify-between"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: item.disabled ? "var(--text-muted)" : "var(--text-primary)",
                      backgroundColor: isSelected ? "rgba(108, 138, 255, 0.15)" : "transparent",
                      cursor: item.disabled ? "default" : "pointer",
                      opacity: item.disabled ? 0.4 : 1,
                      border: "none",
                      textAlign: "left",
                      transition: "background-color 0.08s",
                    }}
                    onMouseEnter={() => setSelectedIndex(thisIndex)}
                    onClick={() => {
                      if (!item.disabled && item.action) {
                        item.action();
                        onClose();
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span
                        style={{
                          marginLeft: "auto",
                          paddingLeft: 12,
                          opacity: 0.4,
                          fontSize: 11,
                          fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

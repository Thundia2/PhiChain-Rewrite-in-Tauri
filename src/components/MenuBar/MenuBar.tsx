import { useState, useRef, useEffect } from "react";
import { useChartStore } from "../../stores/chartStore";
import type { PanelId } from "../../types/editor";
import { useMenus } from "../../hooks/useMenus";
import type { Menu } from "../../hooks/useMenus";

export function MenuBar({
  onTogglePanel,
  onResetLayout,
  onNewChart,
  onOpenSettings,
  onOpenCommandPalette,
  onShowParametric,
}: {
  onTogglePanel?: (id: PanelId) => void;
  onResetLayout?: () => void;
  onNewChart?: () => void;
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
  onShowParametric?: () => void;
}) {
  const MENUS = useMenus(onTogglePanel, onResetLayout, onNewChart, onShowParametric);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const chartName = useChartStore((s) => s.meta.name);
  const isDirty = useChartStore((s) => s.isDirty);
  const isLoaded = useChartStore((s) => s.isLoaded);

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
      className="flex items-center flex-shrink-0"
      style={{
        height: 42,
        padding: "0 12px",
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {/* ── Left: Breadcrumb ── */}
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <span style={{ color: "var(--accent-primary)", fontSize: 16, fontWeight: 600, lineHeight: 1 }}>
          ⬡
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>PhiChain</span>
        {isLoaded && (
          <>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>›</span>
            <span
              className="truncate"
              style={{ fontSize: 12, color: "var(--text-primary)", maxWidth: 180 }}
            >
              {chartName || "Untitled"}
            </span>
            <span
              style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 8,
                backgroundColor: isDirty ? "rgba(255, 180, 60, 0.15)" : "var(--bg-active)",
                color: isDirty ? "#ffb43c" : "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {isDirty ? "unsaved" : "saved"}
            </span>
          </>
        )}
      </div>

      {/* ── Center: Menus ── */}
      <div className="flex-1 flex items-center justify-center gap-0.5">
        {MENUS.map((menu, menuIndex) => (
          <MenuDropdown
            key={menu.label}
            menu={menu}
            isOpen={openMenu === menuIndex}
            onToggle={() => setOpenMenu(openMenu === menuIndex ? null : menuIndex)}
            onHoverEnter={() => {
              if (openMenu !== null) setOpenMenu(menuIndex);
            }}
            onClose={() => setOpenMenu(null)}
          />
        ))}
      </div>

      {/* ── Right: Command Palette + Settings ── */}
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1.5 transition-colors"
          style={{
            padding: "5px 14px",
            backgroundColor: "var(--bg-active)",
            borderRadius: 8,
            border: "0.5px solid var(--border-color)",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-color)";
          }}
          onClick={() => { setOpenMenu(null); onOpenCommandPalette?.(); }}
        >
          <span style={{ fontSize: 12 }}>⌘</span>
          <span style={{ fontSize: 11 }}>Command palette</span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
              backgroundColor: "var(--bg-secondary)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            Ctrl+K
          </span>
        </button>
        <button
          className="flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            color: "var(--text-secondary)",
            fontSize: 15,
            cursor: "pointer",
            backgroundColor: "transparent",
            border: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
          onClick={() => { setOpenMenu(null); onOpenSettings?.(); }}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

/* ── Menu Dropdown Sub-component ── */
function MenuDropdown({
  menu,
  isOpen,
  onToggle,
  onHoverEnter,
  onClose,
}: {
  menu: Menu;
  isOpen: boolean;
  onToggle: () => void;
  onHoverEnter: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button
        className="transition-colors"
        style={{
          padding: "4px 10px",
          borderRadius: 5,
          fontSize: 11,
          color: isOpen ? "var(--text-primary)" : "var(--text-secondary)",
          backgroundColor: isOpen ? "var(--bg-active)" : "transparent",
          cursor: "pointer",
          border: "none",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          onHoverEnter();
          if (!isOpen) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }
        }}
        onClick={onToggle}
      >
        {menu.label}
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 z-50"
          style={{
            marginTop: 2,
            padding: 4,
            minWidth: 220,
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          }}
        >
          {menu.items.map((item, i) =>
            item.separator ? (
              <div
                key={i}
                style={{
                  height: 1,
                  margin: "4px 8px",
                  backgroundColor: "var(--border-color)",
                  opacity: 0.5,
                }}
              />
            ) : (
              <button
                key={item.label}
                className="w-full flex items-center justify-between transition-colors"
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  color: item.disabled ? "var(--text-muted)" : "var(--text-primary)",
                  cursor: item.disabled ? "default" : "pointer",
                  opacity: item.disabled ? 0.4 : 1,
                  backgroundColor: "transparent",
                  border: "none",
                  textAlign: "left",
                }}
                disabled={item.disabled}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  item.action?.();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span
                    style={{
                      marginLeft: "auto",
                      paddingLeft: 16,
                      opacity: 0.4,
                      fontSize: 11,
                      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
                    }}
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

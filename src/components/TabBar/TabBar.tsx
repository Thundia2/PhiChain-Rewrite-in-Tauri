import { useTabStore } from "../../stores/tabStore";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);

  return (
    <div
      className="flex items-end h-8 flex-shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            className={`tab-button${isActive ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1 && tab.closable) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
          >
            <span className="truncate">{tab.label}</span>
            {tab.closable && (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ✕
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

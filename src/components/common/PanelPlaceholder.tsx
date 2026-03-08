interface PanelPlaceholderProps {
  name: string;
  description: string;
  color: string;
}

/**
 * A placeholder that's shown inside panels that haven't been
 * built yet. Displays the panel name, a colored accent bar,
 * and a description of what will go here.
 *
 * These will be replaced with real components in Phases 4-6.
 */
export function PanelPlaceholder({ name, description, color }: PanelPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
      <div
        className="w-10 h-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="text-sm font-semibold" style={{ color }}>
        {name}
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {description}
      </div>
    </div>
  );
}

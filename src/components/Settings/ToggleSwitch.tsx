interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, onChange }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className="relative inline-flex items-center rounded-full transition-colors"
      style={{
        width: 32,
        height: 18,
        backgroundColor: checked ? "var(--accent-primary)" : "var(--bg-active)",
      }}
      onClick={() => onChange(!checked)}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform"
        style={{
          width: 12,
          height: 12,
          transform: checked ? "translateX(17px)" : "translateX(3px)",
        }}
      />
    </button>
  );
}

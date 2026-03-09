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
        width: 36,
        height: 20,
        backgroundColor: checked ? "var(--accent-primary)" : "var(--bg-active)",
      }}
      onClick={() => onChange(!checked)}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform"
        style={{
          width: 14,
          height: 14,
          transform: checked ? "translateX(18px)" : "translateX(3px)",
        }}
      />
    </button>
  );
}

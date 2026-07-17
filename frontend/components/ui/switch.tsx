"use client";

/**
 * Accessible sliding toggle switch (no external dependency).
 * Gray track / knob left = off, green track / knob right = on.
 */
export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 ${
        checked ? "bg-green-600" : "bg-gray-300"
      }`}
    >
      <span
        className="inline-block rounded-full bg-white shadow"
        style={{
          width: 18,
          height: 18,
          transform: checked ? "translateX(22px)" : "translateX(4px)",
          transition: "transform 150ms ease",
        }}
      />
    </button>
  );
}

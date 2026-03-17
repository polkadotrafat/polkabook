import type { ReactNode } from "react";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger";
};

const toneClassMap = {
  neutral: "bg-white/70 text-[var(--ink-soft)] border-[var(--edge)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent",
  danger: "bg-[var(--negative-soft)] text-[var(--negative)] border-transparent",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${toneClassMap[tone]}`}
    >
      {children}
    </span>
  );
}

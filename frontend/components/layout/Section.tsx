import type { ReactNode } from "react";

type SectionProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function Section({
  eyebrow,
  title,
  description,
  children,
}: SectionProps) {
  return (
    <section className="panel section-block">
      <div className="grid gap-2">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="text-[11px] uppercase tracking-[0.22em] text-gold/80">{kicker}</p> : null}
        <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-paper/55">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

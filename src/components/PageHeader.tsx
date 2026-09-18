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
    <div className="flex min-w-0 max-w-full flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker ? <p className="text-[11px] uppercase tracking-[0.22em] text-gold/80">{kicker}</p> : null}
        <h1 className="font-display bg-gradient-to-r from-paper via-paper to-gold/80 bg-clip-text text-xl font-medium tracking-tight break-words text-transparent sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl break-words text-sm text-paper/55">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

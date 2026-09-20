import { inr } from "@/lib/utils";

export function DonutChart({
  income,
  spends,
}: {
  income: number;
  spends: number;
}) {
  const total = Math.max(income + spends, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  const incShare = total === 0 ? 0 : income / total;
  const spendShare = total === 0 ? 0 : spends / total;
  const incLen = incShare * c;
  const spendLen = spendShare * c;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-4">
      <svg viewBox="0 0 140 140" className="mx-auto h-32 w-32 shrink-0 -rotate-90 sm:mx-0 sm:h-40 sm:w-40">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#7ddec9"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${incLen} ${c}`}
          className="drop-shadow-[0_0_10px_rgba(125,222,201,0.45)]"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#e07a7a"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${spendLen} ${c}`}
          strokeDashoffset={-incLen}
        />
      </svg>
      <div className="grid gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-paper/40">Cash mix</div>
          <div className="font-display text-2xl">{total === 0 ? "—" : `${Math.round(incShare * 100)}% in`}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-mint shadow-[0_0_10px_#7ddec9]" />
          Income {inr(income)}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e07a7a]" />
          Spends {inr(spends)}
        </div>
      </div>
    </div>
  );
}

export function BarChart({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div
      className="grid h-44 min-w-0 items-end gap-2 px-0 sm:h-52 sm:gap-4 sm:px-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
    >
      {items.map((i) => (
        <div key={i.label} className="grid min-w-0 justify-items-center gap-1 sm:gap-2">
          <div className="w-full break-all text-center text-[10px] leading-tight text-paper/55 sm:text-[11px]">{inr(i.value)}</div>
          <div className="flex h-28 w-full max-w-[4.5rem] items-end rounded-2xl bg-gold/10 p-1 sm:h-36">
            <div
              className="bar-grow w-full rounded-xl"
              style={{
                height: `${Math.max(10, (Math.abs(i.value) / max) * 100)}%`,
                background: `linear-gradient(180deg, ${i.color}, ${i.color}99)`,
                boxShadow: `0 10px 24px ${i.color}44`,
              }}
            />
          </div>
          <div className="text-[11px] uppercase tracking-wide text-paper/45">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: "digital", label: "Digital", color: "#a78bfa" },
  { key: "other", label: "Other", color: "#fb923c" },
  { key: "cosmofeed", label: "Cosmofeed", color: "#38bdf8" },
  { key: "projects", label: "Projects", color: "#34d399" },
] as const;

export function MonthlyBarChart({
  months,
}: {
  months: { label: string; digital: number; other: number; cosmofeed: number; projects: number; revenue: number }[];
}) {
  const max = Math.max(...months.map((m) => m.revenue), 1);
  if (!months.length) return <p className="text-sm text-paper/45">No dated revenue yet.</p>;
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div
        className="grid h-52 min-w-0 items-end gap-1 px-0 pb-1 sm:h-64 sm:gap-3 sm:px-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(months.length, 1)}, minmax(0, 1fr))` }}
      >
        {months.map((m) => (
          <div key={m.label} className="grid min-w-0 justify-items-center gap-1 sm:gap-2">
            <div className="flex h-40 w-full max-w-[3.4rem] flex-col-reverse overflow-hidden rounded-xl bg-gold/10 sm:h-48">
              {SERIES.map((s) => {
                const v = m[s.key];
                if (v <= 0) return null;
                return (
                  <div
                    key={s.key}
                    title={`${s.label} ${inr(v)}`}
                    className="w-full"
                    style={{ height: `${(v / max) * 100}%`, background: s.color, minHeight: v ? 4 : 0 }}
                  />
                );
              })}
            </div>
            <div className="w-full truncate text-center text-[9px] uppercase tracking-wide text-paper/45 sm:text-[10px]">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-paper/55">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MonthlyLineChart({ months }: { months: { label: string; revenue: number; spends: number }[] }) {
  if (!months.length) return <p className="text-sm text-paper/45">No dated revenue yet.</p>;
  const w = 560;
  const h = 220;
  const pad = 28;
  const max = Math.max(...months.flatMap((m) => [m.revenue, m.spends]), 1);
  const x = (i: number) => pad + (i / Math.max(months.length - 1, 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const path = (key: "revenue" | "spends") =>
    months
      .map((m, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(m[key])}`)
      .join(" ");
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full max-w-full sm:h-56" preserveAspectRatio="xMidYMid meet">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1={pad} x2={w - pad} y1={y(max * p)} y2={y(max * p)} stroke="rgba(255,255,255,0.06)" />
        ))}
        <path d={path("revenue")} fill="none" stroke="#fb923c" strokeWidth="2.4" strokeLinejoin="round" />
        <path d={path("spends")} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="5 5" />
        {months.map((m, i) => (
          <circle key={m.label} cx={x(i)} cy={y(m.revenue)} r="3.5" fill="#fb923c" />
        ))}
        {months.map((m, i) => (
          <text key={`${m.label}-t`} x={x(i)} y={h - 8} textAnchor="middle" fill="rgba(247,241,230,0.45)" fontSize="10">
            {m.label}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-[11px] text-paper/55">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-[#fb923c]" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-5 border-t border-dashed border-[#f87171]" /> Spends
        </span>
      </div>
    </div>
  );
}

export function DistributionDonut({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-4">
      <svg viewBox="0 0 140 140" className="mx-auto h-32 w-32 shrink-0 -rotate-90 sm:mx-0 sm:h-40 sm:w-40">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
        {slices.map((s) => {
          const len = total === 0 ? 0 : (Math.max(0, s.value) / total) * c;
          const el = (
            <circle
              key={s.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="grid gap-2 text-sm">
        {slices.map((s) => (
          <div key={s.label} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 break-words">
              {s.label} {inr(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "#e8c36a" }: { values: number[]; color?: string }) {
  const pts = values.length ? values : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = Math.max(max - min, 1);
  const w = 320;
  const h = 72;
  const d = pts
    .map((v, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

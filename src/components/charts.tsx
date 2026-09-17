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
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90">
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
    <div className="grid h-52 grid-cols-3 items-end gap-4 px-1">
      {items.map((i) => (
        <div key={i.label} className="grid justify-items-center gap-2">
          <div className="text-[11px] text-paper/55">{inr(i.value)}</div>
          <div className="flex h-36 w-full max-w-[4.5rem] items-end rounded-2xl bg-white/5 p-1">
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

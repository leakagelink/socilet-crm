export function DonutChart({
  income,
  spends,
}: {
  income: number;
  spends: number;
}) {
  const total = Math.max(income + spends, 1);
  const inc = (income / total) * 100;
  return (
    <div className="flex items-center gap-5">
      <div
        className="relative h-36 w-36 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(#7ddec9 0 ${inc}%, #c45c5c ${inc}% 100%)`,
          boxShadow: "inset 0 0 0 14px #101826",
        }}
        aria-hidden
      >
        <div className="absolute inset-[22%] grid place-items-center rounded-full bg-panel text-center">
          <div className="text-[10px] uppercase tracking-wide text-paper/45">Mix</div>
          <div className="text-lg font-semibold">{Math.round(inc)}%</div>
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-mint" />
          Income {Math.round(inc)}%
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#c45c5c]" />
          Spends {Math.round(100 - inc)}%
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
    <div className="grid h-44 grid-cols-3 items-end gap-4 px-2">
      {items.map((i) => (
        <div key={i.label} className="grid justify-items-center gap-2">
          <div
            className="w-full max-w-16 rounded-t-xl transition-all duration-700"
            style={{
              height: `${Math.max(8, (Math.abs(i.value) / max) * 140)}px`,
              background: i.color,
              boxShadow: `0 8px 24px ${i.color}55`,
            }}
          />
          <div className="text-[11px] text-paper/50">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

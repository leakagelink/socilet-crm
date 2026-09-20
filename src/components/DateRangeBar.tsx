import { RANGE_PRESETS, type RangePreset } from "@/lib/dateRange";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DateRangeBar({
  preset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  onPreset: (v: RangePreset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPreset(p.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              preset === p.id
                ? "border-gold/40 bg-gold/15 text-gold"
                : "border-gold/25 bg-gold/5 text-paper/60 hover:text-paper",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} aria-label="To date" />
        </div>
      ) : null}
    </div>
  );
}

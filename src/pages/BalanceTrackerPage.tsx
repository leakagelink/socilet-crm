import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFinance } from "@/hooks/useFinance";
import { listRecords } from "@/lib/db";
import { setBaseBalance, setDesiredAvailable } from "@/lib/finance";
import { rangeBounds, type RangePreset } from "@/lib/dateRange";
import { buildLedger, LEDGER_KINDS, ledgerTotals, type LedgerKind } from "@/lib/ledger";
import { moduleById } from "@/lib/modules";
import { inr } from "@/lib/utils";
import { DateRangeBar } from "@/components/DateRangeBar";
import { AnimatedInr } from "@/components/AnimatedInr";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BarChart } from "@/components/charts";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<LedgerKind, string> = {
  projects: "text-violet-300",
  recurring: "text-teal-300",
  digital: "text-fuchsia-300",
  other: "text-orange-300",
  cosmofeed: "text-sky-300",
  spends: "text-rose-300",
  adjustment: "text-gold",
};

export function BalanceTrackerPage() {
  const module = moduleById("balance_tracker")!;
  const f = useFinance();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [kind, setKind] = useState<LedgerKind | "all">("all");
  const [search, setSearch] = useState("");
  const [base, setBase] = useState("");
  const [desired, setDesired] = useState("");
  const bounds = rangeBounds(preset, customFrom, customTo);

  const pack = useQuery({
    queryKey: ["balance-ledger"],
    queryFn: async () => {
      const [projects, addons, recurring, digital, other, cosmofeed, spends, adjustments] = await Promise.all([
        listRecords("projects"),
        listRecords("project_addons"),
        listRecords("recurring_earnings"),
        listRecords("digital_products"),
        listRecords("other_income"),
        listRecords("cosmofeed"),
        listRecords("spends"),
        listRecords("balance_tracker"),
      ]);
      return { projects, addons, recurring, digital, other, cosmofeed, spends, adjustments };
    },
    refetchInterval: 30_000,
  });

  const txs = useMemo(
    () => (pack.data ? buildLedger({ ...pack.data, from: bounds.from, to: bounds.to }) : []),
    [pack.data, bounds.from, bounds.to],
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs.filter((t) => {
      if (kind !== "all" && t.kind !== kind) return false;
      if (q && !`${t.title} ${t.method} ${t.date}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txs, kind, search]);
  const totals = ledgerTotals(txs);

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Finance"
        title="Balance tracker"
        description="Filter se projects, recurring, digital, other income, cosmofeed, spends aur har transaction."
      />

      <Card className="grid gap-3">
        <DateRangeBar
          preset={preset}
          from={customFrom}
          to={customTo}
          onPreset={setPreset}
          onFrom={setCustomFrom}
          onTo={setCustomTo}
        />
      </Card>

      {f.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Hero label="Available" hint="Base + all income − spends" value={f.data.available} className="from-violet-600/90 to-fuchsia-600/70" />
          <Hero label="Period in" hint="Filtered income" value={totals.income} className="from-teal-500/90 to-cyan-600/70" />
          <Hero label="Period spends" hint="Filtered outflows" value={totals.out} className="from-rose-500/90 to-orange-500/70" />
          <Hero label="Period net" hint="In − spends" value={totals.net} className="from-sky-600/90 to-indigo-600/70" />
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Mini label="Projects" value={totals.projects} />
        <Mini label="Recurring" value={totals.recurring} />
        <Mini label="Digital products" value={totals.digital} />
        <Mini label="Other income" value={totals.other} />
        <Mini label="Cosmofeed" value={totals.cosmofeed} />
        <Mini label="Total spends" value={totals.spends} />
      </div>

      <Card>
        <BarChart
          items={[
            { label: "Projects", value: totals.projects, color: "#a78bfa" },
            { label: "Recurring", value: totals.recurring, color: "#2dd4bf" },
            { label: "Digital", value: totals.digital, color: "#e879f9" },
            { label: "Other", value: totals.other, color: "#fb923c" },
            { label: "Cosmofeed", value: totals.cosmofeed, color: "#38bdf8" },
            { label: "Spends", value: totals.spends, color: "#e07a7a" },
          ]}
        />
      </Card>

      <Card className="grid gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg">Transactions</h2>
          <span className="text-xs text-paper/45">{shown.length} of {txs.length}</span>
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, method, date…" />
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {LEDGER_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                kind === k.id ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 bg-white/4 text-paper/60",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-paper/45">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Method</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pack.isLoading ? (
                <tr>
                  <td className="px-2 py-6 text-paper/45" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-paper/45" colSpan={5}>
                    Is filter mein koi transaction nahi.
                  </td>
                </tr>
              ) : (
                shown.map((t) => (
                  <tr key={t.id} className="border-t border-white/5">
                    <td className="whitespace-nowrap px-2 py-2">{t.date || "—"}</td>
                    <td className={cn("px-2 py-2 capitalize", KIND_TONE[t.kind])}>{t.kind}</td>
                    <td className="px-2 py-2">
                      <Link to={t.href} className="hover:text-gold">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-paper/55">{t.method || "—"}</td>
                    <td className={cn("px-2 py-2 text-right font-medium", t.amount < 0 ? "text-rose-300" : "text-mint")}>
                      {inr(t.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Set base balance (INR)</Label>
          <Input value={base} onChange={(e) => setBase(e.target.value)} type="number" />
          <Button
            onClick={async () => {
              await setBaseBalance(Number(base));
              await qc.invalidateQueries({ queryKey: ["finance"] });
            }}
          >
            Save base
          </Button>
        </div>
        <div className="grid gap-2">
          <Label>Desired available (reverse)</Label>
          <p className="text-xs text-paper/50">base = desired − totalIncome + totalSpends</p>
          <Input value={desired} onChange={(e) => setDesired(e.target.value)} type="number" />
          <Button
            variant="outline"
            onClick={async () => {
              await setDesiredAvailable(Number(desired));
              await qc.invalidateQueries({ queryKey: ["finance"] });
            }}
          >
            Solve base
          </Button>
        </div>
        {f.data ? (
          <div className="text-sm text-paper/70 md:col-span-2">
            Available <AnimatedInr value={f.data.available} /> · base <AnimatedInr value={f.data.base} />
          </div>
        ) : null}
      </Card>

      <h2 className="font-display text-lg">Manual adjustments</h2>
      <ModuleCrud module={module} hideHeader />
    </div>
  );
}

function Hero({ label, hint, value, className }: { label: string; hint: string; value: number; className: string }) {
  return (
    <div className={cn("shine min-w-0 rounded-2xl bg-gradient-to-br p-4 text-white", className)}>
      <div className="text-[11px] uppercase tracking-wide text-white/80">{label}</div>
      <div className="mt-2 font-display text-2xl">
        <AnimatedInr value={value} />
      </div>
      <div className="mt-1 text-xs text-white/70">{hint}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <Card className="min-w-0 p-3">
      <div className="truncate text-[10px] uppercase tracking-wide text-paper/45">{label}</div>
      <div className="mt-1 break-all font-display text-lg">
        <AnimatedInr value={value} />
      </div>
    </Card>
  );
}

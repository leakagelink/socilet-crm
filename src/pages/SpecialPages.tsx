import { useFinance } from "@/hooks/useFinance";
import { AnimatedInr } from "@/components/AnimatedInr";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { MODULES, moduleById } from "@/lib/modules";
import { setBaseBalance, setDesiredAvailable } from "@/lib/finance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BarChart, DonutChart, Sparkline } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";
import { listRecords } from "@/lib/db";
import { Link } from "react-router-dom";
import { ArrowUpRight, FolderKanban, CheckSquare, Receipt, FileText, Clock } from "lucide-react";

function trend(d: { base: number; totalIncome: number; totalSpends: number; available: number }) {
  const a = Math.max(d.base, 0);
  return [
    a * 0.72,
    a * 0.9,
    a,
    a + Math.max(d.totalIncome, 0) * 0.45,
    a + Math.max(d.totalIncome, 0),
    d.available,
  ];
}

export function DashboardPage() {
  const f = useFinance();
  const counts = useQuery({
    queryKey: ["dash-counts"],
    queryFn: async () => {
      const keys = ["projects", "tasks", "invoices", "reminders", "quotations"] as const;
      const pairs = await Promise.all(keys.map(async (k) => [k, (await listRecords(k)).length] as const));
      return Object.fromEntries(pairs) as Record<(typeof keys)[number], number>;
    },
    refetchInterval: 30_000,
  });
  const activity = useQuery({
    queryKey: ["dash-activity"],
    queryFn: async () => {
      const keys = ["projects", "tasks", "invoices", "quotations", "reminders", "spends", "other_income"];
      const rows = (await Promise.all(keys.map(listRecords))).flat();
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
    },
    refetchInterval: 30_000,
  });
  const d = f.data;
  const tiles = [
    ["Projects", "/projects", counts.data?.projects ?? 0, FolderKanban],
    ["Tasks", "/tasks", counts.data?.tasks ?? 0, CheckSquare],
    ["Invoices", "/invoices", counts.data?.invoices ?? 0, Receipt],
    ["Quotes", "/quotations", counts.data?.quotations ?? 0, FileText],
    ["Reminders", "/reminders", counts.data?.reminders ?? 0, Clock],
  ] as const;

  return (
    <div className="grid gap-6">
      <PageHeader
        kicker="Overview"
        title="Command deck"
        description="Available = base + income − spends. Live poll every 30s. Investments sit outside this mix."
      />
      {f.isLoading ? <Card>Loading balances…</Card> : null}
      {f.isError ? <Card className="text-red-300">Could not load finance.</Card> : null}

      {d ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="shine relative overflow-hidden xl:col-span-7">
            <div className="grid-fade pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Available cash</div>
                  <div className="mt-2 font-display text-4xl text-gold md:text-5xl">
                    <AnimatedInr value={d.available} />
                  </div>
                </div>
                <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-wide text-gold">
                  Live
                </span>
              </div>
              <div className="mt-6">
                <Sparkline values={trend(d)} />
              </div>
              <p className="mt-2 text-xs text-paper/40">Path from base through income, then spends, to available.</p>
            </div>
          </Card>
          <Card className="xl:col-span-5">
            <DonutChart income={d.totalIncome} spends={d.totalSpends} />
          </Card>
        </div>
      ) : null}

      {d ? (
        <div className="stagger grid gap-3 sm:grid-cols-3">
          {[
            { label: "Base", v: d.base, hint: "Starting ledger" },
            { label: "Income", v: d.totalIncome, hint: "All inflows", extra: "text-mint" },
            { label: "Spends", v: d.totalSpends, hint: "All outflows", extra: "text-red-300" },
          ].map((s) => (
            <Card key={s.label} className="shine transition duration-300 hover:-translate-y-1 hover:border-gold/35">
              <div className="text-[11px] uppercase tracking-wide text-paper/45">{s.label}</div>
              <div className={`mt-2 font-display text-2xl ${s.extra ?? ""}`}>
                <AnimatedInr value={s.v} />
              </div>
              <div className="mt-1 text-xs text-paper/40">{s.hint}</div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-3 font-display text-lg">Ledger stack</h2>
          {d ? (
            <BarChart
              items={[
                { label: "Base", value: d.base, color: "#e8c36a" },
                { label: "Income", value: d.totalIncome, color: "#7ddec9" },
                { label: "Spends", value: d.totalSpends, color: "#e07a7a" },
              ]}
            />
          ) : null}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-display text-lg">Recent motion</h2>
          <div className="grid gap-2">
            {(activity.data ?? []).length === 0 ? (
              <p className="text-sm text-paper/45">No rows yet — add a project, invoice, or spend and it shows here.</p>
            ) : (
              (activity.data ?? []).map((row) => {
                const title = MODULES.find((m) => m.id === row.module)?.title ?? row.module;
                const name = String(row.data.name ?? row.data.title ?? row.data.quote_no ?? row.data.invoice_no ?? title);
                return (
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/3 px-3 py-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-gold/70">{title}</div>
                      <div className="truncate text-sm">{name}</div>
                    </div>
                    <div className="text-[11px] text-paper/40">{row.updated_at.slice(0, 10)}</div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map(([label, href, n, Icon]) => (
          <Link key={href} to={href} className="block">
            <Card className="shine group transition duration-300 hover:-translate-y-1 hover:border-mint/35">
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-gold/80" />
                <ArrowUpRight className="h-4 w-4 text-paper/25 transition group-hover:text-mint" />
              </div>
              <div className="mt-4 text-xs text-paper/45">{label}</div>
              <div className="font-display text-3xl">{n}</div>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-paper/35">Last poll {d?.polledAt ?? "—"}</p>
    </div>
  );
}

export function BalanceTrackerPage() {
  const module = moduleById("balance_tracker")!;
  const f = useFinance();
  const qc = useQueryClient();
  const [base, setBase] = useState("");
  const [desired, setDesired] = useState("");
  return (
    <ModuleCrud
      module={module}
      extra={
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
            <p className="text-xs text-paper/50">base_balance = desired − totalIncome + totalSpends</p>
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
            <div className="md:col-span-2 text-sm text-paper/70">
              Available <AnimatedInr value={f.data.available} /> · base <AnimatedInr value={f.data.base} />
            </div>
          ) : null}
        </Card>
      }
    />
  );
}

export function AnalyticsPage() {
  const module = moduleById("analytics")!;
  const f = useFinance();
  return (
    <ModuleCrud
      module={module}
      extra={
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-display text-lg">Income vs spends</h2>
            {f.data ? <DonutChart income={f.data.totalIncome} spends={f.data.totalSpends} /> : <p className="text-sm text-paper/45">Loading…</p>}
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-lg">Ledger bars</h2>
            {f.data ? (
              <BarChart
                items={[
                  { label: "Base", value: f.data.base, color: "#e8c36a" },
                  { label: "Income", value: f.data.totalIncome, color: "#7ddec9" },
                  { label: "Spends", value: f.data.totalSpends, color: "#c45c5c" },
                ]}
              />
            ) : null}
          </Card>
        </div>
      }
    />
  );
}

export function AiAnalyzerPage() {
  const module = moduleById("ai_analyzer")!;
  return (
    <ModuleCrud
      module={module}
      extra={
        <Card className="text-sm text-paper/70">
          No API key required. Save prompt/result rows here. Optional Supabase does not change this screen until you wire a model.
        </Card>
      }
    />
  );
}

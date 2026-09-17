import { useFinance } from "@/hooks/useFinance";
import { AnimatedInr } from "@/components/AnimatedInr";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { setBaseBalance, setDesiredAvailable } from "@/lib/finance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BarChart, DonutChart } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";
import { listRecords } from "@/lib/db";
import { Link } from "react-router-dom";

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
  const d = f.data;
  return (
    <div className="grid gap-6">
      <PageHeader
        kicker="Overview"
        title="Command deck"
        description="Available = base + income − spends. Figures refresh every 30s."
      />
      {f.isLoading ? <Card>Loading balances…</Card> : null}
      {f.isError ? <Card className="text-red-300">Could not load finance.</Card> : null}
      {d ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Available", v: d.available, extra: "text-gold" },
            { label: "Base", v: d.base, extra: "" },
            { label: "Income", v: d.totalIncome, extra: "text-mint" },
            { label: "Spends", v: d.totalSpends, extra: "text-red-300" },
          ].map((s) => (
            <Card key={s.label} className="transition duration-300 hover:-translate-y-0.5 hover:border-gold/30">
              <div className="text-[11px] uppercase tracking-wide text-paper/45">{s.label}</div>
              <div className={`mt-2 font-display text-3xl ${s.extra}`}>
                <AnimatedInr value={s.v} />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-lg">Cash mix</h2>
          {d ? <DonutChart income={d.totalIncome} spends={d.totalSpends} /> : <p className="text-sm text-paper/45">Waiting on finance…</p>}
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-lg">Stack</h2>
          {d ? (
            <BarChart
              items={[
                { label: "Base", value: d.base, color: "#e8c36a" },
                { label: "Income", value: d.totalIncome, color: "#7ddec9" },
                { label: "Spends", value: d.totalSpends, color: "#c45c5c" },
              ]}
            />
          ) : null}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["Projects", "/projects", counts.data?.projects ?? 0],
            ["Tasks", "/tasks", counts.data?.tasks ?? 0],
            ["Invoices", "/invoices", counts.data?.invoices ?? 0],
            ["Quotes", "/quotations", counts.data?.quotations ?? 0],
            ["Reminders", "/reminders", counts.data?.reminders ?? 0],
          ] as const
        ).map(([label, href, n]) => (
          <Link key={href} to={href} className="block">
            <Card className="transition duration-300 hover:-translate-y-0.5 hover:border-mint/30">
              <div className="text-xs text-paper/45">{label}</div>
              <div className="mt-1 font-display text-2xl">{n}</div>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-paper/35">Last poll {d?.polledAt ?? "—"} · investments tracked separately</p>
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

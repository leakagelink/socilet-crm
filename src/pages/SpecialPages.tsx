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
import { BarChart, DistributionDonut, DonutChart, MonthlyBarChart, MonthlyLineChart } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";
import { listRecords } from "@/lib/db";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  FolderKanban,
  CheckSquare,
  Receipt,
  FileText,
  Clock,
  Wallet,
  TrendingDown,
  Repeat,
  IndianRupee,
  Briefcase,
  Hourglass,
  ShoppingBag,
  BadgePercent,
  Coins,
  BarChart3,
  LineChart,
  PieChart,
} from "lucide-react";

export function DashboardPage() {
  const f = useFinance();
  const [chartTab, setChartTab] = useState<"bar" | "trend" | "dist">("bar");
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
        title="Revenue dashboard"
        description="Same breakdown as the old CRM: available = base + income − spends. Live poll every 30s."
      />
      {f.isLoading ? <Card>Loading balances…</Card> : null}
      {f.isError ? <Card className="text-red-300">Could not load finance.</Card> : null}

      {d ? (
        <div className="stagger grid gap-3 md:grid-cols-3">
          <HeroTile
            icon={Wallet}
            label="Available balance"
            hint="Base + income − spends"
            value={d.available}
            className="bg-gradient-to-br from-violet-600/90 to-fuchsia-600/70"
          />
          <HeroTile
            icon={TrendingDown}
            label="Total spends"
            hint="All expenses"
            value={d.totalSpends}
            className="bg-gradient-to-br from-rose-500/90 to-orange-500/70"
          />
          <HeroTile
            icon={Repeat}
            label="Monthly recurring"
            hint="Active subscriptions"
            value={d.monthlyRecurring}
            className="bg-gradient-to-br from-teal-500/90 to-cyan-600/70"
          />
        </div>
      ) : null}

      {d ? (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatTile icon={IndianRupee} label="Total revenue" hint="Received amount" value={d.totalRevenue} tone="text-mint" />
          <StatTile icon={Briefcase} label="Projects total" hint="All projects value" value={d.projectsTotal} tone="text-violet-300" />
          <StatTile icon={Hourglass} label="Pending" hint="Yet to receive" value={d.pending} tone="text-amber-300" />
          <StatTile icon={ShoppingBag} label="Digital sales" hint="Products sold" value={d.digitalSales} tone="text-fuchsia-300" />
          <StatTile icon={BadgePercent} label="Digital profit" hint="Net profit" value={d.digitalProfit} tone="text-sky-300" />
          <StatTile icon={Coins} label="Other income" hint="Miscellaneous" value={d.otherIncome} tone="text-orange-300" />
        </div>
      ) : null}

      {d ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg">Revenue analytics</h2>
              <p className="text-xs text-paper/45">Monthly trends and breakdown</p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/4 p-1">
              {(
                [
                  ["bar", "Bar chart", BarChart3],
                  ["trend", "Trend line", LineChart],
                  ["dist", "Distribution", PieChart],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChartTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                    chartTab === id ? "bg-gold/20 text-gold" : "text-paper/55 hover:text-paper"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {chartTab === "bar" ? <MonthlyBarChart months={d.months} /> : null}
          {chartTab === "trend" ? <MonthlyLineChart months={d.months} /> : null}
          {chartTab === "dist" ? (
            <DistributionDonut
              slices={[
                { label: "Digital", value: d.digitalSales, color: "#a78bfa" },
                { label: "Other income", value: d.otherIncome, color: "#fb923c" },
                { label: "Cosmofeed", value: d.cosmofeed, color: "#38bdf8" },
                { label: "Projects", value: d.projectsTotal - d.pending, color: "#34d399" },
                { label: "Recurring", value: d.monthlyRecurring, color: "#2dd4bf" },
              ]}
            />
          ) : null}
        </Card>
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

function HeroTile({
  icon: Icon,
  label,
  hint,
  value,
  className,
}: {
  icon: typeof Wallet;
  label: string;
  hint: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`shine relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-white/80">{label}</div>
        <Icon className="h-4 w-4 text-white/80" />
      </div>
      <div className="mt-3 font-display text-3xl md:text-4xl">
        <AnimatedInr value={value} />
      </div>
      <div className="mt-1 text-xs text-white/70">{hint}</div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  hint,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  hint: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="shine transition duration-300 hover:-translate-y-1 hover:border-gold/35">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-paper/45">{label}</div>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className={`mt-2 font-display text-2xl ${tone}`}>
        <AnimatedInr value={value} />
      </div>
      <div className="mt-1 text-xs text-paper/40">{hint}</div>
    </Card>
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
          <Card className="lg:col-span-2">
            <h2 className="mb-2 font-display text-lg">Monthly revenue</h2>
            {f.data ? <MonthlyBarChart months={f.data.months} /> : null}
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

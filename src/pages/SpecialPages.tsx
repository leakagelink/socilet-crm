import { useFinance } from "@/hooks/useFinance";
import { AnimatedInr } from "@/components/AnimatedInr";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { MODULES, moduleById } from "@/lib/modules";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BarChart, DistributionDonut, DonutChart, MonthlyBarChart, MonthlyLineChart } from "@/components/charts";
import { AvailableBalanceEditor } from "@/components/AvailableBalanceEditor";
import { PageHeader } from "@/components/PageHeader";
import { ExecutiveBriefCard } from "@/components/ExecutiveBriefCard";
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
  TrendingUp,
  Handshake,
  Calculator,
} from "lucide-react";

export function DashboardPage() {
  const f = useFinance();
  const [chartTab, setChartTab] = useState<"bar" | "trend" | "dist">("bar");
  const counts = useQuery({
    queryKey: ["dash-counts"],
    queryFn: async () => {
      const keys = ["projects", "tasks", "invoices", "reminders", "quotations", "investments", "lend_borrow"] as const;
      const pairs = await Promise.all(keys.map(async (k) => [k, (await listRecords(k)).length] as const));
      return Object.fromEntries(pairs) as Record<(typeof keys)[number], number>;
    },
    refetchInterval: 30_000,
  });
  const activity = useQuery({
    queryKey: ["dash-activity"],
    queryFn: async () => {
      const keys = ["projects", "tasks", "invoices", "quotations", "reminders", "spends", "other_income", "investments", "lend_borrow"];
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
    ["Investments", "/investments", counts.data?.investments ?? 0, TrendingUp],
    ["Lend/Borrow", "/lend-borrow", counts.data?.lend_borrow ?? 0, Handshake],
    ["Calculator", "/calculator", "INR", Calculator],
  ] as const;

  return (
    <div className="grid min-w-0 max-w-full gap-4 sm:gap-6">
      <PageHeader
        kicker="Overview"
        title="Revenue dashboard"
        description="Available = starting balance + har earning − spends. Project complete / payment se turant update."
      />
      {f.isLoading ? <Card>Loading balances…</Card> : null}
      {f.isError ? <Card className="text-red-300">Could not load finance.</Card> : null}

      <ExecutiveBriefCard />

      {d ? (
        <div className="stagger grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroTile
            icon={Wallet}
            label="Available balance"
            hint="Edit karo, phir earnings add hoti rahengi"
            value={d.available}
            className="bg-gradient-to-br from-violet-600/90 to-fuchsia-600/70"
            extra={<AvailableBalanceEditor available={d.available} />}
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
            hint="Collections received (plan in mix)"
            value={d.recurringReceived}
            className="bg-gradient-to-br from-teal-500/90 to-cyan-600/70"
          />
          <HeroTile
            icon={TrendingUp}
            label="Investments"
            hint="Current portfolio value"
            value={d.investments}
            className="bg-gradient-to-br from-indigo-600/90 to-sky-600/70"
          />
        </div>
      ) : null}

      {d ? (
        <div className="stagger grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
          <StatTile icon={IndianRupee} label="Total revenue" hint="Received amount" value={d.totalRevenue} tone="text-mint" />
          <StatTile icon={Briefcase} label="Projects total" hint="All projects value" value={d.projectsTotal} tone="text-violet-300" />
          <StatTile icon={Hourglass} label="Pending" hint="Yet to receive" value={d.pending} tone="text-amber-300" />
          <StatTile icon={ShoppingBag} label="Digital sales" hint="Products sold" value={d.digitalSales} tone="text-fuchsia-300" />
          <StatTile icon={BadgePercent} label="Digital profit" hint="Net profit" value={d.digitalProfit} tone="text-sky-300" />
          <StatTile icon={Coins} label="Other income" hint="Miscellaneous" value={d.otherIncome} tone="text-orange-300" />
          <StatTile icon={TrendingUp} label="Investments" hint="Parked capital (current)" value={d.investments} tone="text-indigo-500" />
          <StatTile icon={Handshake} label="To collect (lent)" hint="Lend remaining incl. ROI" value={d.lentCollect} tone="text-mint" />
          <StatTile icon={Handshake} label="To repay (borrowed)" hint="Borrow remaining incl. ROI" value={d.borrowedRepay} tone="text-amber-300" />
        </div>
      ) : null}

      {d ? (
        <Card className="min-w-0 overflow-hidden p-3 sm:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-lg">Revenue analytics</h2>
              <p className="text-xs text-paper/45">Monthly trends and breakdown</p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-3 gap-1 rounded-full border border-gold/25 bg-gold/8 p-1 sm:w-auto sm:flex sm:flex-wrap">
              {(
                [
                  ["bar", "Bar", BarChart3],
                  ["trend", "Trend", LineChart],
                  ["dist", "Mix", PieChart],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChartTab(id)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-1.5 text-[11px] sm:gap-1.5 sm:px-3 sm:text-xs ${
                    chartTab === id ? "bg-gold/20 text-gold" : "text-paper/55 hover:text-paper"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
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
                { label: "Recurring", value: d.recurringReceived, color: "#2dd4bf" },
              ]}
            />
          ) : null}
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 overflow-hidden p-3 sm:p-5 lg:col-span-3">
          <h2 className="mb-3 font-display text-lg">Ledger stack</h2>
          {d ? (
            <BarChart
              items={[
                { label: "Base", value: d.base, color: "#e8c36a" },
                { label: "Income", value: d.totalIncome, color: "#7ddec9" },
                { label: "Investments", value: d.investments, color: "#818cf8" },
              ]}
            />
          ) : null}
        </Card>
        <Card className="min-w-0 overflow-hidden p-3 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 font-display text-lg">Recent motion</h2>
          <div className="grid min-w-0 gap-2">
            {(activity.data ?? []).length === 0 ? (
              <p className="text-sm text-paper/45">
                No rows yet — <Link to="/activity" className="text-gold">activity log</Link> fills as staff save records.
              </p>
            ) : (
              (activity.data ?? []).map((row) => {
                const title = MODULES.find((m) => m.id === row.module)?.title ?? row.module;
                const name = String(row.data.name ?? row.data.title ?? row.data.quote_no ?? row.data.invoice_no ?? title);
                return (
                  <div key={row.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[10px] uppercase tracking-wide text-gold/70">{title}</div>
                      <div className="truncate text-sm">{name}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-paper/40">{row.updated_at.slice(0, 10)}</div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="stagger grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, href, n, Icon]) => (
          <Link key={href} to={href} className="block min-w-0">
            <Card className="shine group min-w-0 p-3 transition duration-300 hover:-translate-y-1 hover:border-mint/35 sm:p-5">
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
  extra,
}: {
  icon: typeof Wallet;
  label: string;
  hint: string;
  value: number;
  className: string;
  extra?: ReactNode;
}) {
  return (
    <div className={`shine relative min-w-0 overflow-hidden rounded-2xl p-3 text-white shadow-lg sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-white/80 sm:text-[11px] sm:tracking-[0.16em]">{label}</div>
        <Icon className="h-4 w-4 shrink-0 text-white/80" />
      </div>
      <div className="mt-2 break-all font-display text-2xl leading-tight sm:mt-3 sm:text-3xl md:text-4xl">
        <AnimatedInr value={value} />
      </div>
      <div className="mt-1 truncate text-xs text-white/70">{hint}</div>
      {extra ? <div className="mt-3">{extra}</div> : null}
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
    <Card className="shine min-w-0 p-3 transition duration-300 hover:-translate-y-1 hover:border-gold/35 sm:p-5">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <div className="min-w-0 truncate text-[10px] uppercase tracking-wide text-paper/45 sm:text-[11px]">{label}</div>
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
      </div>
      <div className={`mt-2 break-all font-display text-lg leading-tight sm:text-2xl ${tone}`}>
        <AnimatedInr value={value} />
      </div>
      <div className="mt-1 truncate text-xs text-paper/40">{hint}</div>
    </Card>
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

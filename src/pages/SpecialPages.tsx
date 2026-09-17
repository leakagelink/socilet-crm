import { useFinance } from "@/hooks/useFinance";
import { AnimatedInr } from "@/components/AnimatedInr";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { setBaseBalance, setDesiredAvailable } from "@/lib/finance";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function DashboardPage() {
  const f = useFinance();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-paper/60">Finance polls every 30s. Available = base + income − spends.</p>
      </div>
      {f.isLoading ? <Card>Loading balances…</Card> : null}
      {f.isError ? <Card className="text-red-300">Could not load finance.</Card> : null}
      {f.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="text-xs uppercase text-paper/50">Available</div>
            <div className="mt-1 text-3xl">
              <AnimatedInr value={f.data.available} />
            </div>
          </Card>
          <Card>
            <div className="text-xs uppercase text-paper/50">Base</div>
            <div className="mt-1 text-2xl">
              <AnimatedInr value={f.data.base} />
            </div>
          </Card>
          <Card>
            <div className="text-xs uppercase text-paper/50">Income</div>
            <div className="mt-1 text-2xl text-mint">
              <AnimatedInr value={f.data.totalIncome} />
            </div>
          </Card>
          <Card>
            <div className="text-xs uppercase text-paper/50">Spends</div>
            <div className="mt-1 text-2xl">
              <AnimatedInr value={f.data.totalSpends} />
            </div>
          </Card>
        </div>
      ) : null}
      <p className="text-xs text-paper/40">Last poll: {f.data?.polledAt ?? "—"} · investments tracked separately</p>
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
  const total = (f.data?.totalIncome ?? 0) + (f.data?.totalSpends ?? 0) || 1;
  const inPct = Math.round(((f.data?.totalIncome ?? 0) / total) * 100);
  return (
    <ModuleCrud
      module={module}
      extra={
        <Card>
          <div className="mb-2 text-sm text-paper/60">Live mix (from finance poll)</div>
          <div className="h-3 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-mint" style={{ width: `${inPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-paper/50">
            <span>Income {inPct}%</span>
            <span>Spends {100 - inPct}%</span>
          </div>
        </Card>
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
          No API key required. Save prompt/result rows here, or type a local note. Optional Supabase does not change this
          screen until you wire your own model.
        </Card>
      }
    />
  );
}

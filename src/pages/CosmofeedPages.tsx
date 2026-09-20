import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, PieChart } from "lucide-react";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { listRecords } from "@/lib/db";
import { rangeBounds, type RangePreset } from "@/lib/dateRange";
import { filterAdSpends, filterSales, num, productName } from "@/lib/cosmofeed";
import { DateRangeBar } from "@/components/DateRangeBar";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedInr } from "@/components/AnimatedInr";
import { BarChart } from "@/components/charts";
import { inr } from "@/lib/utils";

function CosmoLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link to="/cosmofeed-products">Products catalog</Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to="/cosmofeed-analytics">
          <PieChart className="h-3.5 w-3.5" />
          Analytics
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to="/cosmofeed-compare">
          <GitCompare className="h-3.5 w-3.5" />
          Compare
        </Link>
      </Button>
    </div>
  );
}

export function CosmofeedPage() {
  const module = moduleById("cosmofeed")!;
  return <ModuleCrud module={module} extra={<CosmoLinks />} />;
}

function useCosmoRange() {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [product, setProduct] = useState("");
  const bounds = rangeBounds(preset, customFrom, customTo);
  const salesQ = useQuery({ queryKey: ["module", "cosmofeed"], queryFn: () => listRecords("cosmofeed") });
  const spendQ = useQuery({ queryKey: ["module", "spends"], queryFn: () => listRecords("spends") });
  const catalogQ = useQuery({
    queryKey: ["module", "cosmofeed_products"],
    queryFn: () => listRecords("cosmofeed_products"),
  });
  const catalogNames = (catalogQ.data ?? []).map((r) => String(r.data.product || "").trim()).filter(Boolean);
  const sales = useMemo(
    () => filterSales(salesQ.data ?? [], bounds.from, bounds.to, product),
    [salesQ.data, bounds.from, bounds.to, product],
  );
  const ads = useMemo(
    () => filterAdSpends(spendQ.data ?? [], bounds.from, bounds.to, product),
    [spendQ.data, bounds.from, bounds.to, product],
  );
  const names = useMemo(() => {
    const set = new Set(catalogNames);
    for (const r of salesQ.data ?? []) set.add(productName(r));
    for (const r of spendQ.data ?? []) if (String(r.data.ad_for || "").trim()) set.add(String(r.data.ad_for).trim());
    return [...set].filter((n) => n && n !== "Unassigned").sort((a, b) => a.localeCompare(b));
  }, [catalogNames, salesQ.data, spendQ.data]);
  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    product,
    setProduct,
    bounds,
    sales,
    ads,
    names,
    loading: salesQ.isLoading || spendQ.isLoading,
  };
}

function FilterShell({
  title,
  description,
  state,
  children,
}: {
  title: string;
  description: string;
  state: ReturnType<typeof useCosmoRange>;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader kicker="Cosmofeed" title={title} description={description} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/cosmofeed">Sales</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/cosmofeed-analytics">Analytics</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/cosmofeed-compare">Compare</Link>
          </Button>
        </div>
      </div>
      <Card className="grid gap-3">
        <DateRangeBar
          preset={state.preset}
          from={state.customFrom}
          to={state.customTo}
          onPreset={state.setPreset}
          onFrom={state.setCustomFrom}
          onTo={state.setCustomTo}
        />
        <label className="grid max-w-md gap-1 text-sm">
          <span className="text-paper/60">Product</span>
          <select
            className="h-11 w-full rounded-xl border border-line bg-ink/70 px-3 text-base sm:h-10 sm:text-sm"
            value={state.product}
            onChange={(e) => state.setProduct(e.target.value)}
          >
            <option value="">All products</option>
            {state.names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </Card>
      {state.loading ? <Card>Loading…</Card> : children}
    </div>
  );
}

export function CosmofeedAnalyticsPage() {
  const state = useCosmoRange();
  const qty = state.sales.reduce((a, r) => a + (num(r.data.quantity) || 1), 0);
  const net = state.sales.reduce((a, r) => a + num(r.data.amount), 0);
  const gst = state.sales.reduce((a, r) => a + num(r.data.gst_amount), 0);
  const byProduct = new Map<string, { qty: number; net: number; gst: number; count: number }>();
  for (const r of state.sales) {
    const key = productName(r);
    const cur = byProduct.get(key) ?? { qty: 0, net: 0, gst: 0, count: 0 };
    cur.qty += num(r.data.quantity) || 1;
    cur.net += num(r.data.amount);
    cur.gst += num(r.data.gst_amount);
    cur.count += 1;
    byProduct.set(key, cur);
  }
  const rows = [...byProduct.entries()].sort((a, b) => b[1].net - a[1].net);

  return (
    <FilterShell title="Cosmofeed analytics" description="Sales by period — same filters as the old CRM." state={state}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales" value={String(state.sales.length)} />
        <Stat label="Quantity" value={String(qty)} />
        <Stat label="Net" valueNode={<AnimatedInr value={net} />} />
        <Stat label="GST" valueNode={<AnimatedInr value={gst} />} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-paper/45">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Sales</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">GST</th>
              <th className="px-3 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-paper/45" colSpan={5}>
                  Is period mein koi sale nahi.
                </td>
              </tr>
            ) : (
              rows.map(([name, v]) => (
                <tr key={name} className="border-t border-gold/15">
                  <td className="px-3 py-2 font-medium">{name}</td>
                  <td className="px-3 py-2">{v.count}</td>
                  <td className="px-3 py-2">{v.qty}</td>
                  <td className="px-3 py-2">{inr(v.gst)}</td>
                  <td className="px-3 py-2">{inr(v.net)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </FilterShell>
  );
}

export function CosmofeedComparePage() {
  const state = useCosmoRange();
  const profit = state.sales.reduce((a, r) => a + num(r.data.amount), 0);
  const ad = state.ads.reduce((a, r) => a + num(r.data.amount), 0);
  const after = profit - ad;
  const by = new Map<string, { sales: number; ad: number; qty: number }>();
  const bump = (key: string) => {
    const cur = by.get(key) ?? { sales: 0, ad: 0, qty: 0 };
    by.set(key, cur);
    return cur;
  };
  for (const r of state.sales) {
    const row = bump(productName(r));
    row.sales += num(r.data.amount);
    row.qty += num(r.data.quantity) || 1;
  }
  for (const r of state.ads) {
    bump(productName(r)).ad += num(r.data.amount);
  }
  const productRows = [...by.entries()].sort((a, b) => b[1].sales + b[1].ad - (a[1].sales + a[1].ad));

  return (
    <FilterShell
      title="Cosmofeed compare"
      description="Ad spend vs Cosmofeed profit. Spends → category Ad spend + Ad spend for product yahan aata hai."
      state={state}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Cosmofeed profit" valueNode={<AnimatedInr value={profit} />} />
        <Stat label="Ad spend" valueNode={<AnimatedInr value={ad} />} />
        <Stat label="After ads" valueNode={<AnimatedInr value={after} />} />
      </div>
      <Card>
        <BarChart
          items={[
            { label: "Profit", value: profit, color: "#38bdf8" },
            { label: "Ad spend", value: ad, color: "#e07a7a" },
            { label: "After ads", value: after, color: after >= 0 ? "#34d399" : "#fb7185" },
          ]}
        />
      </Card>
      <Card className="overflow-x-auto p-0">
        <div className="px-3 py-2 text-sm font-medium">Per product</div>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-paper/45">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Profit</th>
              <th className="px-3 py-2">Ad spend</th>
              <th className="px-3 py-2">After ads</th>
            </tr>
          </thead>
          <tbody>
            {productRows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-paper/45" colSpan={5}>
                  Is filter mein sale ya ad spend nahi.
                </td>
              </tr>
            ) : (
              productRows.map(([name, v]) => (
                <tr key={name} className="border-t border-gold/15">
                  <td className="px-3 py-2 font-medium">{name}</td>
                  <td className="px-3 py-2">{v.qty}</td>
                  <td className="px-3 py-2">{inr(v.sales)}</td>
                  <td className="px-3 py-2">{inr(v.ad)}</td>
                  <td className="px-3 py-2">{inr(v.sales - v.ad)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto p-0">
        <div className="px-3 py-2 text-sm font-medium">Ad spend for</div>
        <p className="px-3 pb-2 text-xs text-paper/45">Har ad spend: product, title, amount, payment method, date, notes.</p>
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-paper/45">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {state.ads.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-paper/45" colSpan={6}>
                  Koi ad spend nahi. Spends mein category Ad spend choose karo.
                </td>
              </tr>
            ) : (
              [...state.ads]
                .sort((a, b) => String(b.data.date || "").localeCompare(String(a.data.date || "")))
                .map((r) => (
                  <tr key={r.id} className="border-t border-gold/15">
                    <td className="px-3 py-2 whitespace-nowrap">{String(r.data.date || "").slice(0, 10) || "—"}</td>
                    <td className="px-3 py-2">{productName(r)}</td>
                    <td className="px-3 py-2">{String(r.data.title || "—")}</td>
                    <td className="px-3 py-2">{inr(num(r.data.amount))}</td>
                    <td className="px-3 py-2">{String(r.data.payment_method || "—")}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-paper/60">{String(r.data.notes || "—")}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </Card>
    </FilterShell>
  );
}

function Stat({ label, value, valueNode }: { label: string; value?: string; valueNode?: ReactNode }) {
  return (
    <Card className="grid gap-1">
      <div className="text-[11px] uppercase tracking-wide text-paper/45">{label}</div>
      <div className="font-display text-xl">{valueNode ?? value}</div>
    </Card>
  );
}

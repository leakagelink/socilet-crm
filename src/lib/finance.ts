import { db, cloudLive, listRecords, type RecordRow, type SettingsRow } from "@/lib/db";
import { apiJson } from "@/lib/apiBase";
import { projectCashIn, projectReceipts } from "@/lib/projectPayments";

export type MonthBucket = {
  month: string;
  label: string;
  digital: number;
  other: number;
  cosmofeed: number;
  recurring: number;
  projects: number;
  addons: number;
  invoices: number;
  spends: number;
  revenue: number;
};

export type FinanceSnapshot = {
  base: number;
  totalIncome: number;
  totalSpends: number;
  available: number;
  investments: number;
  polledAt: string;
  monthlyRecurring: number;
  totalRevenue: number;
  projectsTotal: number;
  pending: number;
  digitalSales: number;
  digitalProfit: number;
  otherIncome: number;
  cosmofeed: number;
  paidAddons: number;
  months: MonthBucket[];
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumAmount(rows: Awaited<ReturnType<typeof listRecords>>) {
  return rows.reduce((acc, r) => acc + num(r.data.amount), 0);
}

function sumField(rows: Awaited<ReturnType<typeof listRecords>>, field: string) {
  return rows.reduce((acc, r) => acc + num(r.data[field]), 0);
}

function sumReceived(rows: Awaited<ReturnType<typeof listRecords>>) {
  return rows.reduce((acc, r) => acc + receivedOf(r), 0);
}

function receivedOf(r: RecordRow) {
  const status = String(r.data.status || "paid").toLowerCase();
  if (status === "unpaid") return 0;
  const paid = num(r.data.paid_amount);
  if (status === "partial") return paid;
  if (paid > 0) return paid;
  return num(r.data.amount);
}

function monthKey(raw: unknown) {
  const s = String(raw || "");
  const m = s.match(/^(\d{4}-\d{2})/);
  return m?.[1] ?? "";
}

function monthLabel(key: string) {
  const [y, mo] = key.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short" });
}

function emptyMonth(month: string): MonthBucket {
  return {
    month,
    label: monthLabel(month),
    digital: 0,
    other: 0,
    cosmofeed: 0,
    recurring: 0,
    projects: 0,
    addons: 0,
    invoices: 0,
    spends: 0,
    revenue: 0,
  };
}

async function readFinance(): Promise<SettingsRow> {
  if (await cloudLive()) {
    const res = await apiJson<{ data: SettingsRow }>("/api/crm/settings/finance");
    if (res.data) {
      await db.settings.put(res.data);
      return res.data;
    }
  }
  return (await db.settings.get("finance")) ?? { id: "finance", base_balance: 0, updated_at: new Date().toISOString() };
}

async function writeFinance(base: number) {
  const row: SettingsRow = { id: "finance", base_balance: base, updated_at: new Date().toISOString() };
  if (await cloudLive()) {
    const res = await apiJson<{ data: SettingsRow }>("/api/crm/settings/finance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_balance: base }),
    });
    if (res.data) {
      await db.settings.put(res.data);
      return;
    }
  }
  await db.settings.put(row);
}

export async function loadFinance(): Promise<FinanceSnapshot> {
  const settings = await readFinance();
  const base = settings.base_balance ?? 0;
  const [other, cosmofeedRows, recurring, invoices, spends, investments, digital, addons, projects, adjustments] = await Promise.all([
    listRecords("other_income"),
    listRecords("cosmofeed"),
    listRecords("recurring_earnings"),
    listRecords("invoices"),
    listRecords("spends"),
    listRecords("investments"),
    listRecords("digital_products"),
    listRecords("project_addons"),
    listRecords("projects"),
    listRecords("balance_tracker"),
  ]);
  const paidInvoices = invoices.filter((r) => String(r.data.status).toLowerCase() === "paid");
  const paidAddons = addons.filter((r) => String(r.data.status).toLowerCase() === "paid");
  const activeRecurring = recurring.filter((r) => r.data.active !== false);
  const otherIncome = sumReceived(other);
  const cosmofeed = sumAmount(cosmofeedRows);
  const monthlyRecurring = sumAmount(activeRecurring);
  const digitalSales = digital.reduce((acc, r) => acc + (num(r.data.resell_price) || num(r.data.amount)), 0);
  const digitalProfit = digital.reduce((acc, r) => {
    const profit = num(r.data.profit);
    if (profit) return acc + profit;
    return acc + Math.max(0, num(r.data.resell_price) - num(r.data.amount));
  }, 0);
  const projectsTotal = sumField(projects, "total_amount");
  const pending = projects.reduce((acc, r) => {
    const status = String(r.data.status || "").toLowerCase();
    if (status === "completed" || status === "done") return acc;
    return acc + Math.max(0, num(r.data.total_amount) - projectCashIn(r));
  }, 0);
  const projectReceived = projects.reduce((acc, r) => acc + projectCashIn(r), 0);
  const paidAddonSum = sumAmount(paidAddons);
  const adjustmentSum = sumAmount(adjustments);
  const totalIncome =
    otherIncome + cosmofeed + monthlyRecurring + sumAmount(paidInvoices) + digitalSales + paidAddonSum + projectReceived + adjustmentSum;
  const totalSpends = sumAmount(spends);
  const available = base + totalIncome - totalSpends;
  /** Cash already in: other + digital + cosmofeed + project receipts (incl. completed) */
  const totalRevenue = otherIncome + digitalSales + cosmofeed + projectReceived;

  const buckets = new Map<string, MonthBucket>();
  const bump = (key: string, field: keyof Omit<MonthBucket, "month" | "label">, value: number) => {
    if (!key || !value) return;
    const row = buckets.get(key) ?? emptyMonth(key);
    row[field] = (row[field] as number) + value;
    buckets.set(key, row);
  };
  for (const r of digital) bump(monthKey(r.data.sale_date || r.data.date || r.created_at), "digital", num(r.data.resell_price) || num(r.data.amount));
  for (const r of other) bump(monthKey(r.data.date || r.created_at), "other", receivedOf(r));
  for (const r of cosmofeedRows) bump(monthKey(r.data.date || r.created_at), "cosmofeed", num(r.data.amount));
  for (const r of activeRecurring) bump(monthKey(r.data.start_date || r.data.date || r.created_at), "recurring", num(r.data.amount));
  for (const r of projects) {
    for (const p of projectReceipts(r)) bump(monthKey(p.date || r.data.start_date || r.created_at), "projects", p.amount);
  }
  for (const r of paidAddons) bump(monthKey(r.data.date || r.created_at), "addons", num(r.data.amount));
  for (const r of paidInvoices) bump(monthKey(r.data.date || r.created_at), "invoices", num(r.data.amount));
  for (const r of spends) bump(monthKey(r.data.date || r.created_at), "spends", num(r.data.amount));

  const months = [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      revenue: m.digital + m.other + m.cosmofeed + m.projects + m.addons + m.invoices,
    }));

  return {
    base,
    totalIncome,
    totalSpends,
    available,
    investments: investments.reduce((acc, r) => acc + num(r.data.current_value ?? r.data.amount), 0),
    polledAt: new Date().toISOString(),
    monthlyRecurring,
    totalRevenue,
    projectsTotal,
    pending,
    digitalSales,
    digitalProfit,
    otherIncome,
    cosmofeed,
    paidAddons: paidAddonSum,
    months,
  };
}

/** Reverse: base_balance = desired − totalIncome + totalSpends */
export async function setDesiredAvailable(desired: number) {
  const snap = await loadFinance();
  const base = desired - snap.totalIncome + snap.totalSpends;
  await writeFinance(base);
  return { ...snap, base, available: desired };
}

export async function setBaseBalance(base: number) {
  await writeFinance(base);
}

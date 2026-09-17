import { db, cloudLive, listRecords, type SettingsRow } from "@/lib/db";
import { apiJson } from "@/lib/apiBase";

export type FinanceSnapshot = {
  base: number;
  totalIncome: number;
  totalSpends: number;
  available: number;
  investments: number;
  polledAt: string;
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumAmount(rows: Awaited<ReturnType<typeof listRecords>>) {
  return rows.reduce((acc, r) => acc + num(r.data.amount), 0);
}

function sumReceived(rows: Awaited<ReturnType<typeof listRecords>>) {
  return rows.reduce((acc, r) => {
    const status = String(r.data.status || "paid").toLowerCase();
    if (status === "unpaid") return acc;
    const paid = num(r.data.paid_amount);
    if (status === "partial") return acc + paid;
    if (paid > 0) return acc + paid;
    return acc + num(r.data.amount);
  }, 0);
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
  const [other, cosmofeed, recurring, invoices, spends, investments, digital, addons] = await Promise.all([
    listRecords("other_income"),
    listRecords("cosmofeed"),
    listRecords("recurring_earnings"),
    listRecords("invoices"),
    listRecords("spends"),
    listRecords("investments"),
    listRecords("digital_products"),
    listRecords("project_addons"),
  ]);
  const paidInvoices = invoices.filter((r) => String(r.data.status) === "paid");
  const paidAddons = addons.filter((r) => String(r.data.status) === "paid");
  const totalIncome =
    sumReceived(other) +
    sumAmount(cosmofeed) +
    sumAmount(recurring) +
    sumAmount(paidInvoices) +
    sumAmount(digital) +
    sumAmount(paidAddons);
  const totalSpends = sumAmount(spends);
  const available = base + totalIncome - totalSpends;
  return {
    base,
    totalIncome,
    totalSpends,
    available,
    investments: investments.reduce((acc, r) => acc + num(r.data.current_value ?? r.data.amount), 0),
    polledAt: new Date().toISOString(),
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

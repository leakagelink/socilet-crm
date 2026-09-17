import { db, listRecords } from "@/lib/db";

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

export async function loadFinance(): Promise<FinanceSnapshot> {
  const settings = await db.settings.get("finance");
  const base = settings?.base_balance ?? 0;
  const [other, cosmofeed, recurring, invoices, spends, investments] = await Promise.all([
    listRecords("other_income"),
    listRecords("cosmofeed"),
    listRecords("recurring_earnings"),
    listRecords("invoices"),
    listRecords("spends"),
    listRecords("investments"),
  ]);
  const paidInvoices = invoices.filter((r) => String(r.data.status) === "paid");
  const totalIncome = sumAmount(other) + sumAmount(cosmofeed) + sumAmount(recurring) + sumAmount(paidInvoices);
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
  await db.settings.put({ id: "finance", base_balance: base, updated_at: new Date().toISOString() });
  return { ...snap, base, available: desired };
}

export async function setBaseBalance(base: number) {
  await db.settings.put({ id: "finance", base_balance: base, updated_at: new Date().toISOString() });
}

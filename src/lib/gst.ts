import { listRecords } from "@/lib/db";

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthOf(raw: unknown, fallback = "") {
  const s = String(raw || fallback);
  const m = s.match(/^(\d{4}-\d{2})/);
  return m?.[1] ?? "";
}

export type GstMonth = {
  month: string;
  invoices: number;
  invoiceGst: number;
  digital: number;
  projects: number;
  cosmofeed: number;
  cosmofeedGst: number;
  other: number;
  spends: number;
  taxableIn: number;
  gstIn: number;
};

export async function loadGstReport(): Promise<GstMonth[]> {
  const [invoices, digital, projects, cosmofeed, other, spends] = await Promise.all([
    listRecords("invoices"),
    listRecords("digital_products"),
    listRecords("projects"),
    listRecords("cosmofeed"),
    listRecords("other_income"),
    listRecords("spends"),
  ]);
  const map = new Map<string, GstMonth>();
  const bucket = (key: string) => {
    if (!key) return null;
    const row = map.get(key) ?? {
      month: key,
      invoices: 0,
      invoiceGst: 0,
      digital: 0,
      projects: 0,
      cosmofeed: 0,
      cosmofeedGst: 0,
      other: 0,
      spends: 0,
      taxableIn: 0,
      gstIn: 0,
    };
    map.set(key, row);
    return row;
  };

  for (const r of invoices) {
    if (String(r.data.status).toLowerCase() !== "paid") continue;
    const b = bucket(monthOf(r.data.paid_at || r.data.due_date || r.updated_at));
    if (!b) continue;
    b.invoices += num(r.data.amount);
    b.invoiceGst += num(r.data.gst_amount);
  }
  for (const r of digital) {
    const b = bucket(monthOf(r.data.sale_date || r.data.date || r.created_at));
    if (!b) continue;
    b.digital += num(r.data.amount) || num(r.data.resell_price);
  }
  for (const r of projects) {
    const b = bucket(monthOf(r.data.start_date || r.created_at));
    if (!b) continue;
    b.projects += num(r.data.advance_amount);
  }
  for (const r of cosmofeed) {
    const b = bucket(monthOf(r.data.date || r.created_at));
    if (!b) continue;
    b.cosmofeed += num(r.data.amount);
    b.cosmofeedGst += num(r.data.gst_amount);
  }
  for (const r of other) {
    const status = String(r.data.status || "paid").toLowerCase();
    if (status === "unpaid") continue;
    const b = bucket(monthOf(r.data.date || r.created_at));
    if (!b) continue;
    b.other += num(r.data.paid_amount) || num(r.data.amount);
  }
  for (const r of spends) {
    const b = bucket(monthOf(r.data.date || r.created_at));
    if (!b) continue;
    b.spends += num(r.data.amount);
  }

  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      taxableIn: m.invoices + m.digital + m.projects + m.cosmofeed + m.other,
      gstIn: m.invoiceGst + m.cosmofeedGst,
    }));
}

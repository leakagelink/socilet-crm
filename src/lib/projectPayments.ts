import type { RecordRow } from "@/lib/db";
import { uid } from "@/lib/utils";

export type ProjectPay = {
  id: string;
  date: string;
  amount: number;
  method: string;
  note: string;
  invoice_id?: string;
};

export function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(raw: unknown) {
  const s = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function asPay(raw: unknown): ProjectPay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amount = money(o.amount);
  const date = ymd(o.date);
  if (!date || amount <= 0) return null;
  return {
    id: String(o.id || uid()),
    date,
    amount,
    method: String(o.method ?? o.payment_method ?? "").trim(),
    note: String(o.note ?? "").trim(),
    invoice_id: String(o.invoice_id ?? "").trim() || undefined,
  };
}

export function parseProjectPayments(data: Record<string, unknown> | undefined): ProjectPay[] {
  const raw = data?.payments;
  if (Array.isArray(raw)) {
    const listed = raw.map(asPay).filter((p): p is ProjectPay => Boolean(p));
    if (listed.length) return listed.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  const adv = money(data?.advance_amount);
  if (adv <= 0) return [];
  return [
    {
      id: "legacy-advance",
      date: ymd(data?.start_date) || ymd(data?.end_date) || new Date().toISOString().slice(0, 10),
      amount: adv,
      method: String(data?.payment_method ?? "").trim(),
      note: "Opening advance",
    },
  ];
}

export function receivedFromPayments(pays: ProjectPay[]) {
  return pays.reduce((acc, p) => acc + money(p.amount), 0);
}

export function applyProjectPayments(data: Record<string, unknown>, pays: ProjectPay[]): Record<string, unknown> {
  const cleaned = pays
    .map(asPay)
    .filter((p): p is ProjectPay => Boolean(p))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const received = receivedFromPayments(cleaned);
  const total = money(data.total_amount);
  return {
    ...data,
    payments: cleaned,
    advance_amount: received,
    remaining_amount: Math.max(0, total - received),
  };
}

function isComplete(data: Record<string, unknown> | undefined) {
  const status = String(data?.status || "").toLowerCase();
  return status === "completed" || status === "done";
}

/** Completed/done projects treat leftover remaining as cash in (old CRM). */
export function settleIfComplete(data: Record<string, unknown>, pays: ProjectPay[]) {
  const applied = applyProjectPayments(data, pays);
  if (!isComplete(applied) || money(applied.remaining_amount) <= 0) return applied;
  return applyProjectPayments(applied, [
    ...parseProjectPayments(applied),
    {
      id: uid(),
      date: ymd(applied.end_date) || ymd(applied.deadline) || new Date().toISOString().slice(0, 10),
      amount: money(applied.remaining_amount),
      method: String(applied.payment_method || "").trim(),
      note: "Settled on complete",
    },
  ]);
}

export function projectReceipts(row: RecordRow) {
  const settled = isComplete(row.data) ? settleIfComplete(row.data, parseProjectPayments(row.data)) : row.data;
  const pays = parseProjectPayments(settled);
  const client = String(row.data.client || "").trim();
  const name = String(row.data.name || "Project").trim();
  return pays.map((p, i) => ({
    ...p,
    client,
    title: `${name}${client ? ` · ${client}` : ""}`,
    suffix: `pay-${p.id || i}`,
  }));
}

export function projectCashIn(row: RecordRow) {
  return projectReceipts(row).reduce((acc, p) => acc + money(p.amount), 0);
}

export function linkedInvoiceIds(projects: RecordRow[]) {
  const ids = new Set<string>();
  for (const r of projects) {
    for (const p of parseProjectPayments(r.data)) {
      if (p.invoice_id) ids.add(p.invoice_id);
    }
  }
  return ids;
}

export function parseCollections(data: Record<string, unknown> | undefined): ProjectPay[] {
  const raw = data?.collections;
  if (Array.isArray(raw)) {
    const listed = raw.map(asPay).filter((p): p is ProjectPay => Boolean(p));
    if (listed.length) return listed.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  const last = money(data?.last_paid_amount);
  const when = ymd(data?.last_paid_date);
  if (last > 0 && when) {
    return [{ id: "legacy-collection", date: when, amount: last, method: String(data?.payment_method ?? "").trim(), note: "Last paid" }];
  }
  return [];
}

export function applyCollections(data: Record<string, unknown>, pays: ProjectPay[]): Record<string, unknown> {
  const cleaned = pays
    .map(asPay)
    .filter((p): p is ProjectPay => Boolean(p))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const last = cleaned[cleaned.length - 1];
  return {
    ...data,
    collections: cleaned,
    last_paid_date: last?.date || "",
    last_paid_amount: last ? last.amount : 0,
  };
}

export function collectionCash(row: RecordRow) {
  const cols = parseCollections(row.data);
  if (cols.length) return receivedFromPayments(cols);
  if (row.data.active === false) return 0;
  return money(row.data.amount);
}

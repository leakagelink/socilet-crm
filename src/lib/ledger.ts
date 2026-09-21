import type { RecordRow } from "@/lib/db";
import { dayOf, inDayRange, ymd } from "@/lib/dateRange";
import { parseCollections, projectReceipts } from "@/lib/projectPayments";
import { isLend, paidOnDeal } from "@/lib/lendBorrow";

export type LedgerKind = "projects" | "recurring" | "digital" | "other" | "cosmofeed" | "spends" | "adjustment" | "lend_borrow";

export type LedgerTx = {
  id: string;
  date: string;
  kind: LedgerKind;
  title: string;
  amount: number;
  method: string;
  href: string;
};

export const LEDGER_KINDS: { id: LedgerKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "projects", label: "Projects" },
  { id: "recurring", label: "Recurring" },
  { id: "digital", label: "Digital products" },
  { id: "other", label: "Other income" },
  { id: "cosmofeed", label: "Cosmofeed" },
  { id: "spends", label: "Spends" },
  { id: "lend_borrow", label: "Lend / borrow" },
  { id: "adjustment", label: "Adjustments" },
];

export function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function receivedOf(r: RecordRow) {
  const status = String(r.data.status || "paid").toLowerCase();
  if (status === "unpaid") return 0;
  const paid = money(r.data.paid_amount);
  if (status === "partial") return paid;
  if (paid > 0) return paid;
  return money(r.data.amount);
}

function parseDay(raw: unknown) {
  const s = dayOf(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bumpDate(d: Date, cadence: string) {
  const next = new Date(d);
  if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function recurringDates(row: RecordRow, from: string, to: string) {
  if (row.data.active === false) return [];
  const start = parseDay(row.data.start_date || row.data.last_paid_date || row.created_at);
  if (!start) return [];
  const endRaw = to || ymd(new Date());
  const end = parseDay(endRaw);
  if (!end) return [];
  const cadence = String(row.data.cadence || "monthly");
  const dates: string[] = [];
  let cur = start;
  let i = 0;
  while (i++ < 400 && ymd(cur) <= endRaw) {
    const s = ymd(cur);
    if (inDayRange(s, from, to)) dates.push(s);
    const next = bumpDate(cur, cadence);
    if (ymd(next) <= s) break;
    cur = next;
  }
  return dates;
}

function push(
  out: LedgerTx[],
  row: RecordRow,
  kind: LedgerKind,
  title: string,
  amount: number,
  dateRaw: unknown,
  href: string,
  suffix = "",
  method = "",
) {
  if (!amount) return;
  const date = dayOf(dateRaw) || dayOf(row.created_at);
  out.push({
    id: suffix ? `${row.id}:${suffix}` : row.id,
    date,
    kind,
    title,
    amount,
    method: method || String(row.data.payment_method || ""),
    href,
  });
}

export function buildLedger(input: {
  projects: RecordRow[];
  addons: RecordRow[];
  recurring: RecordRow[];
  digital: RecordRow[];
  other: RecordRow[];
  cosmofeed: RecordRow[];
  spends: RecordRow[];
  adjustments: RecordRow[];
  lendBorrow?: RecordRow[];
  from: string;
  to: string;
}): LedgerTx[] {
  const { from, to } = input;
  const out: LedgerTx[] = [];

  for (const r of input.projects) {
    const receipts = projectReceipts(r);
    if (receipts.length) {
      for (const p of receipts) {
        push(out, r, "projects", p.title, p.amount, p.date, "/projects", p.suffix, p.method);
      }
      continue;
    }
    push(
      out,
      r,
      "projects",
      String(r.data.name || "Project"),
      money(r.data.advance_amount),
      r.data.start_date || r.created_at,
      "/projects",
    );
  }
  for (const r of input.addons) {
    const status = String(r.data.status || "").toLowerCase();
    if (status !== "paid" && status !== "partial") continue;
    push(
      out,
      r,
      "projects",
      String(r.data.project_name || r.data.description || "Add-on"),
      status === "partial" ? money(r.data.paid_amount) || money(r.data.amount) : money(r.data.amount),
      r.data.date || r.created_at,
      "/project-addons",
    );
  }
  for (const r of input.recurring) {
    const name = String(r.data.name || "Recurring");
    const cols = parseCollections(r.data);
    if (cols.length) {
      for (const c of cols) {
        push(out, r, "recurring", name, c.amount, c.date, "/recurring-earnings", c.id, c.method);
      }
      continue;
    }
    const amt = money(r.data.amount);
    for (const d of recurringDates(r, from, to)) {
      push(out, r, "recurring", name, amt, d, "/recurring-earnings", d);
    }
  }
  for (const r of input.digital) {
    push(
      out,
      r,
      "digital",
      String(r.data.name || "Digital"),
      money(r.data.resell_price) || money(r.data.amount),
      r.data.sale_date || r.data.date || r.created_at,
      "/digital-products",
    );
  }
  for (const r of input.other) {
    push(
      out,
      r,
      "other",
      String(r.data.source || r.data.client || "Other income"),
      receivedOf(r),
      r.data.date || r.created_at,
      "/other-income",
    );
  }
  for (const r of input.cosmofeed) {
    if (String(r.data.status || "").toLowerCase() === "failed") continue;
    push(
      out,
      r,
      "cosmofeed",
      String(r.data.product || "Cosmofeed"),
      money(r.data.amount),
      r.data.date || r.created_at,
      "/cosmofeed",
    );
  }
  for (const r of input.spends) {
    push(out, r, "spends", String(r.data.title || r.data.category || "Spend"), -Math.abs(money(r.data.amount)), r.data.date || r.created_at, "/spends");
  }
  for (const r of input.lendBorrow ?? []) {
    const party = String(r.data.party || "Person");
    const lend = isLend(r.data);
    const principal = money(r.data.amount);
    push(
      out,
      r,
      "lend_borrow",
      lend ? `Lent to ${party}` : `Borrowed from ${party}`,
      lend ? -Math.abs(principal) : principal,
      r.data.start_date || r.created_at,
      "/lend-borrow",
      "principal",
    );
    const cols = parseCollections(r.data);
    if (cols.length) {
      for (const c of cols) {
        push(
          out,
          r,
          "lend_borrow",
          lend ? `Return from ${party}` : `Repaid ${party}`,
          lend ? c.amount : -Math.abs(c.amount),
          c.date,
          "/lend-borrow",
          c.id,
          c.method,
        );
      }
    } else {
      const paid = paidOnDeal(r.data);
      if (paid) {
        push(
          out,
          r,
          "lend_borrow",
          lend ? `Return from ${party}` : `Repaid ${party}`,
          lend ? paid : -Math.abs(paid),
          r.data.due_date || r.updated_at,
          "/lend-borrow",
          "settled",
        );
      }
    }
  }
  for (const r of input.adjustments) {
    push(out, r, "adjustment", String(r.data.note || "Adjustment"), money(r.data.amount), r.data.date || r.created_at, "/balance-tracker");
  }

  return out
    .filter((t) => inDayRange(t.date, from, to))
    .sort((a, b) => `${b.date}${b.title}`.localeCompare(`${a.date}${a.title}`));
}

export function ledgerTotals(rows: LedgerTx[]) {
  const sum = (kind: LedgerKind) => rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.amount, 0);
  const projects = sum("projects");
  const recurring = sum("recurring");
  const digital = sum("digital");
  const other = sum("other");
  const cosmofeed = sum("cosmofeed");
  const spends = Math.abs(sum("spends"));
  const lendBorrow = sum("lend_borrow");
  const adjustments = sum("adjustment");
  const income = projects + recurring + digital + other + cosmofeed + Math.max(0, adjustments) + Math.max(0, lendBorrow);
  const out = spends + Math.max(0, -adjustments) + Math.max(0, -lendBorrow);
  return { projects, recurring, digital, other, cosmofeed, spends, adjustments, lendBorrow, income, out, net: income - out };
}

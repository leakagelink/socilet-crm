import type { RecordRow } from "@/lib/db";
import { collectionCash, parseCollections, receivedFromPayments, type ProjectPay } from "@/lib/projectPayments";

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function isLend(data: Record<string, unknown> | undefined) {
  const v = str(data?.direction).toLowerCase();
  return v === "lend" || v === "lent";
}

export function expectedInterest(principal: unknown, roi: unknown) {
  return Math.round(num(principal) * (num(roi) / 100) * 100) / 100;
}

export function expectedTotal(principal: unknown, roi: unknown) {
  return num(principal) + expectedInterest(principal, roi);
}

export function paidOnDeal(data: Record<string, unknown> | undefined) {
  const cols = parseCollections(data);
  if (cols.length) return collectionCash({ data } as RecordRow);
  return num(data?.received_amount);
}

export function remainingOnDeal(data: Record<string, unknown> | undefined) {
  return Math.max(0, expectedTotal(data?.amount, data?.roi_percent) - paidOnDeal(data));
}

function monthsBetween(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export function installmentAmount(data: Record<string, unknown> | undefined) {
  const total = expectedTotal(data?.amount, data?.roi_percent);
  const payout = str(data?.payout).toLowerCase();
  if (!total) return 0;
  if (payout === "one_time" || payout === "lump_sum") return total;
  if (payout === "ongoing") return 0;
  const start = str(data?.start_date).slice(0, 10);
  const due = str(data?.due_date).slice(0, 10);
  const span = monthsBetween(start, due);
  if (payout === "yearly") {
    const years = Math.max(1, Math.round(span / 12) || 1);
    return Math.round((total / years) * 100) / 100;
  }
  const months = Math.max(1, span || 1);
  return Math.round((total / months) * 100) / 100;
}

export function applyLendBorrow(data: Record<string, unknown>, pays: ProjectPay[]) {
  const paid = pays.length ? receivedFromPayments(pays) : num(data.received_amount);
  const expected = expectedTotal(data.amount, data.roi_percent);
  const remaining = Math.max(0, expected - paid);
  const payout = str(data.payout).toLowerCase();
  const due = str(data.due_date).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  let status = str(data.status) || "open";
  if (remaining <= 0.009) status = "settled";
  else if (due && due < today) status = "overdue";
  else if (payout === "ongoing" || paid > 0) status = "receiving";
  else status = "open";
  return {
    ...data,
    received_amount: paid,
    expected_return: expected,
    remaining_amount: remaining,
    installment_amount: installmentAmount({ ...data, amount: data.amount, roi_percent: data.roi_percent, payout: data.payout, start_date: data.start_date, due_date: data.due_date }),
    status,
  };
}

/** Cash: lend principal out, repayments in. Borrow principal in, repayments out. */
export function lendBorrowCash(row: RecordRow) {
  const principal = num(row.data.amount);
  const paid = paidOnDeal(row.data);
  if (isLend(row.data)) return { inflow: paid, outflow: principal };
  return { inflow: principal, outflow: paid };
}

export function lendBorrowNet(rows: RecordRow[]) {
  return rows.reduce((acc, r) => {
    const c = lendBorrowCash(r);
    return acc + c.inflow - c.outflow;
  }, 0);
}

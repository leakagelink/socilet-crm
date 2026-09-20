import type { RecordRow } from "@/lib/db";
import { inDayRange } from "@/lib/dateRange";

export function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function productName(row: RecordRow) {
  return String(row.data.product || row.data.ad_for || "").trim() || "Unassigned";
}

export function isAdSpend(row: RecordRow) {
  const cat = String(row.data.category || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ");
  return cat === "ad spend" || cat === "adspend" || cat.includes("ad spend");
}

export function saleKept(row: RecordRow) {
  const status = String(row.data.status || "settled").toLowerCase();
  return status !== "failed";
}

export function saleDate(row: RecordRow) {
  return row.data.date || row.created_at;
}

export function spendDate(row: RecordRow) {
  return row.data.date || row.created_at;
}

export function filterSales(rows: RecordRow[], from: string, to: string, product = "") {
  return rows.filter((r) => {
    if (!saleKept(r)) return false;
    if (!inDayRange(saleDate(r), from, to)) return false;
    if (product && productName(r) !== product) return false;
    return true;
  });
}

export function filterAdSpends(rows: RecordRow[], from: string, to: string, product = "") {
  return rows.filter((r) => {
    if (!isAdSpend(r)) return false;
    if (!inDayRange(spendDate(r), from, to)) return false;
    if (product && productName(r) !== product) return false;
    return true;
  });
}

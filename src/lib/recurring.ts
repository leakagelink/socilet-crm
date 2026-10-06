import { applyCollections, money, parseCollections, type ProjectPay } from "@/lib/projectPayments";
import { listRecords, updateRecord } from "@/lib/db";
import { uid } from "@/lib/utils";

export const IST = "Asia/Kolkata";

export function todayIST(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function ymd(raw: unknown) {
  const s = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function isAutomaticPayment(data: Record<string, unknown> | undefined) {
  return String(data?.payment_mode ?? "").toLowerCase() === "automatic";
}

export function bumpCadenceYmd(iso: string, cadence: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else if (cadence === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function receiptOn(cols: ProjectPay[], date: string) {
  return cols.some((c) => c.date === date);
}

export function applyAutomaticRecurring(data: Record<string, unknown>, today = todayIST()) {
  if (data.active === false || !isAutomaticPayment(data)) return { data, changed: false };
  let next = ymd(data.next_date);
  if (!next) return { data, changed: false };
  const cadence = String(data.cadence || "monthly");
  const amount = money(data.amount);
  const method = String(data.payment_method || "UPI");
  const cols = parseCollections(data);
  let changed = false;
  let guard = 0;
  while (next && next <= today && guard++ < 120) {
    if (amount > 0 && !receiptOn(cols, next)) {
      cols.push({
        id: uid(),
        date: next,
        amount,
        method,
        note: "Automatic payment",
      });
      changed = true;
    }
    const after = bumpCadenceYmd(next, cadence);
    if (!after || after <= next) break;
    if (after !== ymd(data.next_date) || changed) changed = true;
    next = after;
  }
  if (!changed && next === ymd(data.next_date)) return { data, changed: false };
  const applied = applyCollections(data, cols);
  applied.next_date = next;
  return { data: applied, changed: true };
}

export function advanceNextAfterCollections(data: Record<string, unknown>) {
  const cols = parseCollections(data);
  const last = cols[cols.length - 1];
  let next = ymd(data.next_date);
  if (!last || !next) return data;
  const cadence = String(data.cadence || "monthly");
  let guard = 0;
  while (next && last.date >= next && guard++ < 120) {
    const after = bumpCadenceYmd(next, cadence);
    if (!after || after <= next) break;
    next = after;
  }
  return { ...data, next_date: next };
}

export function finalizeRecurringSave(values: Record<string, unknown>, collections: ProjectPay[]) {
  let data = applyCollections(values, collections);
  if (isAutomaticPayment(data)) return applyAutomaticRecurring(data).data;
  return advanceNextAfterCollections(data);
}

export async function settleAutomaticRecurring() {
  const rows = await listRecords("recurring_earnings");
  const today = todayIST();
  let n = 0;
  for (const row of rows) {
    const { data, changed } = applyAutomaticRecurring(row.data, today);
    if (!changed) continue;
    await updateRecord(row.id, data);
    n += 1;
  }
  return n;
}

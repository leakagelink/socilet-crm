import { randomUUID } from "node:crypto";

function str(v) {
  return String(v ?? "").trim();
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(raw) {
  const s = str(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function todayIST(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isAutomaticPayment(data) {
  return str(data?.payment_mode).toLowerCase() === "automatic";
}

export function bumpCadenceYmd(iso, cadence) {
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

function asPay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amount = money(raw.amount);
  const date = ymd(raw.date);
  if (!date || amount <= 0) return null;
  return {
    id: str(raw.id) || randomUUID(),
    date,
    amount,
    method: str(raw.method ?? raw.payment_method),
    note: str(raw.note),
  };
}

function parseCollections(data) {
  const raw = data?.collections;
  if (Array.isArray(raw)) {
    const listed = raw.map(asPay).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    if (listed.length) return listed;
  }
  const last = money(data?.last_paid_amount);
  const when = ymd(data?.last_paid_date);
  if (last > 0 && when) {
    return [{ id: "legacy-collection", date: when, amount: last, method: str(data?.payment_method), note: "Last paid" }];
  }
  return [];
}

function applyCollections(data, pays) {
  const cleaned = pays.map(asPay).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const last = cleaned[cleaned.length - 1];
  return {
    ...data,
    collections: cleaned,
    last_paid_date: last?.date || "",
    last_paid_amount: last ? last.amount : 0,
  };
}

export function applyAutomaticRecurring(data, today) {
  if (!data || data.active === false || !isAutomaticPayment(data)) return { data, changed: false };
  let next = ymd(data.next_date);
  if (!next) return { data, changed: false };
  const cadence = str(data.cadence) || "monthly";
  const amount = money(data.amount);
  const method = str(data.payment_method) || "UPI";
  const cols = parseCollections(data);
  let changed = false;
  let guard = 0;
  while (next && next <= today && guard++ < 120) {
    if (amount > 0 && !cols.some((c) => c.date === next)) {
      cols.push({
        id: randomUUID(),
        date: next,
        amount,
        method,
        note: "Automatic payment",
      });
      changed = true;
    }
    const after = bumpCadenceYmd(next, cadence);
    if (!after || after <= next) break;
    next = after;
    changed = true;
  }
  if (!changed) return { data, changed: false };
  const applied = applyCollections(data, cols);
  applied.next_date = next;
  return { data: applied, changed: true };
}

export function settleAutomaticRecurringInState(state, today = todayIST()) {
  if (!state?.records) return 0;
  const now = new Date().toISOString();
  let n = 0;
  state.records = state.records.map((row) => {
    if (row.module !== "recurring_earnings") return row;
    const next = applyAutomaticRecurring(row.data, today);
    if (!next.changed) return row;
    n += 1;
    return { ...row, data: next.data, updated_at: now };
  });
  return n;
}

const STATUS_TONE: Record<string, string> = {
  paid: "ok",
  done: "ok",
  completed: "ok",
  settled: "ok",
  accepted: "ok",
  active: "ok",
  running: "info",
  sent: "info",
  review: "info",
  in_progress: "info",
  partial: "info",
  open: "info",
  planned: "wait",
  draft: "wait",
  todo: "wait",
  pending: "wait",
  due: "soon",
  high: "soon",
  medium: "info",
  low: "wait",
  paused: "warn",
  unpaid: "bad",
  lost: "bad",
  void: "bad",
  failed: "bad",
  overdue: "bad",
  skipped: "warn",
  soon: "soon",
  today: "soon",
  closed: "wait",
};

const TONE_CLASS: Record<string, string> = {
  ok: "border-mint/50 bg-mint/12 text-mint",
  info: "border-sky-400/60 bg-sky-100 text-sky-800",
  wait: "border-line bg-gold/10 text-paper/70",
  soon: "border-amber-400/70 bg-amber-100 text-amber-800",
  warn: "border-orange-400/60 bg-orange-100 text-orange-800",
  bad: "border-rose-400/60 bg-rose-100 text-rose-800",
};

export const DATE_FIELDS = new Set([
  "start_date",
  "end_date",
  "deadline",
  "due_date",
  "due_at",
  "valid_until",
  "next_date",
  "sale_date",
  "paid_at",
  "last_paid_date",
  "date",
]);

export function statusTone(value: unknown) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return STATUS_TONE[key] ?? "wait";
}

export function statusClass(value: unknown) {
  return TONE_CLASS[statusTone(value)] ?? TONE_CLASS.wait;
}

export function parseDay(raw: unknown) {
  const s = String(raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PAST_OK = new Set(["start_date", "sale_date", "paid_at", "last_paid_date", "date"]);

export function dateTone(raw: unknown, field?: string) {
  const d = parseDay(raw);
  if (!d) return "wait";
  const now = Date.now();
  const diff = d.getTime() - now;
  if (PAST_OK.has(field ?? "")) {
    if (diff < 0) return "ok";
    if (diff < 2 * 86400000) return "soon";
    return "info";
  }
  if (diff < 0) return "bad";
  if (diff < 2 * 86400000) return "soon";
  if (diff < 7 * 86400000) return "warn";
  return "info";
}

export function dateClass(raw: unknown, field?: string) {
  return TONE_CLASS[dateTone(raw, field)] ?? TONE_CLASS.wait;
}

export function formatDay(raw: unknown) {
  const s = String(raw ?? "").trim().slice(0, 10);
  if (!s) return "—";
  const d = parseDay(s);
  if (!d) return s;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function isProjectStarted(data: Record<string, unknown>) {
  const status = String(data.status ?? "").toLowerCase();
  if (["completed", "done", "paused"].includes(status)) return false;
  if (status === "active" || status === "running") return true;
  const start = String(data.start_date ?? "").slice(0, 10);
  if (!start) return false;
  const today = new Date().toISOString().slice(0, 10);
  return start <= today;
}

export function projectTarget(data: Record<string, unknown>) {
  return parseDay(data.deadline) || parseDay(data.end_date);
}

export function countdownParts(target: Date, now = Date.now()) {
  const ms = target.getTime() - now;
  const late = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  let text: string;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${mins}m`;
  else text = `${mins}m`;
  text = late ? `${text} overdue` : `${text} left`;
  const tone = late ? "bad" : days <= 2 ? "soon" : days <= 7 ? "warn" : "ok";
  return { text, tone, late };
}

export function countdownClass(tone: string) {
  return TONE_CLASS[tone] ?? TONE_CLASS.wait;
}

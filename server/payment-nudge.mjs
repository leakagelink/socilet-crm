import { randomUUID } from "node:crypto";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import { sendCrmEmail } from "./email-api.mjs";
import { pickBestCopy, readJsonCopies, writeJsonCopies } from "./persist.mjs";
import { settleAutomaticRecurringInState } from "./recurring.mjs";

const AHEAD_DAYS = 3;
const TZ = "Asia/Kolkata";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function day(v) {
  return str(v).slice(0, 10);
}

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function hourIST() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
}

function inSendWindow() {
  const h = hourIST();
  return h >= 9 && h <= 20;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function emptyLog() {
  return { enabled: true, day: "", emails: [], last: null, last_error: null };
}

function loadLog() {
  const copies = readJsonCopies("payment-nudge.json").filter((c) => c.raw && typeof c.raw === "object");
  const best = pickBestCopy(copies, (c) => Date.parse(c.raw?.last || "") || c.mtime || 0);
  if (!best?.raw) return emptyLog();
  return { ...emptyLog(), ...best.raw, emails: Array.isArray(best.raw.emails) ? best.raw.emails : [] };
}

function saveLog(log) {
  writeJsonCopies("payment-nudge.json", log);
}

function clientOf(records, row) {
  const id = str(row.data?.client_id);
  const name = str(row.data?.client);
  const clients = records.filter((r) => r.module === "clients");
  return clients.find((c) => c.id === id || str(c.data?.name) === name) || null;
}

function emailOf(records, row) {
  const c = clientOf(records, row);
  const raw = str(row.data?.client_email) || str(row.data?.email) || str(c?.data?.email);
  return raw.includes("@") ? raw.toLowerCase() : "";
}

function nameOf(records, row) {
  const c = clientOf(records, row);
  return str(row.data?.client) || str(c?.data?.name) || "there";
}

function inWindow(due, today, soon) {
  if (!due) return null;
  if (due < today) return "overdue";
  if (due <= soon) return "due";
  return null;
}

export function collectPaymentDues(records, today = todayISO()) {
  const soon = addDays(today, AHEAD_DAYS);
  const items = [];

  for (const row of records) {
    if (row.module === "invoices") {
      const st = str(row.data?.status).toLowerCase();
      if (["paid", "void", "draft"].includes(st)) continue;
      const tone = inWindow(day(row.data?.due_date), today, soon);
      if (!tone) continue;
      const email = emailOf(records, row);
      if (!email) continue;
      items.push({
        id: `invoice:${row.id}`,
        email,
        client: nameOf(records, row),
        line: `Invoice ${str(row.data?.invoice_no) || row.id} · ₹${Math.round(num(row.data?.amount))} · due ${day(row.data?.due_date)} (${tone === "overdue" ? "overdue" : "due soon"})`,
        tone,
      });
    }
    if (row.module === "projects") {
      const st = str(row.data?.status).toLowerCase();
      if (["done", "completed"].includes(st)) continue;
      if (num(row.data?.remaining_amount) <= 0) continue;
      const due = day(row.data?.deadline || row.data?.end_date);
      const tone = inWindow(due, today, soon);
      if (!tone) continue;
      const email = emailOf(records, row);
      if (!email) continue;
      items.push({
        id: `project:${row.id}`,
        email,
        client: nameOf(records, row),
        line: `Project ${str(row.data?.name) || row.id} · remaining ₹${Math.round(num(row.data?.remaining_amount))} · due ${due} (${tone === "overdue" ? "overdue" : "due soon"})`,
        tone,
      });
    }
    if (row.module === "recurring_earnings") {
      if (row.data?.active === false) continue;
      if (str(row.data?.payment_mode).toLowerCase() === "automatic") continue;
      const due = day(row.data?.next_date);
      const tone = inWindow(due, today, soon);
      if (!tone) continue;
      const email = emailOf(records, row);
      if (!email) continue;
      items.push({
        id: `recurring:${row.id}`,
        email,
        client: nameOf(records, row),
        line: `Retainer ${str(row.data?.name) || row.id} · ₹${Math.round(num(row.data?.amount))} · billing ${due} (${tone === "overdue" ? "overdue" : "due soon"})`,
        tone,
      });
    }
  }
  return items;
}

function letter(firm, client, lines) {
  const brand = str(firm?.legal_name) || "Socilet";
  const extra = [str(firm?.email), str(firm?.phone), str(firm?.upi_id) ? `UPI ${firm.upi_id}` : ""].filter(Boolean);
  return [
    `Namaste ${client},`,
    "",
    `${brand} se payment reminder — aapke CRM me ye amounts pending / due hain:`,
    "",
    ...lines.map((l) => `• ${l}`),
    "",
    "Jab payment ho jaye, reply kar dena. Koi confusion ho to isi mail pe likhein.",
    extra.length ? extra.join(" · ") : "",
    "",
    `— ${brand}`,
  ].join("\n");
}

export async function runPaymentNudges(env = process.env, { force = false } = {}) {
  const state = loadCrmState();
  const today = todayISO();
  const autoApplied = settleAutomaticRecurringInState(state, today);
  if (autoApplied) saveCrmState(state);

  const log = loadLog();
  if (!log.enabled && !force) {
    return { ok: true, skipped: "disabled", sent: 0, pending: 0, auto: autoApplied };
  }
  const items = collectPaymentDues(state.records, today);
  if (log.day !== today) {
    log.day = today;
    log.emails = [];
  }
  const groups = new Map();
  for (const item of items) {
    const list = groups.get(item.email) || [];
    list.push(item);
    groups.set(item.email, list);
  }

  const sent = [];
  const errors = [];
  for (const [email, list] of groups) {
    const stamp = `${today}|${email}`;
    if (log.emails.includes(stamp) && !force) continue;
    const client = list[0]?.client || "there";
    const brand = str(state.settings.firm?.legal_name) || "Socilet";
    const subject = list.some((x) => x.tone === "overdue") ? `Payment overdue — ${brand}` : `Payment due — ${brand}`;
    try {
      await sendCrmEmail(env, {
        to: email,
        subject,
        text: letter(state.settings.firm, client, list.map((x) => x.line)),
      });
      if (!log.emails.includes(stamp)) log.emails.push(stamp);
      sent.push(email);
      const now = new Date().toISOString();
      state.records.push({
        id: randomUUID(),
        module: "emails",
        data: {
          to_addr: email,
          subject,
          body: `Auto payment reminder (${list.length} item${list.length === 1 ? "" : "s"})`,
          status: "sent",
          sent_at: now,
        },
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }

  log.last = new Date().toISOString();
  log.last_error = errors[0] || null;
  log.emails = [...new Set(log.emails)].slice(-800);
  saveLog(log);
  if (sent.length) saveCrmState(state);

  const emailedToday = log.emails.filter((k) => k.startsWith(`${today}|`)).length;
  return {
    ok: errors.length === 0,
    sent: sent.length,
    pending: Math.max(0, groups.size - emailedToday),
    clients: groups.size,
    errors,
    last: log.last,
    enabled: log.enabled,
  };
}

export function paymentNudgeStatus() {
  const log = loadLog();
  const items = collectPaymentDues(loadCrmState().records);
  const today = todayISO();
  const emails = [...new Set(items.map((i) => i.email))];
  const sentToday = (log.day === today ? log.emails : []).filter((k) => k.startsWith(`${today}|`));
  return {
    enabled: log.enabled !== false,
    last: log.last,
    last_error: log.last_error,
    window: inSendWindow(),
    pending_clients: emails.filter((e) => !sentToday.includes(`${today}|${e}`)).length,
    sent_today: sentToday.length,
    items: items.length,
  };
}

export function setPaymentNudgeEnabled(on) {
  const log = loadLog();
  log.enabled = Boolean(on);
  saveLog(log);
  return paymentNudgeStatus();
}

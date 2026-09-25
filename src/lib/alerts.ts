import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { apiFetch } from "@/lib/apiBase";

export type AlertItem = {
  source_id: string;
  title: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  href: string;
};

function str(v: unknown) {
  return String(v ?? "").trim();
}

function ts(v: unknown) {
  const t = new Date(str(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

async function fromModule(
  module: string,
  href: string,
  pred: (row: RecordRow) => AlertItem | null,
) {
  void href;
  const rows = await listRecords(module);
  return rows.map(pred).filter((x): x is AlertItem => Boolean(x));
}

async function fromEmail(): Promise<AlertItem[]> {
  try {
    const boxesRes = await apiFetch("/api/email/mailboxes");
    const type = boxesRes.headers.get("content-type") || "";
    if (!type.includes("json") || !boxesRes.ok) return [];
    const boxes = (await boxesRes.json()) as { data?: { id: string; label: string }[] };
    const out: AlertItem[] = [];
    for (const box of boxes.data ?? []) {
      const inboxRes = await apiFetch(`/api/email/inbox?mailbox=${encodeURIComponent(box.id)}`);
      if (!inboxRes.ok) continue;
      const inbox = (await inboxRes.json()) as {
        data?: { id: string; subject?: string; from?: string }[];
      };
      for (const mail of inbox.data ?? []) {
        out.push({
          source_id: `email:${mail.id}`,
          title: "New email",
          message: `${mail.subject || "(no subject)"} · ${mail.from || ""} (${box.label})`,
          level: "info",
          href: "/emails",
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function collectAlerts(): Promise<AlertItem[]> {
  const today = startOfDay();
  const soon = today + 2 * 86400000;
  const now = Date.now();

  const [reminders, tasks, projects, invoices, quotes, recurring, lendBorrow, emails] = await Promise.all([
    fromModule("reminders", "/reminders", (row) => {
      const status = str(row.data.status);
      const due = ts(row.data.due_at);
      if (status === "done" || status === "skipped" || due == null || due > now + 3600000) return null;
      const overdue = due < now;
      return {
        source_id: `reminder:${row.id}`,
        title: overdue ? "Reminder overdue" : "Reminder due",
        message: str(row.data.title) || "Reminder",
        level: overdue ? "error" : "warning",
        href: "/reminders",
      };
    }),
    fromModule("tasks", "/tasks", (row) => {
      const status = str(row.data.status);
      const due = ts(row.data.due_date);
      if (status === "done" || due == null || due > soon) return null;
      const overdue = due < today;
      return {
        source_id: `task:${row.id}`,
        title: overdue ? "Task overdue" : "Task due soon",
        message: `${str(row.data.title)} (${status || "open"})`,
        level: overdue ? "error" : "warning",
        href: "/tasks",
      };
    }),
    fromModule("projects", "/follow-ups", (row) => {
      const remain = Number(row.data.remaining_amount);
      const status = str(row.data.status);
      if (Number.isFinite(remain) && remain > 0 && status !== "done" && status !== "completed") {
        return {
          source_id: `pending:${row.id}`,
          title: "Payment pending",
          message: `${str(row.data.name)} · ${str(row.data.client)}`,
          level: "warning" as const,
          href: "/follow-ups",
        };
      }
      const start = ts(row.data.start_date);
      if (status === "done" || status === "completed" || status === "paused" || start == null) return null;
      if (start > today + 86400000) return null;
      if (status !== "planned" && status !== "active" && status !== "running") return null;
      const starting = start >= today && start < today + 86400000;
      if (!starting && status !== "planned") return null;
      return {
        source_id: `project:${row.id}`,
        title: starting ? "Project starts today" : "Project pending",
        message: `${str(row.data.name)} · ${str(row.data.client)}`,
        level: "info",
        href: "/projects",
      };
    }),
    fromModule("invoices", "/follow-ups", (row) => {
      const status = str(row.data.status);
      const due = ts(row.data.due_date);
      if (status === "paid" || status === "void" || status === "draft" || due == null) return null;
      if (due > today) return null;
      return {
        source_id: `invoice:${row.id}`,
        title: "Invoice overdue",
        message: `${str(row.data.invoice_no)} · ${str(row.data.client)}`,
        level: "error",
        href: "/follow-ups",
      };
    }),
    fromModule("quotations", "/quotations", (row) => {
      const status = str(row.data.status);
      const until = ts(row.data.valid_until);
      if (status !== "sent" || until == null || until > soon) return null;
      return {
        source_id: `quote:${row.id}`,
        title: "Quote expiring",
        message: `${str(row.data.quote_no)} · ${str(row.data.client)}`,
        level: "warning",
        href: "/quotations",
      };
    }),
    fromModule("recurring_earnings", "/recurring-earnings", (row) => {
      if (row.data.active === false) return null;
      const next = ts(row.data.next_date);
      if (next == null || next > soon) return null;
      return {
        source_id: `recurring:${row.id}`,
        title: "Recurring payment due",
        message: str(row.data.name),
        level: "info",
        href: "/recurring-earnings",
      };
    }),
    fromModule("lend_borrow", "/lend-borrow", (row) => {
      const status = str(row.data.status);
      if (status === "settled") return null;
      const remain = Number(row.data.remaining_amount);
      if (Number.isFinite(remain) && remain <= 0) return null;
      const due = ts(row.data.due_date);
      if (due == null || due > soon) return null;
      const overdue = due < now;
      const lend = ["lend", "lent"].includes(str(row.data.direction).toLowerCase());
      return {
        source_id: `lend:${row.id}`,
        title: overdue ? (lend ? "Lend overdue" : "Borrow overdue") : lend ? "Lend due soon" : "Borrow due soon",
        message: `${str(row.data.party)} · ₹${Math.round(Number(row.data.remaining_amount) || 0)}`,
        level: overdue ? "error" : "warning",
        href: "/lend-borrow",
      };
    }),
    fromEmail(),
  ]);

  return [...emails, ...reminders, ...tasks, ...projects, ...invoices, ...quotes, ...recurring, ...lendBorrow];
}

export async function syncNotifications() {
  const [existing, alerts] = await Promise.all([listRecords("notifications"), collectAlerts()]);
  const seen = new Set(existing.map((r) => str(r.data.source_id)));
  let primed: string[] = [];
  try {
    primed = JSON.parse(localStorage.getItem("socilet.alerts.v1") || "[]") as string[];
  } catch {
    primed = [];
  }
  const known = new Set([...primed, ...seen]);
  const firstRun = primed.length === 0 && existing.length === 0;
  if (firstRun) {
    for (const a of alerts) {
      if (a.source_id.startsWith("email:")) {
        known.add(a.source_id);
        continue;
      }
      await insertRecord("notifications", {
        title: a.title,
        message: a.message,
        level: a.level,
        read: false,
        href: a.href,
        source_id: a.source_id,
      });
      known.add(a.source_id);
    }
    localStorage.setItem("socilet.alerts.v1", JSON.stringify([...known]));
    return listRecords("notifications");
  }
  const fresh: AlertItem[] = [];
  for (const a of alerts) {
    if (known.has(a.source_id)) continue;
    await insertRecord("notifications", {
      title: a.title,
      message: a.message,
      level: a.level,
      read: false,
      href: a.href,
      source_id: a.source_id,
    });
    known.add(a.source_id);
    fresh.push(a);
  }
  localStorage.setItem("socilet.alerts.v1", JSON.stringify([...known]));
  await showNativeTray(fresh);
  return listRecords("notifications");
}

const BRIEF_NOTE_ID = 91001;
let webBriefTimer: number | undefined;

function msUntilHour(hour: number) {
  const n = new Date();
  const t = new Date(n);
  t.setHours(hour, 0, 0, 0);
  if (t.getTime() <= n.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime() - n.getTime();
}

export async function scheduleMorningBrief() {
  try {
    const { fetchBrief } = await import("@/lib/aiClient");
    const brief = await fetchBrief();
    const top = (brief.data.attention || []).slice(0, 4);
    const body = top.map((t) => t.title).join(" · ") || "CRM clear — no high-impact items.";
    const title = "Socilet OS · aaj";

    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display === "granted") {
          await LocalNotifications.cancel({ notifications: [{ id: BRIEF_NOTE_ID }] });
          await LocalNotifications.schedule({
            notifications: [
              {
                id: BRIEF_NOTE_ID,
                title,
                body,
                schedule: { on: { hour: 9, minute: 0 }, repeats: true, allowWhileIdle: true },
              },
            ],
          });
        }
      }
    } catch {
      /* plugin optional */
    }

    if (typeof Notification !== "undefined") {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") {
        if (webBriefTimer) window.clearTimeout(webBriefTimer);
        webBriefTimer = window.setTimeout(() => {
          new Notification(title, { body });
          void scheduleMorningBrief();
        }, Math.min(msUntilHour(9), 2147483647));
      }
    }
  } catch {
    /* brief optional until logged in / AI ready */
  }
}

export async function markNotificationRead(row: RecordRow) {
  await updateRecord(row.id, { ...row.data, read: true });
}

export async function markAllNotificationsRead(rows: RecordRow[]) {
  for (const row of rows) {
    if (row.data.read === true) continue;
    await updateRecord(row.id, { ...row.data, read: true });
  }
}

async function showNativeTray(items: AlertItem[]) {
  if (!items.length) return;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const a of items.slice(0, 4)) {
        new Notification(a.title, { body: a.message });
      }
    }
  } catch {
    /* web notifications optional */
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: items.slice(0, 6).map((a, i) => ({
        id: (Date.now() % 100000) + i,
        title: a.title,
        body: a.message,
      })),
    });
  } catch {
    /* web or plugin missing */
  }
}

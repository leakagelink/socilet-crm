import { listRecords, type RecordRow } from "@/lib/db";
import { waLink } from "@/lib/pipeline";

function str(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function day(v: unknown) {
  const s = str(v).slice(0, 10);
  return s || "";
}

export type FollowItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
  phone: string;
  email: string;
  wa: string;
  tone: "due" | "overdue" | "info";
};

export async function loadFollowUps(): Promise<FollowItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [projects, invoices, tasks, reminders, recurring, clients] = await Promise.all([
    listRecords("projects"),
    listRecords("invoices"),
    listRecords("tasks"),
    listRecords("reminders"),
    listRecords("recurring_earnings"),
    listRecords("clients"),
  ]);

  function clientOf(row: RecordRow) {
    const id = str(row.data.client_id);
    return clients.find((c) => c.id === id || str(c.data.name) === str(row.data.client));
  }
  function phoneOf(row: RecordRow) {
    const client = clientOf(row);
    return str(row.data.client_phone) || str(row.data.phone) || str(client?.data.phone);
  }
  function emailOf(row: RecordRow) {
    const client = clientOf(row);
    return str(row.data.client_email) || str(row.data.email) || str(client?.data.email);
  }

  const items: FollowItem[] = [];

  for (const row of projects) {
    const remain = num(row.data.remaining_amount);
    const status = str(row.data.status);
    if (remain <= 0 || status === "done" || status === "completed") continue;
    const phone = phoneOf(row);
    const name = str(row.data.name) || "Project";
    const text = `Namaste, ${str(row.data.client) || "there"}. Pending on ${name} is ₹${Math.round(remain)}. Please share payment update.`;
    items.push({
      id: `project:${row.id}`,
      kind: "Pending project",
      title: name,
      detail: `${str(row.data.client)} · remaining ₹${Math.round(remain)}`,
      href: "/projects",
      phone,
      email: emailOf(row),
      wa: waLink(phone, text),
      tone: "overdue",
    });
  }

  for (const row of invoices) {
    const status = str(row.data.status);
    if (status === "paid" || status === "void" || status === "draft") continue;
    const due = day(row.data.due_date);
    const overdue = due && due < today;
    const phone = phoneOf(row);
    const no = str(row.data.invoice_no) || "Invoice";
    const text = `Namaste, invoice ${no} of ₹${Math.round(num(row.data.amount))} is ${overdue ? "overdue" : "due"}. Please pay when you can.`;
    items.push({
      id: `invoice:${row.id}`,
      kind: overdue ? "Overdue invoice" : "Invoice due",
      title: no,
      detail: `${str(row.data.client)} · ${due || "no due date"}`,
      href: "/invoices",
      phone,
      email: emailOf(row),
      wa: waLink(phone, text),
      tone: overdue ? "overdue" : "due",
    });
  }

  for (const row of tasks) {
    const status = str(row.data.status);
    const due = day(row.data.due_date);
    if (status === "done" || !due || due > today) continue;
    items.push({
      id: `task:${row.id}`,
      kind: due < today ? "Task overdue" : "Task today",
      title: str(row.data.title) || "Task",
      detail: `${status || "open"} · ${due}`,
      href: "/tasks",
      phone: "",
      email: "",
      wa: "",
      tone: due < today ? "overdue" : "due",
    });
  }

  for (const row of reminders) {
    const status = str(row.data.status);
    const due = day(row.data.due_at);
    if (status === "done" || status === "skipped" || !due || due > today) continue;
    const phone = str(row.data.phone) || phoneOf(row);
    const title = str(row.data.title) || "Reminder";
    items.push({
      id: `reminder:${row.id}`,
      kind: due < today ? "Reminder overdue" : "Reminder today",
      title,
      detail: `${str(row.data.client)} · ${due}`,
      href: "/reminders",
      phone,
      email: emailOf(row),
      wa: waLink(phone, `Follow-up: ${title}`),
      tone: due < today ? "overdue" : "due",
    });
  }

  for (const row of recurring) {
    if (row.data.active === false) continue;
    const next = day(row.data.next_date);
    if (!next || next > today) continue;
    const phone = phoneOf(row);
    const name = str(row.data.name) || "Retainer";
    items.push({
      id: `recurring:${row.id}`,
      kind: "Recurring due",
      title: name,
      detail: `${str(row.data.client)} · ${next}`,
      href: "/recurring-earnings",
      phone,
      email: emailOf(row),
      wa: waLink(phone, `Namaste, ${name} billing is due (${next}).`),
      tone: next < today ? "overdue" : "due",
    });
  }

  const rank = { overdue: 0, due: 1, info: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || a.title.localeCompare(b.title));
}

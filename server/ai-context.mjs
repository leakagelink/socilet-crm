const HIDDEN = new Set(["service_credentials", "meeting_providers"]);

const DESIGNER = new Set([
  "clients",
  "projects",
  "project_addons",
  "tasks",
  "reminders",
  "notifications",
  "activity",
  "meetings",
  "project_workspaces",
  "emails",
  "contact_messages",
]);

const ACCOUNTANT = new Set([
  "clients",
  "projects",
  "project_addons",
  "quotations",
  "invoices",
  "digital_products",
  "recurring_earnings",
  "other_income",
  "cosmofeed",
  "cosmofeed_products",
  "spends",
  "investments",
  "lend_borrow",
  "balance_tracker",
  "payment_methods",
  "analytics",
  "reminders",
  "notifications",
  "activity",
  "meetings",
  "emails",
]);

const SENSITIVE_KEYS = /password|secret|api[_-]?key|token|credential|vault/i;

export function canUseModule(role, module) {
  if (HIDDEN.has(module)) return false;
  if (role === "admin") return true;
  if (role === "designer") return DESIGNER.has(module);
  if (role === "accountant") return ACCOUNTANT.has(module);
  return false;
}

export function visibleRecords(state, role) {
  const rows = Array.isArray(state.records) ? state.records : [];
  return rows.filter((r) => r && r.module && canUseModule(role, r.module));
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dayMs(v) {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : null;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function compactData(data) {
  if (!data || typeof data !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (k === "attachments" || k === "file" || k === "data_url") continue;
    if (typeof v === "string" && v.length > 800) out[k] = `${v.slice(0, 800)}…`;
    else if (Array.isArray(v) && k === "payments") {
      out.payments = v.slice(-8).map((p) => ({
        date: p?.date,
        amount: p?.amount,
        method: p?.method,
        note: p?.note ? str(p.note).slice(0, 80) : undefined,
      }));
    } else out[k] = v;
  }
  return out;
}

export function compactRow(row) {
  return {
    id: row.id,
    module: row.module,
    updated_at: row.updated_at,
    ...compactData(row.data),
  };
}

function hay(row) {
  const d = row.data || {};
  return [
    row.module,
    d.name,
    d.title,
    d.client,
    d.company,
    d.email,
    d.phone,
    d.status,
    d.notes,
    d.item,
    d.invoice_no,
    d.quote_no,
    d.assignee,
    d.project_name,
    d.message,
    d.subject,
  ]
    .map(str)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function searchCrm(records, query, limit = 18) {
  const q = str(query).toLowerCase();
  if (!q) return [];
  const parts = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const row of records) {
    const h = hay(row);
    let score = 0;
    for (const p of parts) {
      if (h.includes(p)) score += 2;
      if (str(row.data?.name).toLowerCase() === p) score += 6;
      if (str(row.id).toLowerCase() === p) score += 8;
    }
    if (score) scored.push({ score, row });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => compactRow(x.row));
}

function matchClient(row, client) {
  const d = row.data || {};
  const id = str(client.id);
  const name = str(client.data?.name || client.name).toLowerCase();
  if (id && (str(d.client_id) === id || row.id === id)) return true;
  if (name && str(d.client).toLowerCase() === name) return true;
  if (name && str(d.name).toLowerCase() === name) return true;
  return false;
}

export function findClient(records, query) {
  const q = str(query).toLowerCase();
  const clients = records.filter((r) => r.module === "clients");
  return (
    clients.find((r) => r.id === query) ||
    clients.find((r) => str(r.data?.name).toLowerCase() === q) ||
    clients.find((r) => hay(r).includes(q)) ||
    null
  );
}

export function findProject(records, query) {
  const q = str(query).toLowerCase();
  const projects = records.filter((r) => r.module === "projects");
  return (
    projects.find((r) => r.id === query) ||
    projects.find((r) => str(r.data?.name).toLowerCase() === q) ||
    projects.find((r) => hay(r).includes(q)) ||
    null
  );
}

export function clientPack(records, query) {
  const client = findClient(records, query);
  if (!client) return { error: `No client matched “${query}”.` };
  const related = records.filter((r) => r.module !== "clients" && matchClient(r, client)).map(compactRow);
  const projects = related.filter((r) => r.module === "projects");
  const invoices = related.filter((r) => r.module === "invoices");
  const quotes = related.filter((r) => r.module === "quotations");
  const openInv = invoices.filter((r) => !["paid", "void"].includes(str(r.status)));
  const running = projects.filter((r) => !["completed", "done"].includes(str(r.status)));
  const remaining = projects.reduce((s, p) => s + num(p.remaining_amount), 0);
  return {
    client: compactRow(client),
    related,
    assessment: {
      open_invoices: openInv.length,
      running_projects: running.length,
      remaining_inr: remaining,
      promised: quotes.filter((q) => q.status === "sent" || q.status === "accepted").map((q) => q.quote_no || q.item || q.id),
      waiting_on_us: running.filter((p) => ["running", "active"].includes(str(p.status))).map((p) => p.name),
    },
  };
}

export function projectPack(records, query) {
  const project = findProject(records, query);
  if (!project) return { error: `No project matched “${query}”.` };
  const d = project.data || {};
  const pid = project.id;
  const name = str(d.name).toLowerCase();
  const related = records
    .filter((r) => {
      if (r.id === pid) return false;
      const x = r.data || {};
      return str(x.project_id) === pid || (name && str(x.project_name).toLowerCase() === name);
    })
    .map(compactRow);
  const deadline = dayMs(d.deadline || d.end_date);
  const today = startOfDay();
  const overdue = deadline != null && deadline < today && !["completed", "done"].includes(str(d.status));
  const remaining = num(d.remaining_amount);
  const risks = [];
  if (overdue) risks.push("Deadline has passed while work is not marked complete.");
  if (remaining > 0 && ["completed", "done"].includes(str(d.status))) risks.push("Marked complete but payment remaining.");
  if (str(d.status) === "paused") risks.push("Project is paused.");
  if (str(d.status) === "planned" && dayMs(d.start_date) != null && dayMs(d.start_date) <= today) {
    risks.push("Start date is today or past, still planned.");
  }
  return {
    project: compactRow(project),
    related,
    health: {
      overdue,
      remaining_inr: remaining,
      received_inr: num(d.advance_amount),
      total_inr: num(d.total_amount),
      risks,
      next: overdue
        ? "Reset a realistic deadline with the client, or finish the open work today."
        : remaining > 0
          ? "Collect remaining payment or send a follow-up invoice."
          : "Keep the next milestone moving; nothing financial is blocking.",
    },
  };
}

function ageDays(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return 999;
  return Math.floor((Date.now() - t) / 86400000);
}

export function buildDailySnapshot(records, finance, memory) {
  const today = startOfDay();
  const soon = today + 3 * 86400000;
  const of = (m) => records.filter((r) => r.module === m);

  const overdueTasks = of("tasks").filter((r) => {
    const due = dayMs(r.data?.due_date);
    return r.data?.status !== "done" && due != null && due < today;
  });
  const dueTasks = of("tasks").filter((r) => {
    const due = dayMs(r.data?.due_date);
    return r.data?.status !== "done" && due != null && due >= today && due <= soon;
  });
  const highOpen = of("tasks").filter((r) => r.data?.status !== "done" && r.data?.priority === "high");

  const reminders = of("reminders").filter((r) => {
    const st = str(r.data?.status);
    if (st === "done" || st === "skipped") return false;
    const due = dayMs(r.data?.due_at);
    return due != null && due <= soon;
  });

  const invoicesDue = of("invoices").filter((r) => {
    const st = str(r.data?.status);
    if (st === "paid" || st === "void") return false;
    const due = dayMs(r.data?.due_date);
    return due != null && due <= soon;
  });

  const quotesExpiring = of("quotations").filter((r) => {
    if (str(r.data?.status) !== "sent") return false;
    const until = dayMs(r.data?.valid_until);
    return until != null && until <= soon;
  });

  const projects = of("projects").filter((r) => !["completed", "done"].includes(str(r.data?.status)));
  const stalled = projects.filter((r) => {
    const deadline = dayMs(r.data?.deadline || r.data?.end_date);
    const overdue = deadline != null && deadline < today;
    const quiet = ageDays(r.updated_at) >= 7;
    return overdue || (quiet && ["running", "active"].includes(str(r.data?.status)));
  });
  const collection = projects.filter((r) => num(r.data?.remaining_amount) > 0);

  const meetings = of("meetings").filter((r) => {
    const when = dayMs(r.data?.scheduled_at);
    return str(r.data?.status) === "scheduled" && when != null && when >= today && when <= soon;
  });

  const lend = of("lend_borrow").filter((r) => str(r.data?.status) !== "settled");

  const scored = [];
  const push = (impact, why, href, title) => scored.push({ impact, why, href, title });
  for (const r of overdueTasks) {
    push(90 + (r.data?.priority === "high" ? 8 : 0), "Overdue task", "/tasks", str(r.data?.title));
  }
  for (const r of invoicesDue) {
    const due = dayMs(r.data?.due_date);
    push(due < today ? 88 : 72, "Invoice collection", "/invoices", `${r.data?.invoice_no || "Invoice"} · ${r.data?.client || ""}`);
  }
  for (const r of stalled) {
    const remain = num(r.data?.remaining_amount);
    push(80 + Math.min(10, remain / 20000), "Project at risk", "/projects", str(r.data?.name));
  }
  for (const r of reminders) {
    const p = { urgent: 86, high: 70, medium: 55, low: 40 }[str(r.data?.priority)] || 50;
    push(p, "Reminder", "/reminders", str(r.data?.title));
  }
  for (const r of quotesExpiring) push(64, "Quote expiring", "/quotations", str(r.data?.quote_no || r.data?.client));
  for (const r of meetings) push(60, "Upcoming meeting", "/meetings", str(r.data?.title));
  scored.sort((a, b) => b.impact - a.impact);

  const ignore = [];
  for (const r of of("tasks")) {
    if (r.data?.status !== "done" && r.data?.priority === "low" && !dayMs(r.data?.due_date)) {
      ignore.push(`Low-priority task without a date: ${str(r.data?.title)}`);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    cash: finance
      ? { base_balance: num(finance.base_balance) }
      : null,
    counts: {
      open_tasks: of("tasks").filter((r) => r.data?.status !== "done").length,
      running_projects: projects.length,
      overdue_tasks: overdueTasks.length,
      invoices_due: invoicesDue.length,
      reminders_due: reminders.length,
    },
    attention: scored.slice(0, 12),
    overdue_tasks: overdueTasks.slice(0, 12).map(compactRow),
    due_soon_tasks: dueTasks.slice(0, 12).map(compactRow),
    high_open_tasks: highOpen.slice(0, 8).map(compactRow),
    reminders: reminders.slice(0, 12).map(compactRow),
    invoices_due: invoicesDue.slice(0, 12).map(compactRow),
    quotes_expiring: quotesExpiring.slice(0, 8).map(compactRow),
    stalled_projects: stalled.slice(0, 10).map(compactRow),
    collection_projects: collection
      .sort((a, b) => num(b.data?.remaining_amount) - num(a.data?.remaining_amount))
      .slice(0, 10)
      .map(compactRow),
    meetings: meetings.slice(0, 8).map(compactRow),
    lend_borrow_open: lend.slice(0, 8).map(compactRow),
    do_not_spend_time_on: ignore.slice(0, 6),
    memory: memory || { user: [], business: [], work: [] },
  };
}

export function clipJson(value, max = 14000) {
  const raw = JSON.stringify(value);
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}…[truncated]`;
}

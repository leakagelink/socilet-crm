import { randomUUID } from "node:crypto";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import {
  buildDailySnapshot,
  adsPack,
  canUseModule,
  clientPack,
  compactRow,
  findCampaign,
  findClient,
  findMeeting,
  projectPack,
  searchCrm,
  snapshotLite,
  visibleRecords,
} from "./ai-context.mjs";
import { documentBuffer, generateImageBuffer, saveGeneratedFile } from "./ai-files.mjs";
import { sendCrmEmail } from "./email-api.mjs";
import { runWebResearch } from "./ai-research.mjs";
import { companyPack } from "./ai-company.mjs";

const WRITE_OK = {
  admin: new Set([
    "tasks",
    "reminders",
    "clients",
    "projects",
    "notifications",
    "activity",
    "meetings",
    "quotations",
    "invoices",
    "emails",
    "ad_campaigns",
    "ad_leads",
    "ad_accounts",
    "spends",
  ]),
  designer: new Set(["tasks", "reminders", "clients", "projects", "notifications", "activity", "meetings"]),
  accountant: new Set(["reminders", "clients", "quotations", "invoices", "notifications", "activity", "ad_campaigns", "ad_leads", "spends"]),
};

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "daily_brief",
      description: "Deterministic executive snapshot: overdue work, money at risk, meetings, what to ignore.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "crm_search",
      description: "Search CRM records by name, client, title, status, or notes.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "number" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "client_intelligence",
      description: "Full client pack: projects, invoices, quotes, remaining, risks.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "project_health",
      description: "Project health: deadline, payments, related docs, recommended next action.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_record",
      description: "Fetch one CRM record by id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task. status todo|in_progress|review|done, priority low|medium|high.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_date: { type: "string" },
          priority: { type: "string" },
          assignee: { type: "string" },
          status: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update a task by id. Pass only fields to change.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { type: "string" },
          priority: { type: "string" },
          due_date: { type: "string" },
          assignee: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task done.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a reminder/follow-up.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_at: { type: "string" },
          priority: { type: "string" },
          client: { type: "string" },
          notes: { type: "string" },
        },
        required: ["title", "due_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_client_note",
      description: "Append a dated note to a client record.",
      parameters: {
        type: "object",
        properties: { client: { type: "string" }, note: { type: "string" } },
        required: ["client", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description: "Update project status, dates, or notes. Financial amount changes require confirmation.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          deadline: { type: "string" },
          notes: { type: "string" },
          total_amount: { type: "number" },
          advance_amount: { type: "number" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Store durable memory. kind=user|business|work. Do not store transactional facts that already live in CRM records.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string" }, text: { type: "string" } },
        required: ["kind", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_document",
      description:
        "Create a downloadable file the user can save: pdf, docx, html, md, csv, txt, json, svg. Put the FULL finished content in body. Use for proposals, reports, letters, invoices drafts, lists. Hindi/Devanagari is supported in PDF (embedded font) as well as docx/html.",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", description: "pdf|docx|html|md|csv|txt|json|svg" },
          title: { type: "string" },
          body: { type: "string", description: "Full document text. For csv, include header row." },
        },
        required: ["format", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Create an image/poster/logo. Uses the image model when available, otherwise a branded SVG. Write a detailed visual prompt.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          prompt: { type: "string" },
          kind: { type: "string", description: "poster|logo|illustration|photo" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description:
        "Draft a client email. Does not send until the user confirms in the UI. Use CRM email if to is omitted.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string" },
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_invoice",
      description: "Draft a CRM invoice. Never invent amount. User must confirm before it is saved.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string" },
          amount: { type: "number" },
          gst_amount: { type: "number" },
          item: { type: "string" },
          due_date: { type: "string" },
          notes: { type: "string" },
        },
        required: ["client", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_quotation",
      description: "Draft a CRM quotation. Never invent amount. User must confirm before it is saved.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string" },
          amount: { type: "number" },
          gst_amount: { type: "number" },
          item: { type: "string" },
          valid_until: { type: "string" },
          notes: { type: "string" },
        },
        required: ["client", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_meeting",
      description:
        "Save meeting notes. Optionally mark ended, create a CRM task, and a reminder. Finds meeting by title or creates one.",
      parameters: {
        type: "object",
        properties: {
          meeting: { type: "string" },
          notes: { type: "string" },
          next_action: { type: "string" },
          due_date: { type: "string" },
          client: { type: "string" },
        },
        required: ["notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "followup_script",
      description: "Build a follow-up call script from the client pack (cash, delivery, ask, close).",
      parameters: {
        type: "object",
        properties: { client: { type: "string" } },
        required: ["client"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_research",
      description:
        "Live web research with sources. Use for market, competitor, news, GST/legal, tech, pricing outside CRM. depth=advanced fetches page text. Never use this for CRM balances — those come from client_intelligence.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          focus: { type: "string", description: "market|competitor|legal|news|tech|pricing|general" },
          depth: { type: "string", description: "quick|advanced" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "company_pack",
      description:
        "Reload Socilet brand facts and live extracts from socilet.com / socilet.in. Use when the user asks about the company site, public offering, or says the brand pack is stale.",
      parameters: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ads_performance",
      description: "Ads ROAS snapshot: accounts, campaigns ranked, winning/losing, open leads. Use before recommending more spend.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "log_ad_spend",
      description: "Add spend (INR) to a campaign and a Spends row (category ad spend). Do not invent spend.",
      parameters: {
        type: "object",
        properties: {
          campaign: { type: "string" },
          amount: { type: "number" },
          date: { type: "string" },
        },
        required: ["campaign", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capture_ad_lead",
      description: "Save a lead from ads. status new|contacted.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          campaign: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_ad_lead",
      description: "Turn an ads lead into a CRM client (match email/phone/name or create).",
      parameters: {
        type: "object",
        properties: { lead: { type: "string" } },
        required: ["lead"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "winning_ad_quote",
      description: "Draft a quotation from the best ROAS campaign (or named campaign) for a client/lead. Confirm before save. Never invent amount.",
      parameters: {
        type: "object",
        properties: {
          campaign: { type: "string" },
          client: { type: "string" },
          amount: { type: "number" },
        },
      },
    },
  },
];

export function selectTools(names) {
  const want = new Set(names);
  return TOOLS.filter((t) => want.has(t.function.name));
}

function writes(role, module) {
  return WRITE_OK[role]?.has(module) || false;
}

function audit(state, entry) {
  if (!state.settings.ai) state.settings.ai = emptyAi();
  const log = Array.isArray(state.settings.ai.audit) ? state.settings.ai.audit : [];
  log.push({ ...entry, at: new Date().toISOString() });
  state.settings.ai.audit = log.slice(-250);
}

export function emptyAi() {
  return {
    memory: { user: [], business: [], work: [] },
    conversations: {},
    sessions: {},
    pending: {},
    audit: [],
  };
}

export function ensureAi(state) {
  if (!state.settings) state.settings = {};
  if (!state.settings.ai || typeof state.settings.ai !== "object") state.settings.ai = emptyAi();
  const ai = state.settings.ai;
  if (!ai.memory) ai.memory = { user: [], business: [], work: [] };
  for (const k of ["user", "business", "work"]) {
    if (!Array.isArray(ai.memory[k])) ai.memory[k] = [];
  }
  if (!ai.conversations || typeof ai.conversations !== "object") ai.conversations = {};
  if (!ai.sessions || typeof ai.sessions !== "object") ai.sessions = {};
  if (!ai.pending || typeof ai.pending !== "object") ai.pending = {};
  if (!Array.isArray(ai.audit)) ai.audit = [];
  return ai;
}

function putRecord(state, row) {
  state.records = state.records.filter((r) => r.id !== row.id);
  state.records.push(row);
}

function activity(state, user, text) {
  const now = new Date().toISOString();
  putRecord(state, {
    id: randomUUID(),
    module: "activity",
    data: { actor: user.email, action: "ai", detail: text },
    created_at: now,
    updated_at: now,
  });
}

function queueConfirm(state, user, tool, preview, apply) {
  const ai = ensureAi(state);
  const token = randomUUID();
  ai.pending[token] = {
    userId: user.id,
    tool,
    preview,
    apply,
    at: Date.now(),
  };
  saveCrmState(state);
  return { needs_confirmation: true, token, preview, warning: "Confirm in the UI before this change is written." };
}

export async function executeTool(name, rawArgs, user, env = process.env) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const state = loadCrmState();
  const ai = ensureAi(state);
  const records = visibleRecords(state, user.role);
  const now = new Date().toISOString();

  const fail = (msg) => ({ ok: false, error: msg });

  if (name === "daily_brief") {
    return { ok: true, data: snapshotLite(buildDailySnapshot(records, state.settings.finance, ai.memory)) };
  }
  if (name === "crm_search") {
    return { ok: true, data: searchCrm(records, args.query, Math.min(12, Number(args.limit) || 8)) };
  }
  if (name === "client_intelligence") {
    return { ok: true, data: clientPack(records, args.query) };
  }
  if (name === "project_health") {
    return { ok: true, data: projectPack(records, args.query) };
  }
  if (name === "get_record") {
    const row = records.find((r) => r.id === args.id);
    if (!row) return fail("Record not found or not permitted.");
    return { ok: true, data: compactRow(row) };
  }
  if (name === "remember") {
    const kind = ["user", "business", "work"].includes(args.kind) ? args.kind : "work";
    const text = String(args.text || "").trim().slice(0, 500);
    if (!text) return fail("Memory text required.");
    ai.memory[kind].push({ id: randomUUID(), text, at: now, by: user.email });
    ai.memory[kind] = ai.memory[kind].slice(-40);
    audit(state, { user: user.email, tool: name, entity: kind, result: "ok", instruction: text });
    saveCrmState(state);
    return { ok: true, data: { stored: true, kind } };
  }

  if (name === "create_task") {
    if (!writes(user.role, "tasks")) return fail("Not allowed to create tasks.");
    const row = {
      id: randomUUID(),
      module: "tasks",
      data: {
        title: String(args.title || "").trim(),
        status: args.status || "todo",
        priority: args.priority || "medium",
        assignee: args.assignee || user.email,
        due_date: args.due_date || "",
      },
      created_at: now,
      updated_at: now,
    };
    if (!row.data.title) return fail("Task title required.");
    putRecord(state, row);
    activity(state, user, `AI created task ${row.data.title}`);
    audit(state, { user: user.email, tool: name, entity: row.id, result: "ok", instruction: row.data.title });
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (name === "update_task" || name === "complete_task") {
    if (!writes(user.role, "tasks")) return fail("Not allowed to update tasks.");
    const row = state.records.find((r) => r.id === args.id && r.module === "tasks");
    if (!row || !canUseModule(user.role, "tasks")) return fail("Task not found.");
    if (name === "complete_task") row.data.status = "done";
    else {
      for (const k of ["title", "status", "priority", "due_date", "assignee"]) {
        if (args[k] != null && args[k] !== "") row.data[k] = args[k];
      }
    }
    row.updated_at = now;
    activity(state, user, `AI updated task ${row.data.title}`);
    audit(state, { user: user.email, tool: name, entity: row.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (name === "create_reminder") {
    if (!writes(user.role, "reminders")) return fail("Not allowed to create reminders.");
    const row = {
      id: randomUUID(),
      module: "reminders",
      data: {
        title: String(args.title || "").trim(),
        due_at: args.due_at,
        priority: args.priority || "medium",
        status: "pending",
        client: args.client || "",
        notes: args.notes || "",
      },
      created_at: now,
      updated_at: now,
    };
    if (!row.data.title || !row.data.due_at) return fail("title and due_at required.");
    putRecord(state, row);
    activity(state, user, `AI created reminder ${row.data.title}`);
    audit(state, { user: user.email, tool: name, entity: row.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (name === "add_client_note") {
    if (!writes(user.role, "clients")) return fail("Not allowed to update clients.");
    const client = findClient(records, args.client);
    if (!client) return fail("Client not found.");
    const live = state.records.find((r) => r.id === client.id);
    const prev = String(live.data.notes || "").trim();
    const line = `[${now.slice(0, 10)} AI] ${String(args.note || "").trim()}`;
    live.data.notes = prev ? `${prev}\n${line}` : line;
    live.updated_at = now;
    activity(state, user, `AI noted ${live.data.name}`);
    audit(state, { user: user.email, tool: name, entity: live.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: compactRow(live) };
  }

  if (name === "update_project") {
    if (!writes(user.role, "projects")) return fail("Not allowed to update projects.");
    const row = state.records.find((r) => r.id === args.id && r.module === "projects");
    if (!row || !canUseModule(user.role, "projects")) return fail("Project not found.");
    const money = args.total_amount != null || args.advance_amount != null;
    const apply = {
      status: args.status,
      deadline: args.deadline,
      notes: args.notes,
      total_amount: args.total_amount,
      advance_amount: args.advance_amount,
    };
    if (money) {
      return queueConfirm(state, user, "update_project", { id: row.id, name: row.data.name, apply }, apply);
    }
    if (apply.status) row.data.status = apply.status;
    if (apply.deadline) row.data.deadline = apply.deadline;
    if (apply.notes) row.data.notes = apply.notes;
    row.updated_at = now;
    activity(state, user, `AI updated project ${row.data.name}`);
    audit(state, { user: user.email, tool: name, entity: row.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (name === "generate_document") {
    const format = String(args.format || "pdf").toLowerCase().replace(/^\./, "");
    const title = String(args.title || "Socilet document").trim().slice(0, 120);
    const body = String(args.body || "").trim();
    if (!body) return fail("Document body required.");
    const built = await documentBuffer(format, title, body);
    const file = saveGeneratedFile(user.id, { name: title, ...built });
    audit(state, { user: user.email, tool: name, entity: file.id, result: "ok", instruction: title });
    saveCrmState(state);
    return { ok: true, file, data: { created: true, ...file } };
  }

  if (name === "draft_email") {
    if (!writes(user.role, "emails")) return fail("Not allowed to send email.");
    const client = args.client ? findClient(records, args.client) : null;
    const to = String(args.to || client?.data?.email || "").trim();
    const subject = String(args.subject || "").trim();
    const body = String(args.body || "").trim();
    if (!to.includes("@")) return fail("Need a To address. Client has no email in CRM.");
    if (!subject || !body) return fail("subject and body required.");
    return queueConfirm(
      state,
      user,
      "send_email",
      { to, subject, body, client: client?.data?.name || args.client || "" },
      { to, subject, text: body, client_name: client?.data?.name || "" },
    );
  }

  if (name === "draft_invoice" || name === "draft_quotation") {
    const module = name === "draft_invoice" ? "invoices" : "quotations";
    if (!writes(user.role, module)) return fail(`Not allowed to create ${module}.`);
    const client = findClient(records, args.client);
    if (!client) return fail("Client not found. Name the CRM client exactly.");
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount required from CRM or the user. Do not invent it.");
    const gst = Number(args.gst_amount);
    const gst_amount = Number.isFinite(gst) && gst >= 0 ? gst : 0;
    const item = String(args.item || "").trim();
    const notes = String(args.notes || "").trim();
    const prefix = module === "invoices" ? "INV" : "QTE";
    const noField = module === "invoices" ? "invoice_no" : "quote_no";
    const dateField = module === "invoices" ? "due_date" : "valid_until";
    const givenDate = String(args.due_date || args.valid_until || "").trim();
    const fallbackDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const apply = {
      module,
      client: String(client.data.name || ""),
      client_id: client.id,
      client_email: String(client.data.email || ""),
      client_phone: String(client.data.phone || ""),
      client_gstin: String(client.data.gstin || ""),
      client_address: String(client.data.address || ""),
      item,
      amount,
      gst_amount,
      status: "draft",
      [noField]: `${prefix}-${Date.now().toString(36).toUpperCase()}`,
      [dateField]: givenDate || fallbackDate,
      notes,
      share_token: randomUUID(),
    };
    return queueConfirm(state, user, `create_${module === "invoices" ? "invoice" : "quotation"}`, apply, apply);
  }

  if (name === "log_meeting") {
    if (!writes(user.role, "meetings")) return fail("Not allowed to log meetings.");
    const notes = String(args.notes || "").trim();
    if (!notes) return fail("Meeting notes required.");
    let live = null;
    if (args.meeting) {
      const found = findMeeting(records, args.meeting);
      if (found) live = state.records.find((r) => r.id === found.id);
    }
    if (!live) {
      live = {
        id: randomUUID(),
        module: "meetings",
        data: {
          title: String(args.meeting || args.client || "Meeting").trim().slice(0, 120) || "Meeting",
          kind: "meeting",
          direction: "outgoing",
          client: String(args.client || "").trim(),
          status: "ended",
          description: "",
          created_by: user.email,
          active: true,
        },
        created_at: now,
        updated_at: now,
      };
      putRecord(state, live);
    }
    const prev = String(live.data.description || "").trim();
    const line = `[${now.slice(0, 16).replace("T", " ")} AI] ${notes}`;
    live.data.description = prev ? `${prev}\n${line}` : line;
    live.data.status = "ended";
    if (args.client && !live.data.client) live.data.client = String(args.client).trim();
    live.updated_at = now;
    const extra = [];
    const next = String(args.next_action || "").trim();
    if (next && writes(user.role, "tasks")) {
      const task = {
        id: randomUUID(),
        module: "tasks",
        data: {
          title: next.slice(0, 160),
          status: "todo",
          priority: "high",
          assignee: user.email,
          due_date: String(args.due_date || "").trim(),
        },
        created_at: now,
        updated_at: now,
      };
      putRecord(state, task);
      extra.push(compactRow(task));
      if (writes(user.role, "reminders") && task.data.due_date) {
        const rem = {
          id: randomUUID(),
          module: "reminders",
          data: {
            title: next.slice(0, 160),
            due_at: task.data.due_date,
            priority: "high",
            status: "pending",
            client: live.data.client || "",
            notes: notes.slice(0, 400),
          },
          created_at: now,
          updated_at: now,
        };
        putRecord(state, rem);
        extra.push(compactRow(rem));
      }
    }
    activity(state, user, `AI logged meeting ${live.data.title}`);
    audit(state, { user: user.email, tool: name, entity: live.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: { meeting: compactRow(live), created: extra } };
  }

  if (name === "followup_script") {
    const pack = clientPack(records, args.client);
    if (pack.error) return fail(pack.error);
    const c = pack.client;
    const who = String(c.name || c.label || "there");
    const remain = Number(pack.assessment.remaining_inr) || 0;
    const opens = pack.assessment.open_invoices;
    const waiting = pack.assessment.waiting_on_us || [];
    return {
      ok: true,
      data: {
        client: c,
        assessment: pack.assessment,
        script: {
          opener: `Hi ${who}, this is a quick check-in on the work we're doing together.`,
          cash:
            remain > 0
              ? `Pending on our books: about ₹${Math.round(remain)}. ${opens} open invoice(s). Confirm a payment date before we close.`
              : "Books look clear on remaining project amount. Confirm if anything else is outstanding on their side.",
          delivery: waiting.length
            ? `We still owe: ${waiting.join(", ")}. Give an honest date — do not over-promise.`
            : "No running delivery flagged — ask if they need anything else.",
          ask:
            remain > 0
              ? `Ask: "Can we lock a transfer this week, or is there a blocker I should unblock?"`
              : `Ask: "Is there a next milestone you want scoped this month?"`,
          close: "End with one-sentence recap + who does what by when. Log the call in Meetings after.",
        },
      },
    };
  }

  if (name === "web_research") {
    const result = await runWebResearch(env, {
      query: args.query,
      depth: args.depth,
      focus: args.focus,
    });
    return result.ok ? { ok: true, data: result } : fail(result.error || "Research failed.");
  }

  if (name === "company_pack") {
    const pack = await companyPack(Boolean(args.refresh));
    return { ok: true, data: pack };
  }

  if (name === "ads_performance") {
    return { ok: true, data: adsPack(records) };
  }

  if (name === "log_ad_spend") {
    if (!writes(user.role, "ad_campaigns")) return fail("Not allowed to log ad spend.");
    const campaign = findCampaign(records, args.campaign);
    if (!campaign) return fail("Campaign not found. Create it under Ads → Campaigns first.");
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Spend amount required. Do not invent it.");
    const live = state.records.find((r) => r.id === campaign.id);
    live.data.spend = Number(live.data.spend || 0) + amount;
    live.updated_at = now;
    let spendRow = null;
    if (writes(user.role, "spends")) {
      spendRow = {
        id: randomUUID(),
        module: "spends",
        data: {
          title: `Ads · ${live.data.name}`,
          category: "ad spend",
          ad_for: String(live.data.name || ""),
          campaign_name: String(live.data.name || ""),
          amount,
          date: String(args.date || now.slice(0, 10)),
          payment_method: "Other",
          notes: live.id,
        },
        created_at: now,
        updated_at: now,
      };
      putRecord(state, spendRow);
    }
    activity(state, user, `AI logged ad spend ${amount} on ${live.data.name}`);
    audit(state, { user: user.email, tool: name, entity: live.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: { campaign: compactRow(live), spend: spendRow ? compactRow(spendRow) : null } };
  }

  if (name === "capture_ad_lead") {
    if (!writes(user.role, "ad_leads")) return fail("Not allowed to capture ads leads.");
    const leadName = String(args.name || "").trim();
    if (!leadName) return fail("Lead name required.");
    const campaign = args.campaign ? findCampaign(records, args.campaign) : null;
    const row = {
      id: randomUUID(),
      module: "ad_leads",
      data: {
        name: leadName,
        phone: String(args.phone || "").trim(),
        email: String(args.email || "").trim(),
        campaign: campaign?.data?.name || String(args.campaign || ""),
        campaign_id: campaign?.id || "",
        source_account: campaign?.data?.account || "",
        status: "new",
        notes: String(args.notes || "").trim(),
      },
      created_at: now,
      updated_at: now,
    };
    putRecord(state, row);
    if (campaign) {
      const live = state.records.find((r) => r.id === campaign.id);
      if (live) live.data.leads_count = Number(live.data.leads_count || 0) + 1;
    }
    activity(state, user, `AI captured ads lead ${leadName}`);
    audit(state, { user: user.email, tool: name, entity: row.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (name === "convert_ad_lead") {
    if (!writes(user.role, "ad_leads") || !writes(user.role, "clients")) return fail("Not allowed to convert ads leads.");
    const q = String(args.lead || "").toLowerCase();
    const lead =
      state.records.find((r) => r.module === "ad_leads" && r.id === args.lead) ||
      state.records.find((r) => r.module === "ad_leads" && String(r.data?.name || "").toLowerCase() === q) ||
      null;
    if (!lead) return fail("Lead not found.");
    let client = findClient(records, lead.data.email || lead.data.phone || lead.data.name || lead.data.client);
    if (!client) {
      const created = {
        id: randomUUID(),
        module: "clients",
        data: {
          name: String(lead.data.name || "Ads lead").trim(),
          email: String(lead.data.email || ""),
          phone: String(lead.data.phone || ""),
          notes: `From ads · ${lead.data.campaign || ""}`,
        },
        created_at: now,
        updated_at: now,
      };
      putRecord(state, created);
      client = created;
    }
    lead.data.status = "converted";
    lead.data.client = client.data.name;
    lead.data.client_id = client.id;
    lead.updated_at = now;
    activity(state, user, `AI converted ads lead ${lead.data.name} → ${client.data.name}`);
    audit(state, { user: user.email, tool: name, entity: lead.id, result: "ok" });
    saveCrmState(state);
    return { ok: true, data: { lead: compactRow(lead), client: compactRow(client) } };
  }

  if (name === "winning_ad_quote") {
    if (!writes(user.role, "quotations")) return fail("Not allowed to draft quotes.");
    const pack = adsPack(records);
    const campaign = args.campaign ? findCampaign(records, args.campaign) : null;
    const win = campaign || (pack.winning && state.records.find((r) => r.id === pack.winning.id));
    if (!win) return fail("No campaign with spend yet. Log spend first.");
    let client = args.client ? findClient(records, args.client) : null;
    if (!client) {
      const lead = records.find(
        (r) =>
          r.module === "ad_leads" &&
          (r.data?.campaign_id === win.id || String(r.data?.campaign || "") === String(win.data.name || "")) &&
          (r.data?.client_id || r.data?.status === "converted" || r.data?.status === "new"),
      );
      if (lead?.data?.client_id) client = state.records.find((r) => r.id === lead.data.client_id);
      else if (lead) client = findClient(records, lead.data.email || lead.data.name);
    }
    if (!client) return fail("Name the client or convert an ads lead first.");
    const amount = Number(args.amount);
    const fallback = Number(win.data.offer_amount);
    const useAmt = Number.isFinite(amount) && amount > 0 ? amount : Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
    if (!useAmt) return fail("Amount required from offer_amount or the user. Do not invent it.");
    const apply = {
      module: "quotations",
      client: String(client.data.name || ""),
      client_id: client.id,
      client_email: String(client.data.email || ""),
      client_phone: String(client.data.phone || ""),
      item: String(win.data.offer || win.data.name || ""),
      amount: useAmt,
      gst_amount: 0,
      status: "draft",
      quote_no: `QTE-${Date.now().toString(36).toUpperCase()}`,
      campaign_id: win.id,
      campaign_name: String(win.data.name || ""),
      notes: `From ads campaign ${win.data.name}`,
      share_token: randomUUID(),
    };
    return queueConfirm(state, user, "create_quotation", apply, apply);
  }

  if (name === "generate_image") {
    const title = String(args.title || args.kind || "Image").trim().slice(0, 80);
    const prompt = String(args.prompt || title).trim();
    if (!prompt) return fail("Image prompt required.");
    const built = await generateImageBuffer(env, { title, prompt, kind: String(args.kind || "poster") });
    const file = saveGeneratedFile(user.id, { name: title, ...built });
    audit(state, { user: user.email, tool: name, entity: file.id, result: "ok", instruction: title });
    saveCrmState(state);
    return { ok: true, file, data: { created: true, source: built.source, ...file } };
  }

  return fail(`Unknown tool ${name}`);
}

export async function confirmPending(token, user, env = process.env) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const pending = ai.pending?.[token];
  if (!pending || pending.userId !== user.id) return { ok: false, error: "Confirmation expired or invalid." };
  if (Date.now() - pending.at > 10 * 60 * 1000) {
    delete ai.pending[token];
    saveCrmState(state);
    return { ok: false, error: "Confirmation expired." };
  }
  const apply = pending.apply || {};
  const stamp = new Date().toISOString();

  if (pending.tool === "send_email") {
    try {
      const sent = await sendCrmEmail(env, apply);
      const row = {
        id: randomUUID(),
        module: "emails",
        data: {
          to_addr: apply.to,
          subject: apply.subject,
          body: apply.text,
          status: "sent",
          sent_at: stamp,
        },
        created_at: stamp,
        updated_at: stamp,
      };
      putRecord(state, row);
      activity(state, user, `AI sent email to ${apply.to}`);
      audit(state, { user: user.email, tool: "send_email", entity: row.id, result: "confirmed" });
      delete ai.pending[token];
      saveCrmState(state);
      return { ok: true, data: { sent: true, provider: sent, record: compactRow(row) } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
    }
  }

  if (pending.tool === "create_invoice" || pending.tool === "create_quotation") {
    const module = pending.tool === "create_invoice" ? "invoices" : "quotations";
    const row = {
      id: randomUUID(),
      module,
      data: { ...apply },
      created_at: stamp,
      updated_at: stamp,
    };
    delete row.data.module;
    putRecord(state, row);
    activity(state, user, `AI created ${module === "invoices" ? "invoice" : "quotation"} for ${apply.client}`);
    audit(state, { user: user.email, tool: pending.tool, entity: row.id, result: "confirmed" });
    delete ai.pending[token];
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }

  if (pending.tool === "update_project") {
    const row = state.records.find((r) => r.id === pending.preview?.id && r.module === "projects");
    if (!row) return { ok: false, error: "Project gone." };
    if (apply.status) row.data.status = apply.status;
    if (apply.deadline) row.data.deadline = apply.deadline;
    if (apply.notes) row.data.notes = apply.notes;
    if (apply.total_amount != null) row.data.total_amount = Number(apply.total_amount);
    if (apply.advance_amount != null) {
      row.data.advance_amount = Number(apply.advance_amount);
      row.data.remaining_amount = Number(row.data.total_amount || 0) - Number(row.data.advance_amount || 0);
    }
    row.updated_at = new Date().toISOString();
    activity(state, user, `AI confirmed money change on ${row.data.name}`);
    audit(state, { user: user.email, tool: "update_project", entity: row.id, result: "confirmed" });
    delete ai.pending[token];
    saveCrmState(state);
    return { ok: true, data: compactRow(row) };
  }
  return { ok: false, error: "Nothing to apply." };
}

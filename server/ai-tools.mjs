import { randomUUID } from "node:crypto";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import {
  buildDailySnapshot,
  canUseModule,
  clientPack,
  compactRow,
  findClient,
  projectPack,
  searchCrm,
  visibleRecords,
} from "./ai-context.mjs";
import { documentBuffer, generateImageBuffer, saveGeneratedFile } from "./ai-files.mjs";

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
  ]),
  designer: new Set(["tasks", "reminders", "clients", "projects", "notifications", "activity", "meetings"]),
  accountant: new Set(["reminders", "clients", "quotations", "invoices", "notifications", "activity"]),
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
        "Create a downloadable file the user can save: pdf, docx, html, md, csv, txt, json, svg. Put the FULL finished content in body. Use for proposals, reports, letters, invoices drafts, lists. Hindi/Unicode: prefer docx or html. PDF uses Latin/Helvetica.",
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
];

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
    return { ok: true, data: buildDailySnapshot(records, state.settings.finance, ai.memory) };
  }
  if (name === "crm_search") {
    return { ok: true, data: searchCrm(records, args.query, Math.min(30, Number(args.limit) || 18)) };
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
    const built = documentBuffer(format, title, body);
    const file = saveGeneratedFile(user.id, { name: title, ...built });
    audit(state, { user: user.email, tool: name, entity: file.id, result: "ok", instruction: title });
    saveCrmState(state);
    return { ok: true, file, data: { created: true, ...file } };
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

export function confirmPending(token, user) {
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

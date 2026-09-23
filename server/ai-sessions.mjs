import { randomUUID } from "node:crypto";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import { ensureAi } from "./ai-tools.mjs";

const MAX_SESSIONS = 40;
const MAX_TURNS = 80;

function titleFrom(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "New session";
  return t.slice(0, 48);
}

function nowIso() {
  return new Date().toISOString();
}

export function userSessionList(ai, userId) {
  if (!ai.sessions || typeof ai.sessions !== "object") ai.sessions = {};
  if (!Array.isArray(ai.sessions[userId])) ai.sessions[userId] = [];
  const legacy = ai.conversations?.[userId];
  if (Array.isArray(legacy) && legacy.length && !ai.sessions[userId].length) {
    const first = legacy.find((m) => m.role === "user");
    ai.sessions[userId].push({
      id: randomUUID(),
      title: titleFrom(first?.content),
      created_at: first?.at || nowIso(),
      updated_at: nowIso(),
      messages: legacy.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
        at: m.at || nowIso(),
      })),
    });
    delete ai.conversations[userId];
  }
  return ai.sessions[userId];
}

export function sessionSummary(s) {
  const firstUser = (s.messages || []).find((m) => m.role === "user");
  return {
    id: s.id,
    title: s.title || titleFrom(firstUser?.content),
    updated_at: s.updated_at || s.created_at,
    created_at: s.created_at,
    preview: String(firstUser?.content || "").slice(0, 90),
    turns: Array.isArray(s.messages) ? s.messages.length : 0,
  };
}

export function listSessions(userId) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const list = userSessionList(ai, userId)
    .map(sessionSummary)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return list;
}

export function createSession(userId) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const list = userSessionList(ai, userId);
  const row = {
    id: randomUUID(),
    title: "New session",
    created_at: nowIso(),
    updated_at: nowIso(),
    messages: [],
  };
  list.unshift(row);
  ai.sessions[userId] = list.slice(0, MAX_SESSIONS);
  saveCrmState(state);
  return sessionSummary(row);
}

export function getSession(userId, id) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const row = userSessionList(ai, userId).find((s) => s.id === id);
  if (!row) return null;
  return {
    ...sessionSummary(row),
    messages: (row.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      at: m.at,
    })),
  };
}

export function renameSession(userId, id, title) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const row = userSessionList(ai, userId).find((s) => s.id === id);
  if (!row) return null;
  row.title = titleFrom(title);
  row.updated_at = nowIso();
  saveCrmState(state);
  return sessionSummary(row);
}

export function deleteSession(userId, id) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const list = userSessionList(ai, userId);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  ai.sessions[userId] = next;
  saveCrmState(state);
  return true;
}

export function appendTurn(userId, sessionId, userText, reply) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const list = userSessionList(ai, userId);
  let row = list.find((s) => s.id === sessionId);
  if (!row) {
    row = {
      id: sessionId || randomUUID(),
      title: titleFrom(userText),
      created_at: nowIso(),
      updated_at: nowIso(),
      messages: [],
    };
    list.unshift(row);
  }
  const at = nowIso();
  row.messages = Array.isArray(row.messages) ? row.messages : [];
  row.messages.push({ role: "user", content: String(userText).slice(0, 4000), at });
  row.messages.push({ role: "assistant", content: String(reply).slice(0, 8000), at });
  row.messages = row.messages.slice(-MAX_TURNS);
  if (!row.title || row.title === "New session") row.title = titleFrom(userText);
  row.updated_at = at;
  ai.sessions[userId] = list.slice(0, MAX_SESSIONS);
  saveCrmState(state);
  return row.id;
}

export function sessionHistory(userId, sessionId) {
  const state = loadCrmState();
  const ai = ensureAi(state);
  const row = userSessionList(ai, userId).find((s) => s.id === sessionId);
  return Array.isArray(row?.messages) ? row.messages : [];
}

export { titleFrom };

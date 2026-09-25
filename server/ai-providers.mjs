import { randomUUID } from "node:crypto";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";

export const RELAY = {
  name: "Relay Models",
  base_url: "https://api.relaymodels.com/v1",
  model: "gpt-5.6-luna",
  reason_model: "gpt-5.6-sol",
};

const COOLDOWN_MS = {
  401: 30 * 60 * 1000,
  402: 15 * 60 * 1000,
  429: 8 * 60 * 1000,
  quota: 12 * 60 * 1000,
  500: 2 * 60 * 1000,
};

export function maskKey(key) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length < 10) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/chat\/completions$/i, "");
}

function emptyUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0, errors: 0, last_at: null };
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export function aiStore(state) {
  if (!state.settings) state.settings = {};
  if (!state.settings.ai || typeof state.settings.ai !== "object") state.settings.ai = {};
  const ai = state.settings.ai;
  if (!Array.isArray(ai.providers)) ai.providers = [];
  if (!ai.usage || typeof ai.usage !== "object") ai.usage = { ...emptyUsage(), by_day: {}, by_month: {} };
  if (!ai.usage.by_day || typeof ai.usage.by_day !== "object") ai.usage.by_day = {};
  if (!ai.usage.by_month || typeof ai.usage.by_month !== "object") ai.usage.by_month = {};
  if (!ai.usage.by_model || typeof ai.usage.by_model !== "object") ai.usage.by_model = {};
  for (const p of ai.providers) {
    if (!p.usage || typeof p.usage !== "object") p.usage = emptyUsage();
  }
  return ai;
}

export function publicProvider(p) {
  const now = Date.now();
  const cool = Number(p.cooldown_until) || 0;
  return {
    id: p.id,
    name: p.name,
    base_url: p.base_url,
    key_hint: maskKey(p.key),
    has_key: Boolean(p.key),
    enabled: p.enabled !== false,
    model: p.model || RELAY.model,
    reason_model: p.reason_model || p.model || RELAY.reason_model,
    image_model: p.image_model || "",
    priority: Number(p.priority) || 10,
    cooling: cool > now,
    cooldown_until: cool > now ? new Date(cool).toISOString() : null,
    last_error: p.last_error || "",
    usage: p.usage || emptyUsage(),
  };
}

export function syncEnvProviders(env = process.env) {
  const state = loadCrmState();
  const ai = aiStore(state);
  let changed = false;
  const upsert = (name, base, key, model, reason_model) => {
    const k = String(key || "").trim();
    const base_url = normalizeBase(base);
    if (!k || !base_url) return;
    const hit = ai.providers.find((p) => normalizeBase(p.base_url) === base_url && (p.key === k || p.name === name));
    if (hit) {
      if (!hit.key) {
        hit.key = k;
        changed = true;
      }
      return;
    }
    ai.providers.push(makeProvider({ name, base_url, key: k, model, reason_model, priority: name.startsWith("Relay") ? 1 : 20 }));
    changed = true;
  };
  upsert(RELAY.name, RELAY.base_url, env.RELAY_API_KEY || env.RELAYMODELS_API_KEY, RELAY.model, RELAY.reason_model);
  upsert(
    "Env OpenAI-compatible",
    env.AI_BASE_URL || "https://api.openai.com/v1",
    env.AI_API_KEY || env.OPENAI_API_KEY,
    env.AI_MODEL || "gpt-4o-mini",
    env.AI_REASON_MODEL || env.AI_MODEL || "gpt-4o-mini",
  );
  if (changed) saveCrmState(state);
  return ai.providers;
}

function makeProvider(input) {
  return {
    id: input.id || randomUUID(),
    name: String(input.name || "API").trim().slice(0, 80) || "API",
    base_url: normalizeBase(input.base_url || RELAY.base_url),
    key: String(input.key || "").trim(),
    enabled: input.enabled !== false,
    model: String(input.model || RELAY.model).trim(),
    reason_model: String(input.reason_model || input.model || RELAY.reason_model).trim(),
    image_model: String(input.image_model || "").trim(),
    priority: Number(input.priority) || 10,
    cooldown_until: 0,
    last_error: "",
    usage: emptyUsage(),
    created_at: new Date().toISOString(),
  };
}

export function listProvidersPublic() {
  const state = loadCrmState();
  const ai = aiStore(state);
  return ai.providers
    .slice()
    .sort((a, b) => (Number(a.priority) || 10) - (Number(b.priority) || 10))
    .map(publicProvider);
}

export function addProvider(input) {
  const state = loadCrmState();
  const ai = aiStore(state);
  const row = makeProvider(input);
  if (!row.key) throw new Error("API key required");
  if (!row.base_url.startsWith("http")) throw new Error("base_url must be https://…/v1");
  ai.providers.push(row);
  saveCrmState(state);
  return publicProvider(row);
}

export function patchProvider(id, patch) {
  const state = loadCrmState();
  const ai = aiStore(state);
  const row = ai.providers.find((p) => p.id === id);
  if (!row) return null;
  if (patch.name != null) row.name = String(patch.name).trim().slice(0, 80) || row.name;
  if (patch.base_url != null) row.base_url = normalizeBase(patch.base_url);
  if (patch.key != null && String(patch.key).trim()) row.key = String(patch.key).trim();
  if (typeof patch.enabled === "boolean") row.enabled = patch.enabled;
  if (patch.model != null) row.model = String(patch.model).trim();
  if (patch.reason_model != null) row.reason_model = String(patch.reason_model).trim();
  if (patch.image_model != null) row.image_model = String(patch.image_model).trim();
  if (patch.priority != null) row.priority = Number(patch.priority) || row.priority;
  if (patch.clear_cooldown) {
    row.cooldown_until = 0;
    row.last_error = "";
  }
  saveCrmState(state);
  return publicProvider(row);
}

export function deleteProvider(id) {
  const state = loadCrmState();
  const ai = aiStore(state);
  const next = ai.providers.filter((p) => p.id !== id);
  if (next.length === ai.providers.length) return false;
  ai.providers = next;
  saveCrmState(state);
  return true;
}

export function readyProviders(env = process.env) {
  syncEnvProviders(env);
  const state = loadCrmState();
  const ai = aiStore(state);
  const now = Date.now();
  return ai.providers
    .filter((p) => p.enabled !== false && String(p.key || "").trim() && normalizeBase(p.base_url))
    .filter((p) => (Number(p.cooldown_until) || 0) <= now)
    .sort((a, b) => (Number(a.priority) || 10) - (Number(b.priority) || 10))
    .map((p) => ({
      id: p.id,
      name: p.name,
      base_url: normalizeBase(p.base_url),
      key: p.key,
      model: p.model || RELAY.model,
      reason_model: p.reason_model || p.model || RELAY.reason_model,
      image_model: p.image_model || "",
    }));
}

export function hasAnyProvider(env = process.env) {
  return readyProviders(env).length > 0;
}

function quotaish(status, data) {
  const msg = String(data?.error?.message || data?.error || "").toLowerCase();
  if (status === 429 || status === 402) return true;
  if (status === 401) return true;
  if (/quota|rate.?limit|insufficient|credit|balance|billing|too many requests|limit exceeded/.test(msg)) return true;
  return false;
}

export function markProviderFail(id, status, message) {
  const state = loadCrmState();
  const ai = aiStore(state);
  const row = ai.providers.find((p) => p.id === id);
  if (!row) return;
  row.last_error = String(message || `HTTP ${status}`).slice(0, 240);
  row.usage.errors = (Number(row.usage.errors) || 0) + 1;
  const kind = quotaish(status, { error: { message } }) ? (status === 401 ? 401 : status === 429 ? 429 : "quota") : status >= 500 ? 500 : 0;
  if (kind) row.cooldown_until = Date.now() + (COOLDOWN_MS[kind] || COOLDOWN_MS.quota);
  saveCrmState(state);
}

export function recordUsage(id, usage, modelName) {
  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  const total = Number(usage?.total_tokens) || prompt + completion;
  const state = loadCrmState();
  const ai = aiStore(state);
  const bump = (bucket) => {
    bucket.prompt_tokens = (Number(bucket.prompt_tokens) || 0) + prompt;
    bucket.completion_tokens = (Number(bucket.completion_tokens) || 0) + completion;
    bucket.total_tokens = (Number(bucket.total_tokens) || 0) + total;
    bucket.calls = (Number(bucket.calls) || 0) + 1;
    bucket.last_at = new Date().toISOString();
  };
  bump(ai.usage);
  const d = dayKey();
  const m = monthKey();
  if (!ai.usage.by_day[d]) ai.usage.by_day[d] = emptyUsage();
  if (!ai.usage.by_month[m]) ai.usage.by_month[m] = emptyUsage();
  bump(ai.usage.by_day[d]);
  bump(ai.usage.by_month[m]);
  const days = Object.keys(ai.usage.by_day).sort();
  for (const old of days.slice(0, Math.max(0, days.length - 90))) delete ai.usage.by_day[old];
  const model = String(modelName || "").trim().slice(0, 80);
  if (model) {
    if (!ai.usage.by_model[model]) ai.usage.by_model[model] = emptyUsage();
    bump(ai.usage.by_model[model]);
    const models = Object.entries(ai.usage.by_model).sort(
      (a, b) => String(b[1].last_at || "").localeCompare(String(a[1].last_at || "")),
    );
    ai.usage.by_model = Object.fromEntries(models.slice(0, 80));
  }
  const row = ai.providers.find((p) => p.id === id);
  if (row) bump(row.usage);
  saveCrmState(state);
}

export function usageSummary() {
  const state = loadCrmState();
  const ai = aiStore(state);
  const d = dayKey();
  const m = monthKey();
  return {
    total: {
      prompt_tokens: Number(ai.usage.prompt_tokens) || 0,
      completion_tokens: Number(ai.usage.completion_tokens) || 0,
      total_tokens: Number(ai.usage.total_tokens) || 0,
      calls: Number(ai.usage.calls) || 0,
      errors: Number(ai.usage.errors) || 0,
    },
    today: ai.usage.by_day[d] || emptyUsage(),
    month: ai.usage.by_month[m] || emptyUsage(),
    recent_days: Object.entries(ai.usage.by_day)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([date, u]) => ({ date, ...u })),
    providers: listProvidersPublic().map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      cooling: p.cooling,
      model: p.model,
      reason_model: p.reason_model,
      usage: p.usage,
    })),
    models: Object.entries(ai.usage.by_model || {})
      .map(([id, u]) => ({ id, ...u }))
      .sort((a, b) => (Number(b.total_tokens) || 0) - (Number(a.total_tokens) || 0)),
  };
}

async function readSseChat(res, onDelta) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const data = await res.json().catch(() => ({}));
    return data.choices?.[0]?.message || { role: "assistant", content: "" };
  }
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  const tool_calls = [];
  let usage;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\n/);
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.usage) usage = json.usage;
      const delta = json.choices?.[0]?.delta || {};
      if (delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = Number.isInteger(tc.index) ? tc.index : tool_calls.length;
        if (!tool_calls[i]) tool_calls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
        if (tc.id) tool_calls[i].id = tc.id;
        if (tc.function?.name) tool_calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) tool_calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  const message = { role: "assistant", content };
  if (tool_calls.length) message.tool_calls = tool_calls.filter((c) => c.function?.name);
  return { message, usage };
}

export async function completeChat(env, { messages, tools, hard, model: prefer, onDelta, max_tokens }) {
  const list = readyProviders(env);
  if (!list.length) return { error: "no_key" };
  const want = String(prefer || "").trim();
  let last = "All AI APIs failed or hit their limit.";
  for (const p of list) {
    const model = want || (hard ? p.reason_model : p.model);
    const stream = typeof onDelta === "function";
    const body = { model, messages, temperature: 0.2, stream };
    const cap = Number(max_tokens);
    if (Number.isFinite(cap) && cap > 0) body.max_tokens = Math.round(cap);
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    let res;
    try {
      res = await fetch(`${p.base_url}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      last = err instanceof Error ? err.message : "Network error";
      markProviderFail(p.id, 500, last);
      continue;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      last = data.error?.message || `LLM HTTP ${res.status} (${p.name} · ${model})`;
      if (stream && (res.status === 400 || res.status === 404 || res.status === 422)) {
        try {
          const retry = await fetch(`${p.base_url}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, stream: false }),
          });
          const data2 = await retry.json().catch(() => ({}));
          if (retry.ok) {
            recordUsage(p.id, data2.usage, model);
            const message = data2.choices?.[0]?.message || { role: "assistant", content: "" };
            if (message.content) onDelta?.(String(message.content));
            return {
              message,
              usage: data2.usage,
              provider: { id: p.id, name: p.name, model, base_url: p.base_url },
            };
          }
        } catch {
          /* next provider */
        }
      }
      markProviderFail(p.id, res.status, last);
      continue;
    }
    if (stream) {
      const parsed = await readSseChat(res, onDelta);
      recordUsage(p.id, parsed.usage, model);
      return {
        message: parsed.message || { role: "assistant", content: "" },
        usage: parsed.usage,
        provider: { id: p.id, name: p.name, model, base_url: p.base_url },
      };
    }
    const data = await res.json().catch(() => ({}));
    recordUsage(p.id, data.usage, model);
    return {
      message: data.choices?.[0]?.message || { role: "assistant", content: "" },
      usage: data.usage,
      provider: { id: p.id, name: p.name, model, base_url: p.base_url },
    };
  }
  return { error: last };
}

export async function completeImage(env, prompt) {
  const list = readyProviders(env);
  for (const p of list) {
    const models = [p.image_model, "dall-e-3", "gpt-image-1", "dall-e-2"].filter(Boolean);
    const tried = new Set();
    for (const model of models) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const res = await fetch(`${p.base_url}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (quotaish(res.status, data)) {
          markProviderFail(p.id, res.status, data.error?.message || `HTTP ${res.status}`);
          break;
        }
        const b64 = data.data?.[0]?.b64_json;
        if (res.ok && b64) {
          recordUsage(p.id, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, model);
          return { buffer: Buffer.from(b64, "base64"), source: `${p.name}:${model}` };
        }
        const url = data.data?.[0]?.url;
        if (res.ok && url) {
          const img = await fetch(url);
          if (img.ok) {
            recordUsage(p.id, { total_tokens: 0 }, model);
            return { buffer: Buffer.from(await img.arrayBuffer()), source: `${p.name}:${model}` };
          }
        }
      } catch {
        /* next model */
      }
    }
  }
  return null;
}

export async function fetchRemoteModels(id) {
  const state = loadCrmState();
  const ai = aiStore(state);
  const row = ai.providers.find((p) => p.id === id);
  if (!row?.key) throw new Error("Provider not found");
  const res = await fetch(`${normalizeBase(row.base_url)}/models`, {
    headers: { Authorization: `Bearer ${row.key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Models HTTP ${res.status}`);
  const ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
  return [...new Set(ids)].slice(0, 160);
}

let catalogCache = { at: 0, models: [] };

export async function listCatalog(env = process.env) {
  if (Date.now() - catalogCache.at < 5 * 60 * 1000 && catalogCache.models.length) {
    return catalogCache.models;
  }
  const list = readyProviders(env);
  const seen = new Set();
  const models = [];
  for (const p of list.slice(0, 4)) {
    try {
      const ids = await fetchRemoteModels(p.id);
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        models.push({ id, provider: p.name, provider_id: p.id });
      }
    } catch {
      /* skip bad provider */
    }
  }
  if (models.length) catalogCache = { at: Date.now(), models };
  return models;
}

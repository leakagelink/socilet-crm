import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { json } from "./http-util.mjs";
import { corsAndOptions, guardOrigin, readJson } from "./security.mjs";
import { requireApiUser } from "./auth-api.mjs";
import { persistFiles, writeJsonCopies } from "./persist.mjs";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";

function storePaths() {
  return persistFiles("ads-accounts.json", [process.env.ADS_STORE]);
}

function readRows(file) {
  try {
    if (!existsSync(file)) return [];
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function loadStore() {
  const byId = new Map();
  for (const file of storePaths()) {
    for (const row of readRows(file)) {
      if (row && typeof row.id === "string") byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function saveStore(rows) {
  writeJsonCopies("ads-accounts.json", rows, [process.env.ADS_STORE]);
}

function maskKey(key) {
  const k = String(key || "");
  if (k.length < 8) return k ? "••••" : "";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function publicRow(row) {
  return {
    id: row.id,
    label: row.label,
    platform: row.platform || "meta",
    account_id: row.account_id || "",
    has_key: Boolean(row.token),
    key_hint: maskKey(row.token),
    connected: Boolean(row.connected),
    last_error: row.lastError || null,
  };
}

function pathname(req) {
  return (req.url || "/").split("?")[0];
}

function upsertCrmAccount(row) {
  const state = loadCrmState();
  const now = new Date().toISOString();
  const existing = (state.records || []).find((r) => r.id === row.id && r.module === "ad_accounts");
  const data = {
    name: row.label,
    platform: row.platform,
    account_id: row.account_id,
    status: row.connected ? "live" : "paused",
    notes: existing?.data?.notes || "",
  };
  if (existing) {
    existing.data = { ...existing.data, ...data };
    existing.updated_at = now;
  } else {
    state.records = state.records || [];
    state.records.push({
      id: row.id,
      module: "ad_accounts",
      data,
      created_at: now,
      updated_at: now,
    });
  }
  saveCrmState(state);
}

function dropCrmAccount(id) {
  const state = loadCrmState();
  state.records = (state.records || []).filter((r) => !(r.id === id && r.module === "ad_accounts"));
  saveCrmState(state);
}

async function testMeta(token) {
  const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Meta HTTP ${res.status}`);
  return data;
}

export async function handleAdsRequest(req, res, env = process.env) {
  if (corsAndOptions(req, res, env)) return true;
  const path = pathname(req);
  if (!path.startsWith("/api/ads")) return false;
  if (!guardOrigin(req, res, env)) return true;
  const user = await requireApiUser(req, res, env);
  if (!user) return true;
  const canWrite = user.role === "admin";
  const canRead = user.role === "admin" || user.role === "accountant";
  if (!canRead) {
    json(res, 403, { error: "Ads is admin / accountant only" });
    return true;
  }

  try {
    if (req.method === "GET" && path === "/api/ads/accounts") {
      json(res, 200, { data: loadStore().map(publicRow) });
      return true;
    }

    if (req.method === "POST" && path === "/api/ads/accounts") {
      if (!canWrite) {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const platform = ["meta", "google", "other"].includes(input.platform) ? input.platform : "meta";
      const row = {
        id: String(input.id || randomUUID()),
        label: String(input.label || input.name || "Ads account").trim().slice(0, 80) || "Ads account",
        platform,
        account_id: String(input.account_id || "").trim().slice(0, 80),
        token: String(input.token || input.key || "").trim(),
        connected: false,
        lastError: null,
      };
      const rows = loadStore().filter((r) => r.id !== row.id);
      if (row.token && platform === "meta") {
        try {
          await testMeta(row.token);
          row.connected = true;
        } catch (err) {
          row.lastError = err instanceof Error ? err.message : "Meta test failed";
        }
      } else if (row.token && platform === "google") {
        row.connected = true;
        row.lastError = "Google Ads API sync is manual — log spend/ROAS in Campaigns.";
      }
      rows.push(row);
      saveStore(rows);
      upsertCrmAccount(row);
      json(res, 200, { data: publicRow(row) });
      return true;
    }

    const one = path.match(/^\/api\/ads\/accounts\/([^/]+)$/);
    if (one && req.method === "PATCH") {
      if (!canWrite) {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const rows = loadStore();
      const row = rows.find((r) => r.id === one[1]);
      if (!row) {
        json(res, 404, { error: "Not found" });
        return true;
      }
      if (input.label != null) row.label = String(input.label).trim().slice(0, 80) || row.label;
      if (input.account_id != null) row.account_id = String(input.account_id).trim().slice(0, 80);
      if (input.platform && ["meta", "google", "other"].includes(input.platform)) row.platform = input.platform;
      if (input.token != null && String(input.token).trim()) row.token = String(input.token).trim();
      saveStore(rows);
      upsertCrmAccount(row);
      json(res, 200, { data: publicRow(row) });
      return true;
    }
    if (one && req.method === "DELETE") {
      if (!canWrite) {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      saveStore(loadStore().filter((r) => r.id !== one[1]));
      dropCrmAccount(one[1]);
      json(res, 200, { ok: true });
      return true;
    }

    const test = path.match(/^\/api\/ads\/accounts\/([^/]+)\/test$/);
    if (test && req.method === "POST") {
      if (!canWrite) {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const rows = loadStore();
      const row = rows.find((r) => r.id === test[1]);
      if (!row?.token) {
        json(res, 400, { error: "No token on this account" });
        return true;
      }
      try {
        if (row.platform !== "meta") {
          row.connected = true;
          row.lastError = "Live test is Meta-only. Google spend stays manual in Campaigns.";
          saveStore(rows);
          json(res, 200, { data: publicRow(row) });
          return true;
        }
        await testMeta(row.token);
        row.connected = true;
        row.lastError = null;
        saveStore(rows);
        upsertCrmAccount(row);
        json(res, 200, { data: publicRow(row) });
      } catch (err) {
        row.connected = false;
        row.lastError = err instanceof Error ? err.message : "Test failed";
        saveStore(rows);
        json(res, 400, { error: row.lastError, data: publicRow(row) });
      }
      return true;
    }

    json(res, 404, { error: "Unknown ads route" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Ads request failed" });
    return true;
  }
}

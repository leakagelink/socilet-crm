import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { json, originOk, readBody, setCors } from "./http-util.mjs";

function storePaths() {
  const paths = [];
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) paths.push(join(dataDir, "crm.json"));
  paths.push(join(process.cwd(), "..", ".socilet-persist", "crm.json"));
  paths.push(join(process.cwd(), "data", "crm.json"));
  return [...new Set(paths)];
}

function emptyState() {
  return {
    records: [],
    settings: {
      finance: { id: "finance", base_balance: 0, updated_at: new Date().toISOString() },
    },
  };
}

function loadState() {
  for (const file of storePaths()) {
    try {
      if (!existsSync(file)) continue;
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (!raw || typeof raw !== "object") continue;
      return {
        records: Array.isArray(raw.records) ? raw.records : [],
        settings: {
          finance: raw.settings?.finance || emptyState().settings.finance,
        },
      };
    } catch {
      /* next path */
    }
  }
  return emptyState();
}

function saveState(state) {
  const body = JSON.stringify(state, null, 2);
  let wrote = false;
  for (const file of storePaths()) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body, "utf8");
      wrote = true;
    } catch (err) {
      console.error("crm persist failed", file, err);
    }
  }
  if (!wrote) throw new Error("Could not persist CRM data");
}

function pathname(req) {
  return (req.url || "/").split("?")[0];
}

function query(req) {
  try {
    return new URL(req.url || "/", "http://local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export async function handleCrmRequest(req, res, env = process.env) {
  setCors(req, res, env);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (!originOk(req, env)) {
    json(res, 403, { error: "Origin not allowed" });
    return true;
  }

  const path = pathname(req);
  const qs = query(req);

  try {
    if (req.method === "GET" && path === "/api/crm/health") {
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && path === "/api/crm/records") {
      const module = qs.get("module");
      const state = loadState();
      const rows = module ? state.records.filter((r) => r.module === module) : state.records;
      json(res, 200, { data: rows });
      return true;
    }

    if (req.method === "POST" && path === "/api/crm/records") {
      const input = JSON.parse((await readBody(req)) || "{}");
      const state = loadState();
      const now = new Date().toISOString();
      const row = {
        id: String(input.id || randomUUID()),
        module: String(input.module || ""),
        data: input.data && typeof input.data === "object" ? input.data : {},
        created_at: String(input.created_at || now),
        updated_at: now,
      };
      if (!row.module) {
        json(res, 400, { error: "module required" });
        return true;
      }
      state.records = state.records.filter((r) => r.id !== row.id);
      state.records.push(row);
      saveState(state);
      json(res, 200, { data: row });
      return true;
    }

    if (req.method === "POST" && path === "/api/crm/merge") {
      const input = JSON.parse((await readBody(req)) || "{}");
      const state = loadState();
      const incoming = Array.isArray(input.records) ? input.records : [];
      const byId = new Map(state.records.map((r) => [r.id, r]));
      for (const row of incoming) {
        if (!row?.id || !row.module) continue;
        const prev = byId.get(row.id);
        if (!prev || String(row.updated_at || "") >= String(prev.updated_at || "")) {
          byId.set(row.id, row);
        }
      }
      state.records = [...byId.values()];
      if (input.finance && typeof input.finance.base_balance === "number") {
        const prev = state.settings.finance;
        if (!prev?.updated_at || String(input.finance.updated_at || "") >= String(prev.updated_at || "")) {
          state.settings.finance = {
            id: "finance",
            base_balance: input.finance.base_balance,
            updated_at: input.finance.updated_at || new Date().toISOString(),
          };
        }
      }
      saveState(state);
      json(res, 200, { data: state.records, finance: state.settings.finance });
      return true;
    }

    const one = path.match(/^\/api\/crm\/records\/([^/]+)$/);
    if (one && req.method === "PUT") {
      const input = JSON.parse((await readBody(req)) || "{}");
      const state = loadState();
      const existing = state.records.find((r) => r.id === one[1]);
      if (!existing) {
        json(res, 404, { error: "Not found" });
        return true;
      }
      existing.data = input.data && typeof input.data === "object" ? input.data : existing.data;
      existing.updated_at = new Date().toISOString();
      saveState(state);
      json(res, 200, { data: existing });
      return true;
    }
    if (one && req.method === "DELETE") {
      const state = loadState();
      state.records = state.records.filter((r) => r.id !== one[1]);
      saveState(state);
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && path === "/api/crm/settings/finance") {
      json(res, 200, { data: loadState().settings.finance });
      return true;
    }
    if (req.method === "PUT" && path === "/api/crm/settings/finance") {
      const input = JSON.parse((await readBody(req)) || "{}");
      const state = loadState();
      state.settings.finance = {
        id: "finance",
        base_balance: Number(input.base_balance) || 0,
        updated_at: new Date().toISOString(),
      };
      saveState(state);
      json(res, 200, { data: state.settings.finance });
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "CRM request failed" });
    return true;
  }
}

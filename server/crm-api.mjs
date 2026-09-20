import { randomUUID, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { json } from "./http-util.mjs";
import { corsAndOptions, escapeHtml, guardOrigin, readJson } from "./security.mjs";
import { requireApiUser } from "./auth-api.mjs";
import { getVaultUnlock, loadAuth, prune, vaultConfigured } from "./auth-store.mjs";
import { pickBestCopy, readJsonCopies, writeJsonCopies } from "./persist.mjs";

function emptyFirm() {
  return { legal_name: "Socilet", gstin: "", upi_id: "", address: "", phone: "", email: "", logo_url: "/socilet-logo.svg" };
}

function emptyState() {
  return {
    records: [],
    settings: {
      finance: { id: "finance", base_balance: 0, updated_at: new Date().toISOString() },
      firm: emptyFirm(),
    },
  };
}

function loadState() {
  const copies = readJsonCopies("crm.json").filter((c) => c.raw && typeof c.raw === "object" && !Array.isArray(c.raw));
  const best = pickBestCopy(copies, (copy) => {
    const records = Array.isArray(copy.raw?.records) ? copy.raw.records : [];
    const saved = Date.parse(copy.raw?.savedAt || "") || 0;
    return records.length * 1e13 + Math.max(saved, copy.mtime || 0);
  });
  if (!best) return emptyState();
  return {
    records: Array.isArray(best.raw.records) ? best.raw.records : [],
    settings: {
      finance: best.raw.settings?.finance || emptyState().settings.finance,
      firm: { ...emptyFirm(), ...(best.raw.settings?.firm || {}) },
    },
    savedAt: String(best.raw.savedAt || ""),
  };
}

function saveState(state) {
  state.savedAt = new Date().toISOString();
  writeJsonCopies("crm.json", state);
}

function backupKey(env) {
  return scryptSync(String(env.BACKUP_KEY || env.INBOUND_WEBHOOK_SECRET || "socilet-backup"), "socilet-crm-backup", 32);
}

export async function runDailyBackup(env = process.env) {
  const meta = readJsonCopies("backups/meta.json");
  const lastAt = meta[0]?.raw?.lastAt;
  if (lastAt && Date.now() - Date.parse(String(lastAt)) < 20 * 3600 * 1000) {
    return { skipped: true };
  }
  const state = loadState();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(env), iv);
  const plain = Buffer.from(JSON.stringify({ records: state.records, settings: state.settings, savedAt: new Date().toISOString() }));
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
  const day = new Date().toISOString().slice(0, 10);
  writeJsonCopies(`backups/crm-${day}.json`, payload);
  writeJsonCopies("backups/meta.json", { lastAt: new Date().toISOString() });
  const to = String(env.BACKUP_EMAIL || "").trim();
  const key = String(env.RESEND_API_KEY || "").trim();
  if (to && key) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.RESEND_FROM || "Socilet <noreply@socilet.in>",
          to,
          subject: `Socilet encrypted backup ${day}`,
          text: "Encrypted CRM snapshot attached. Keep this file private.",
          attachments: [{ filename: `socilet-crm-${day}.enc.json`, content: Buffer.from(JSON.stringify(payload)).toString("base64") }],
        }),
      });
    } catch (err) {
      console.error("backup email failed", err);
    }
  }
  return { ok: true, day };
}

function docHtml(row, firm) {
  const data = row.data || {};
  const kind = row.module === "quotations" ? "Quotation" : "Invoice";
  const no = data.quote_no || data.invoice_no || "";
  const amount = Number(data.amount) || 0;
  const gst = Number(data.gst_amount) || 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(kind)} ${escapeHtml(String(no))}</title>
  <style>body{font-family:Segoe UI,sans-serif;max-width:40rem;margin:2rem auto;color:#111}table{width:100%}</style></head><body>
  <h1>${escapeHtml(kind)} ${escapeHtml(String(no))}</h1>
  <p>${escapeHtml(firm.legal_name || "Socilet")}<br>${firm.gstin ? "GSTIN " + escapeHtml(firm.gstin) : ""}</p>
  <p>Bill to: ${escapeHtml(String(data.client || ""))}<br>${escapeHtml(String(data.client_email || ""))}</p>
  <table><tr><td>Amount</td><td style="text-align:right">${amount}</td></tr>
  <tr><td>GST</td><td style="text-align:right">${gst}</td></tr>
  <tr><td>Total</td><td style="text-align:right">${amount + gst}</td></tr></table>
  <p>Pay UPI: ${escapeHtml(firm.upi_id || "")}</p>
  <p>Use Print → Save as PDF.</p>
  </body></html>`;
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

function credsLocked(req) {
  const auth = prune(loadAuth());
  if (!vaultConfigured(auth)) return false;
  return !getVaultUnlock(req, auth);
}

function hideCreds(rows) {
  return rows.filter((r) => r.module !== "service_credentials");
}

function rejectLockedCreds(req, res, module) {
  if (module !== "service_credentials") return false;
  if (!credsLocked(req)) return false;
  json(res, 403, { error: "Unlock service credentials with password and 2FA" });
  return true;
}

export async function handleCrmRequest(req, res, env = process.env) {
  if (corsAndOptions(req, res, env)) return true;
  if (!guardOrigin(req, res, env)) return true;

  const path = pathname(req);
  const qs = query(req);

  try {
    if (req.method === "GET" && path === "/api/crm/health") {
      json(res, 200, { ok: true });
      return true;
    }

    const doc = path.match(/^\/api\/crm\/doc\/([^/]+)$/);
    if (doc && req.method === "GET") {
      const token = doc[1];
      const state = loadState();
      const row = state.records.find((r) => String(r.data?.share_token || "") === token && ["invoices", "quotations"].includes(r.module));
      if (!row) {
        json(res, 404, { error: "Document not found" });
        return true;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(docHtml(row, state.settings.firm || emptyFirm()));
      return true;
    }

    const user = await requireApiUser(req, res, env);
    if (!user) return true;

    if (req.method === "GET" && path === "/api/crm/records") {
      const module = qs.get("module");
      if (rejectLockedCreds(req, res, module)) return true;
      const state = loadState();
      let rows = module ? state.records.filter((r) => r.module === module) : state.records;
      if (!module && credsLocked(req)) rows = hideCreds(rows);
      json(res, 200, { data: rows });
      return true;
    }

    if (req.method === "POST" && path === "/api/crm/records") {
      const input = await readJson(req, res);
      if (!input) return true;
      if (rejectLockedCreds(req, res, String(input.module || ""))) return true;
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
      const input = await readJson(req, res);
      if (!input) return true;
      const state = loadState();
      const incoming = Array.isArray(input.records) ? input.records : [];
      const byId = new Map(state.records.map((r) => [r.id, r]));
      const locked = credsLocked(req);
      for (const row of incoming) {
        if (!row?.id || !row.module) continue;
        if (locked && row.module === "service_credentials") continue;
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
      json(res, 200, { data: locked ? hideCreds(state.records) : state.records, finance: state.settings.finance });
      return true;
    }

    const one = path.match(/^\/api\/crm\/records\/([^/]+)$/);
    if (one && req.method === "PUT") {
      const input = await readJson(req, res);
      if (!input) return true;
      const state = loadState();
      const existing = state.records.find((r) => r.id === one[1]);
      if (!existing) {
        json(res, 404, { error: "Not found" });
        return true;
      }
      if (rejectLockedCreds(req, res, existing.module)) return true;
      existing.data = input.data && typeof input.data === "object" ? input.data : existing.data;
      existing.updated_at = new Date().toISOString();
      saveState(state);
      json(res, 200, { data: existing });
      return true;
    }
    if (one && req.method === "DELETE") {
      const state = loadState();
      const existing = state.records.find((r) => r.id === one[1]);
      if (existing && rejectLockedCreds(req, res, existing.module)) return true;
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
      const input = await readJson(req, res);
      if (!input) return true;
      const state = loadState();
      state.settings.finance = {
        id: "finance",
        base_balance: Number.isFinite(Number(input.base_balance)) ? Number(input.base_balance) : 0,
        updated_at: new Date().toISOString(),
      };
      saveState(state);
      json(res, 200, { data: state.settings.finance });
      return true;
    }

    if (req.method === "GET" && path === "/api/crm/settings/firm") {
      json(res, 200, { data: loadState().settings.firm || emptyFirm() });
      return true;
    }
    if (req.method === "PUT" && path === "/api/crm/settings/firm") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const state = loadState();
      state.settings.firm = {
        ...emptyFirm(),
        legal_name: String(input.legal_name || ""),
        gstin: String(input.gstin || ""),
        upi_id: String(input.upi_id || ""),
        address: String(input.address || ""),
        phone: String(input.phone || ""),
        email: String(input.email || ""),
        logo_url: String(input.logo_url || "/socilet-logo.svg"),
      };
      saveState(state);
      json(res, 200, { data: state.settings.firm });
      return true;
    }

    if (req.method === "POST" && path === "/api/crm/backup") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const result = await runDailyBackup(env);
      json(res, 200, result);
      return true;
    }
    if (req.method === "GET" && path === "/api/crm/backup") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const state = loadState();
      const records = credsLocked(req) ? hideCreds(state.records) : state.records;
      json(res, 200, { records, settings: state.settings, savedAt: state.savedAt });
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "CRM request failed" });
    return true;
  }
}

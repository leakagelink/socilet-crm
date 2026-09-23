import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { json, readBody } from "./http-util.mjs";
import { corsAndOptions, escapeHtml, guardOrigin, readJson } from "./security.mjs";
import { inboundOk, requireApiUser } from "./auth-api.mjs";
import { persistFiles, writeJsonCopies } from "./persist.mjs";

const RESEND = "https://api.resend.com";

function storePaths() {
  return persistFiles("mailboxes.json", [process.env.MAILBOX_STORE]);
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
      if (row && typeof row.id === "string" && row.apiKey) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function saveStore(rows) {
  writeJsonCopies("mailboxes.json", rows, [process.env.MAILBOX_STORE]);
}

function maskKey(key) {
  const k = String(key || "");
  if (k.length < 8) return "re_****";
  return `${k.slice(0, 5)}…${k.slice(-4)}`;
}

function publicBox(row) {
  return {
    id: row.id,
    label: row.label,
    from: row.from,
    domain: row.domain,
    keyHint: maskKey(row.apiKey),
    connected: Boolean(row.connected),
    lastError: row.lastError || null,
  };
}

function withEnvMailbox(env, rows) {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return rows;
  const from = env.RESEND_FROM?.trim() || "Socilet <noreply@socilet.in>";
  const domain = from.match(/@([^>]+)/)?.[1] || "socilet.in";
  const existing = rows.find((r) => r.id === "env-default");
  const row = {
    id: "env-default",
    label: existing?.label || "Socilet (env)",
    from,
    domain,
    apiKey: key,
    connected: true,
    lastError: null,
  };
  return [row, ...rows.filter((r) => r.id !== "env-default")];
}

async function resendWithKey(apiKey, method, path, body) {
  if (!apiKey?.trim()) throw new Error("This mailbox has no Resend API key");
  const res = await fetch(`${RESEND}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

async function testKey(apiKey) {
  await resendWithKey(apiKey, "GET", "/emails");
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

function getMailbox(env, id) {
  const rows = withEnvMailbox(env, loadStore());
  if (id) return rows.find((r) => r.id === id) || null;
  return rows[0] || null;
}

function mailAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.filename || item.name || "")
      .trim()
      .replace(/[^\w.\- ()[\]]+/g, "_")
      .slice(0, 180);
    let content = String(item.content || item.data || "");
    const marker = "base64,";
    const at = content.indexOf(marker);
    if (content.startsWith("data:") && at >= 0) content = content.slice(at + marker.length);
    content = content.replace(/\s/g, "");
    if (!name || !content || content.length > 6_000_000) continue;
    const row = { filename: name, content };
    const mime = String(item.mime || item.content_type || "").trim();
    if (mime) row.content_type = mime;
    out.push(row);
    if (out.length >= 5) break;
  }
  return out;
}

export async function handleEmailRequest(req, res, env) {
  if (corsAndOptions(req, res, env)) return true;

  const path = pathname(req);
  const qs = query(req);
  const inbound = path.match(/^\/api\/email\/inbound(?:\/([^/]+))?$/);

  try {
    if (req.method === "POST" && inbound) {
      if (!inboundOk(req, env)) {
        json(res, 401, { error: "Invalid inbound secret" });
        return true;
      }
      const box = getMailbox(env, inbound[1] || qs.get("mailbox"));
      if (!box) {
        json(res, 200, { ok: true });
        return true;
      }
      const event = await readJson(req, res);
      if (!event) return true;
      if (event.type === "email.received" && event.data?.email_id) {
        await resendWithKey(box.apiKey, "GET", `/emails/receiving/${event.data.email_id}`);
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (!guardOrigin(req, res, env)) return true;
    if (!(await requireApiUser(req, res, env))) return true;

    if (req.method === "GET" && path === "/api/email/mailboxes") {
      json(res, 200, { data: withEnvMailbox(env, loadStore()).map(publicBox) });
      return true;
    }

    if (req.method === "POST" && path === "/api/email/mailboxes") {
      const input = await readJson(req, res);
      if (!input) return true;
      const label = String(input.label || "").trim();
      const from = String(input.from || "").trim();
      const apiKey = String(input.apiKey || "").trim();
      if (!label || !from.includes("@") || !apiKey.startsWith("re_")) {
        json(res, 400, { error: "label, from (email), and Resend API key (re_…) are required" });
        return true;
      }
      try {
        await testKey(apiKey);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : "Resend key failed", connected: false });
        return true;
      }
      const domain = from.match(/@([^>]+)/)?.[1]?.replace(">", "") || "";
      const requestedId = String(input.id || "").trim();
      if (requestedId === "env-default") {
        json(res, 400, { error: "Cannot overwrite the env mailbox" });
        return true;
      }
      const rows = loadStore();
      const existing =
        rows.find((r) => requestedId && r.id === requestedId) ||
        rows.find((r) => String(r.from || "").toLowerCase() === from.toLowerCase());
      if (existing) {
        existing.label = label;
        existing.from = from;
        existing.domain = domain;
        existing.apiKey = apiKey;
        existing.connected = true;
        existing.lastError = null;
        saveStore(rows);
        json(res, 200, { mailbox: publicBox(existing), restored: true });
        return true;
      }
      const row = {
        id: requestedId || randomUUID(),
        label,
        from,
        domain,
        apiKey,
        connected: true,
        lastError: null,
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      saveStore(rows);
      json(res, 200, { mailbox: publicBox(row) });
      return true;
    }

    const del = path.match(/^\/api\/email\/mailboxes\/([^/]+)$/);
    if (req.method === "DELETE" && del) {
      if (del[1] === "env-default") {
        json(res, 400, { error: "Remove env mailbox by clearing RESEND_API_KEY on the server" });
        return true;
      }
      saveStore(loadStore().filter((r) => r.id !== del[1]));
      json(res, 200, { ok: true });
      return true;
    }

    const box = getMailbox(env, qs.get("mailbox") || "");
    if (!box && path !== "/api/email/mailboxes") {
      if (path === "/api/email/status") {
        json(res, 200, { configured: false, from: "", mailboxId: "", mailboxes: [] });
        return true;
      }
      json(res, 400, { error: "No mailbox yet. Add a Resend API key in Emails." });
      return true;
    }

    if (req.method === "GET" && path === "/api/email/status") {
      json(res, 200, {
        configured: true,
        from: box.from,
        mailboxId: box.id,
        mailboxes: withEnvMailbox(env, loadStore()).map(publicBox),
      });
      return true;
    }

    if (req.method === "GET" && path === "/api/email/inbox") {
      const data = await resendWithKey(box.apiKey, "GET", "/emails/receiving");
      json(res, 200, data);
      return true;
    }

    if (req.method === "GET" && path === "/api/email/sent") {
      const data = await resendWithKey(box.apiKey, "GET", "/emails");
      json(res, 200, data);
      return true;
    }

    const received = path.match(/^\/api\/email\/received\/([^/]+)$/);
    if (req.method === "GET" && received) {
      const data = await resendWithKey(box.apiKey, "GET", `/emails/receiving/${received[1]}`);
      json(res, 200, data);
      return true;
    }

    const sentOne = path.match(/^\/api\/email\/sent\/([^/]+)$/);
    if (req.method === "GET" && sentOne) {
      const data = await resendWithKey(box.apiKey, "GET", `/emails/${sentOne[1]}`);
      json(res, 200, data);
      return true;
    }

    if (req.method === "POST" && path === "/api/email/send") {
      const raw = await readBody(req, 8 * 1024 * 1024);
      if (raw == null) {
        json(res, 413, { error: "Mail too large (max 8MB with files)" });
        return true;
      }
      let input;
      try {
        input = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return true;
      }
      const active = getMailbox(env, input.mailboxId || qs.get("mailbox")) || box;
      const to = String(input.to || "").trim();
      const subject = String(input.subject || "").trim();
      const text = String(input.text || input.body || "").trim();
      const html = `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;
      if (!to.includes("@") || !subject || !text) {
        json(res, 400, { error: "to, subject, and body are required" });
        return true;
      }
      const payload = {
        from: active.from,
        to: [to],
        subject,
        text,
        html,
      };
      const files = mailAttachments(input.attachments);
      if (files.length) payload.attachments = files;
      if (input.replyTo) payload.reply_to = String(input.replyTo);
      const data = await resendWithKey(active.apiKey, "POST", "/emails", payload);
      json(res, 200, data);
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Email request failed" });
    return true;
  }
}

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RESEND = "https://api.resend.com";
const STORE = join(process.cwd(), "data", "mailboxes.json");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function originOk(req) {
  const origin = req.headers.origin || "";
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = [
    "http://127.0.0.1:43721",
    "http://localhost:43721",
    "https://crm.proofvault.space",
    ...extra,
  ];
  if (!origin) return true;
  return allowed.includes(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originOk(req)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function loadStore() {
  try {
    if (!existsSync(STORE)) return [];
    const raw = JSON.parse(readFileSync(STORE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveStore(rows) {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(rows, null, 2), "utf8");
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

export async function handleEmailRequest(req, res, env) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (!originOk(req)) {
    json(res, 403, { error: "Origin not allowed" });
    return true;
  }

  const path = pathname(req);
  const qs = query(req);

  try {
    if (req.method === "GET" && path === "/api/email/mailboxes") {
      json(res, 200, { data: withEnvMailbox(env, loadStore()).map(publicBox) });
      return true;
    }

    if (req.method === "POST" && path === "/api/email/mailboxes") {
      const input = JSON.parse((await readBody(req)) || "{}");
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
      const row = {
        id: randomUUID(),
        label,
        from,
        domain,
        apiKey,
        connected: true,
        lastError: null,
        createdAt: new Date().toISOString(),
      };
      const rows = loadStore();
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

    const inbound = path.match(/^\/api\/email\/inbound(?:\/([^/]+))?$/);
    if (req.method === "POST" && inbound) {
      const box = getMailbox(env, inbound[1] || qs.get("mailbox"));
      if (!box) {
        json(res, 200, { ok: true });
        return true;
      }
      const event = JSON.parse((await readBody(req)) || "{}");
      if (event.type === "email.received" && event.data?.email_id) {
        await resendWithKey(box.apiKey, "GET", `/emails/receiving/${event.data.email_id}`);
      }
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
      const input = JSON.parse((await readBody(req)) || "{}");
      const active = getMailbox(env, input.mailboxId || qs.get("mailbox")) || box;
      const to = String(input.to || "").trim();
      const subject = String(input.subject || "").trim();
      const text = String(input.text || input.body || "").trim();
      const html = String(input.html || `<p>${text.replace(/\n/g, "<br/>")}</p>`);
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

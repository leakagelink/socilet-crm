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

export async function sendCrmEmail(env, { to, subject, text, mailboxId }) {
  const box = getMailbox(env, mailboxId || "");
  if (!box) throw new Error("No mailbox. Add a Resend key in Emails first.");
  const dest = String(to || "").trim();
  const sub = String(subject || "").trim();
  const body = String(text || "").trim();
  if (!dest.includes("@") || !sub || !body) throw new Error("to, subject, and body are required");
  const html = prettyHtml(body);
  return resendWithKey(box.apiKey, "POST", "/emails", {
    from: box.from,
    to: [dest],
    subject: sub,
    text: body,
    html,
  });
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

function outboundPaths() {
  return persistFiles("outbound-mail.json", [process.env.MAIL_OUTBOUND_STORE]);
}

function loadOutbound() {
  const byId = new Map();
  for (const file of outboundPaths()) {
    for (const row of readRows(file)) {
      if (row && typeof row.id === "string") byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function saveOutbound(rows) {
  writeJsonCopies("outbound-mail.json", rows, [process.env.MAIL_OUTBOUND_STORE]);
}

function rememberOutbound(row) {
  const rows = loadOutbound().filter((r) => r.id !== row.id);
  rows.unshift(row);
  saveOutbound(rows.slice(0, 400));
}

function snippetOf(row) {
  const text = String(row?.text || row?.snippet || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 140);
  const html = String(row?.html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return html.slice(0, 140);
}

function listItem(row, extra = {}) {
  const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
  return {
    id: row.id,
    from: row.from,
    to: row.to,
    cc: row.cc,
    subject: row.subject,
    created_at: row.created_at,
    last_event: row.last_event || extra.last_event || extra.status,
    status: extra.status || row.status || row.last_event,
    attachment_count: extra.attachment_count ?? attachments.length,
    snippet: extra.snippet ?? snippetOf(row),
    local: Boolean(extra.local),
    error: extra.error || row.error || undefined,
  };
}

function publicAtt(att) {
  return {
    id: att.id,
    filename: att.filename || att.name || "file",
    content_type: att.content_type || att.contentType || "application/octet-stream",
    content_disposition: att.content_disposition || att.contentDisposition || "attachment",
    content_id: att.content_id || att.contentId || "",
    size: att.size,
  };
}

async function listAttachments(apiKey, folder, emailId) {
  const path =
    folder === "receiving"
      ? `/emails/receiving/${emailId}/attachments`
      : `/emails/${emailId}/attachments`;
  try {
    const data = await resendWithKey(apiKey, "GET", path);
    const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return rows.map(publicAtt);
  } catch {
    return [];
  }
}

async function fetchAttachmentMeta(apiKey, folder, emailId, attachmentId) {
  const path =
    folder === "receiving"
      ? `/emails/receiving/${emailId}/attachments/${attachmentId}`
      : `/emails/${emailId}/attachments/${attachmentId}`;
  try {
    return await resendWithKey(apiKey, "GET", path);
  } catch {
    const listed = await listAttachments(apiKey, folder, emailId);
    const hit = listed.find((a) => a.id === attachmentId);
    if (!hit) throw new Error("Attachment not found");
    try {
      return await resendWithKey(apiKey, "GET", path);
    } catch {
      return hit;
    }
  }
}

function downloadUrlOf(meta) {
  return meta?.download_url || meta?.data?.download_url || "";
}

function sendFile(res, { body, type, name, inline }) {
  res.statusCode = 200;
  res.setHeader("Content-Type", type || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const safe = String(name || "file").replace(/"/g, "");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safe}"`);
  res.setHeader("Cache-Control", "private, max-age=120");
  res.end(body);
}

function prettyHtml(text) {
  const body = escapeHtml(text).replace(/\n/g, "<br/>");
  return `<div style="font-family:Georgia,ui-serif,serif;font-size:16px;line-height:1.55;color:#1a1a1a">${body}</div>`;
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
      const data = await resendWithKey(box.apiKey, "GET", "/emails/receiving?limit=50");
      const rows = Array.isArray(data?.data) ? data.data : [];
      json(res, 200, {
        data: rows.map((row) =>
          listItem(row, {
            last_event: "received",
            status: "received",
            attachment_count: Array.isArray(row.attachments) ? row.attachments.length : Number(row.attachment_count || 0),
          }),
        ),
      });
      return true;
    }

    if (req.method === "GET" && path === "/api/email/sent") {
      const data = await resendWithKey(box.apiKey, "GET", "/emails?limit=50");
      const remote = Array.isArray(data?.data) ? data.data.map((row) => listItem(row)) : [];
      const remoteIds = new Set(remote.map((r) => r.id));
      const local = loadOutbound()
        .filter((r) => r.mailboxId === box.id && (r.status === "failed" || (r.resendId && !remoteIds.has(r.resendId))))
        .map((r) =>
          listItem(
            {
              id: r.resendId || r.id,
              from: r.from,
              to: r.to,
              subject: r.subject,
              created_at: r.created_at,
              text: r.text,
            },
            {
              last_event: r.last_event || r.status,
              status: r.status,
              local: !r.resendId,
              error: r.error,
              attachment_count: Number(r.attachment_count || 0),
            },
          ),
        );
      json(res, 200, { data: [...local, ...remote] });
      return true;
    }

    const received = path.match(/^\/api\/email\/received\/([^/]+)$/);
    if (req.method === "GET" && received) {
      const data = await resendWithKey(box.apiKey, "GET", `/emails/receiving/${received[1]}`);
      const attachments = await listAttachments(box.apiKey, "receiving", received[1]);
      const meta = Array.isArray(data?.attachments) ? data.attachments.map(publicAtt) : [];
      const byId = new Map([...meta, ...attachments].map((a) => [a.id, a]));
      json(res, 200, {
        ...listItem(data, { last_event: "received", status: "received", attachment_count: byId.size }),
        html: data.html || "",
        text: data.text || "",
        bcc: data.bcc,
        reply_to: data.reply_to,
        attachments: [...byId.values()],
      });
      return true;
    }

    const sentOne = path.match(/^\/api\/email\/sent\/([^/]+)$/);
    if (req.method === "GET" && sentOne) {
      const local = loadOutbound().find((r) => r.id === sentOne[1] || r.resendId === sentOne[1]);
      if (local && (local.status === "failed" || !local.resendId)) {
        json(res, 200, {
          ...listItem(
            {
              id: local.id,
              from: local.from,
              to: local.to,
              cc: local.cc,
              subject: local.subject,
              created_at: local.created_at,
              text: local.text,
            },
            { last_event: "failed", status: "failed", local: true, error: local.error, attachment_count: Number(local.attachment_count || 0) },
          ),
          html: prettyHtml(local.text || ""),
          text: local.text || "",
          attachments: [],
        });
        return true;
      }
      const id = local?.resendId || sentOne[1];
      const data = await resendWithKey(box.apiKey, "GET", `/emails/${id}`);
      const attachments = await listAttachments(box.apiKey, "sent", id);
      json(res, 200, {
        ...listItem(data, { attachment_count: attachments.length }),
        html: data.html || "",
        text: data.text || "",
        bcc: data.bcc,
        reply_to: data.reply_to,
        attachments,
      });
      return true;
    }

    const file = path.match(/^\/api\/email\/attachments\/(receiving|sent)\/([^/]+)\/([^/]+)$/);
    if (req.method === "GET" && file) {
      const folder = file[1];
      const emailId = decodeURIComponent(file[2]);
      const attachmentId = decodeURIComponent(file[3]);
      const meta = await fetchAttachmentMeta(box.apiKey, folder, emailId, attachmentId);
      const url = downloadUrlOf(meta);
      if (!url) {
        json(res, 404, { error: "No download URL for this file" });
        return true;
      }
      const bin = await fetch(url);
      if (!bin.ok) {
        json(res, 502, { error: "Could not download attachment from mail provider" });
        return true;
      }
      const buf = Buffer.from(await bin.arrayBuffer());
      if (buf.length > 15 * 1024 * 1024) {
        json(res, 413, { error: "Attachment too large" });
        return true;
      }
      const name = meta.filename || meta.data?.filename || "file";
      const type = meta.content_type || meta.data?.content_type || bin.headers.get("content-type") || "application/octet-stream";
      const inline = String(type).startsWith("image/") || String(meta.content_disposition || "").includes("inline");
      sendFile(res, { body: buf, type, name, inline });
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
      const cc = String(input.cc || "")
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"));
      if (!to.includes("@") || !subject || !text) {
        json(res, 400, { error: "to, subject, and body are required" });
        return true;
      }
      const files = mailAttachments(input.attachments);
      const payload = {
        from: active.from,
        to: [to],
        subject,
        text,
        html: prettyHtml(text),
      };
      if (cc.length) payload.cc = cc;
      if (files.length) payload.attachments = files;
      if (input.replyTo) payload.reply_to = String(input.replyTo);
      const localId = `local-${randomUUID()}`;
      try {
        const data = await resendWithKey(active.apiKey, "POST", "/emails", payload);
        rememberOutbound({
          id: localId,
          resendId: data.id,
          mailboxId: active.id,
          from: active.from,
          to,
          cc,
          subject,
          text,
          created_at: new Date().toISOString(),
          status: "queued",
          last_event: "queued",
          attachment_count: files.length,
        });
        json(res, 200, { ...data, status: "queued", last_event: "queued" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        rememberOutbound({
          id: localId,
          mailboxId: active.id,
          from: active.from,
          to,
          cc,
          subject,
          text,
          created_at: new Date().toISOString(),
          status: "failed",
          last_event: "failed",
          error: message,
          attachment_count: files.length,
        });
        json(res, 502, { error: message, status: "failed", last_event: "failed", id: localId });
      }
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Email request failed" });
    return true;
  }
}

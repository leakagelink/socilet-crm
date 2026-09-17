import { json, originOk, readBody, setCors } from "./http-util.mjs";

const MAX_BODY = 512 * 1024;
const hits = new Map();

export function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.reset) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  row.n += 1;
  if (row.n <= max) return { ok: true, retryAfter: 0 };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((row.reset - now) / 1000)) };
}

export async function readJson(req, res) {
  const raw = await readBody(req, MAX_BODY);
  if (raw == null) {
    json(res, 413, { error: "Request too large" });
    return null;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return null;
  }
}

export function guardOrigin(req, res, env) {
  const origin = req.headers.origin || "";
  if (origin && !originOk(req, env)) {
    json(res, 403, { error: "Origin not allowed" });
    return false;
  }
  return true;
}

export function corsAndOptions(req, res, env) {
  setCors(req, res, env);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

export function passwordPolicy(password) {
  const p = String(password || "");
  if (p.length < 10 || p.length > 128) return "Password must be 10–128 characters";
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
    return "Password needs upper, lower, and a number";
  }
  return null;
}

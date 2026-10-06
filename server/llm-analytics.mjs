import { pickBestCopy, readJsonCopies, writeJsonCopies } from "./persist.mjs";
import { json, readBody } from "./http-util.mjs";
import { clientIp, rateLimit } from "./security.mjs";
import { requireApiUser } from "./auth-api.mjs";

const TZ = "Asia/Kolkata";
const SITES = new Set(["socilet.com", "socilet.in"]);

export const LLM_SOURCES = [
  { id: "chatgpt", label: "ChatGPT", host: /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i, ua: /ChatGPT-User|GPTBot|OAI-SearchBot/i, utm: /^(chatgpt|openai|gpt)$/i },
  { id: "copilot", label: "Copilot", host: /(^|\.)(copilot\.microsoft\.com)$/i, ua: /BingPreview/i, utm: /^(copilot|ms.?copilot)$/i },
  { id: "claude", label: "Claude", host: /(^|\.)(claude\.ai|anthropic\.com)$/i, ua: /ClaudeBot|anthropic-ai|Claude-User/i, utm: /^(claude|anthropic)$/i },
  { id: "grok", label: "Grok", host: /(^|\.)(grok\.com|grok\.x\.ai|x\.ai)$/i, ua: /Grok|xAI/i, utm: /^(grok|xai)$/i },
  { id: "gemini", label: "Gemini", host: /(^|\.)(gemini\.google\.com|bard\.google\.com)$/i, ua: /Google-Extended|GoogleOther/i, utm: /^(gemini|bard|google.?ai)$/i },
  { id: "perplexity", label: "Perplexity", host: /(^|\.)(perplexity\.ai)$/i, ua: /PerplexityBot|Perplexity/i, utm: /^perplexity$/i },
  { id: "deepseek", label: "DeepSeek", host: /(^|\.)(deepseek\.com|chat\.deepseek\.com)$/i, ua: /DeepSeek/i, utm: /^deepseek$/i },
  { id: "mistral", label: "Mistral", host: /(^|\.)(mistral\.ai|chat\.mistral\.ai|lechat\.mistral\.ai)$/i, ua: /Mistral/i, utm: /^(mistral|lechat)$/i },
  { id: "meta_ai", label: "Meta AI", host: /(^|\.)(meta\.ai)$/i, ua: /meta-externalagent|FacebookBot/i, utm: /^(meta.?ai|llama)$/i },
  { id: "kimi", label: "Kimi", host: /(^|\.)(kimi\.com|moonshot\.cn)$/i, ua: /Kimi|Moonshot/i, utm: /^(kimi|moonshot)$/i },
  { id: "you", label: "You.com", host: /(^|\.)(you\.com)$/i, ua: /YouBot/i, utm: /^you$/i },
  { id: "poe", label: "Poe", host: /(^|\.)(poe\.com)$/i, ua: /Poe/i, utm: /^poe$/i },
  { id: "phind", label: "Phind", host: /(^|\.)(phind\.com)$/i, ua: /Phind/i, utm: /^phind$/i },
  { id: "huggingchat", label: "HuggingChat", host: /$^/, ua: /HuggingFace/i, utm: /^(huggingchat|huggingface)$/i },
  { id: "character", label: "Character.AI", host: /(^|\.)(character\.ai)$/i, ua: /CharacterAI/i, utm: /^character/i },
  { id: "duck_ai", label: "Duck.ai", host: /(^|\.)(duck\.ai)$/i, ua: /DuckDuckBot/i, utm: /^(duck.?ai|ddg.?ai)$/i },
  { id: "apple_intelligence", label: "Apple Intelligence", host: /apple\.com/i, ua: /Applebot-Extended/i, utm: /^(apple.?intelligence|siri)$/i },
  { id: "other_ai", label: "Other AI", host: /$^/, ua: /AI2Bot|Bytespider|Amazonbot|CCBot|Diffbot|omgili/i, utm: /^(llm|ai|assistant)$/i },
];

function str(v) {
  return String(v ?? "").trim();
}

function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function hostOf(raw) {
  const s = str(raw);
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return s.replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

function siteOf(raw) {
  const h = hostOf(raw);
  if (SITES.has(h)) return h;
  return "";
}

export function classifyLlm({ referrer, ua, utm, href } = {}) {
  const refHost = hostOf(referrer || href);
  const agent = str(ua);
  const sourceUtm = str(utm).toLowerCase();
  for (const row of LLM_SOURCES) {
    if (sourceUtm && row.utm.test(sourceUtm)) return row.id;
  }
  for (const row of LLM_SOURCES) {
    if (agent && row.ua.test(agent)) return row.id;
  }
  if (refHost) {
    if (/^(chatgpt\.com|chat\.openai\.com)$/i.test(refHost)) return "chatgpt";
    if (/^copilot\.microsoft\.com$/i.test(refHost)) return "copilot";
    if (/^(claude\.ai|anthropic\.com)$/i.test(refHost)) return "claude";
    if (/^(grok\.com|grok\.x\.ai|x\.ai)$/i.test(refHost)) return "grok";
    if (/^(gemini\.google\.com|bard\.google\.com)$/i.test(refHost)) return "gemini";
    if (refHost === "bing.com" && /\/chat|copilot/i.test(str(referrer))) return "copilot";
    if (refHost === "x.com" && /\/i\/grok/i.test(str(referrer))) return "grok";
    if (refHost === "duckduckgo.com" && /duck\.ai|\/aichat/i.test(str(referrer))) return "duck_ai";
    if (refHost === "huggingface.co" && /\/chat/i.test(str(referrer))) return "huggingchat";
    for (const row of LLM_SOURCES) {
      if (row.host.test(refHost)) return row.id;
    }
  }
  return "";
}

function sourceLabel(id) {
  return LLM_SOURCES.find((s) => s.id === id)?.label || id || "Unknown";
}

function llmOriginOk(origin) {
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname.replace(/^www\./i, "").toLowerCase();
    return SITES.has(h) || h === "crm.proofvault.space" || h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

function setPublicCors(req, res) {
  const origin = str(req.headers.origin);
  if (origin && llmOriginOk(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  else if (!origin) res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

function emptyStore() {
  return { days: [], updated_at: null };
}

function loadStore() {
  const copies = readJsonCopies("llm-analytics.json").filter((c) => c.raw && typeof c.raw === "object" && !Array.isArray(c.raw));
  const best = pickBestCopy(copies, (c) => (Array.isArray(c.raw?.days) ? c.raw.days.length : 0) * 1e13 + (c.mtime || 0));
  if (!best?.raw) return emptyStore();
  return { days: Array.isArray(best.raw.days) ? best.raw.days : [], updated_at: best.raw.updated_at || null };
}

function saveStore(store) {
  store.updated_at = new Date().toISOString();
  const yearNow = Number(todayISO().slice(0, 4));
  store.days = store.days.filter((d) => Number(String(d.day || "").slice(0, 4)) >= yearNow - 3);
  writeJsonCopies("llm-analytics.json", store);
}

function bump(store, { day, site, source, kind, n = 1 }) {
  if (!day || !site || !source || n <= 0) return false;
  let row = store.days.find((d) => d.day === day && d.site === site && d.source === source);
  if (!row) {
    row = { day, site, source, impressions: 0, visits: 0, clicks: 0 };
    store.days.push(row);
  }
  if (kind === "impression") row.impressions += n;
  else if (kind === "visit") row.visits += n;
  else if (kind === "click") row.clicks += n;
  else return false;
  return true;
}

function parseQs(req) {
  const q = (req.url || "").split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

async function readHit(req) {
  const qs = parseQs(req);
  let body = {};
  if (req.method === "POST") {
    const raw = await readBody(req, 16 * 1024);
    if (raw && str(raw)) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
    }
  }
  const utm = str(body.utm || body.utm_source || qs.utm || qs.utm_source);
  const referrer = str(body.referrer || body.ref || qs.ref || req.headers.referer);
  const href = str(body.href || qs.href);
  const ua = str(body.ua || req.headers["user-agent"]);
  const site = siteOf(body.site || qs.site || referrer) || siteOf(req.headers.origin) || siteOf(req.headers.referer);
  const source = classifyLlm({ referrer, ua, utm, href }) || str(body.source || qs.source);
  let kind = str(body.kind || qs.kind || "impression").toLowerCase();
  if (!["impression", "visit", "click"].includes(kind)) kind = "impression";
  const path = str(body.path || qs.path).slice(0, 240);
  return { site, source, kind, path, referrer, ua, utm };
}

function inRange(day, from, to) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function mondayOf(day) {
  const d = new Date(`${day}T12:00:00+05:30`);
  const wd = d.getDay();
  d.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1));
  return todayISO(d);
}

function emptyTotals() {
  return { impressions: 0, visits: 0, clicks: 0 };
}

function addTo(a, b) {
  a.impressions += b.impressions || 0;
  a.visits += b.visits || 0;
  a.clicks += b.clicks || 0;
}

function withCtr(row) {
  const impressions = row.impressions || 0;
  const clicks = row.clicks || 0;
  return { ...row, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0 };
}

function summarize(days, from, to) {
  const filtered = days.filter((d) => inRange(d.day, from, to));
  const totals = emptyTotals();
  const bySource = new Map();
  const bySite = new Map();
  const daily = new Map();
  const weekly = new Map();
  const monthly = new Map();
  const yearly = new Map();
  for (const d of filtered) {
    addTo(totals, d);
    const src = bySource.get(d.source) || { source: d.source, label: sourceLabel(d.source), ...emptyTotals() };
    addTo(src, d);
    bySource.set(d.source, src);
    const site = bySite.get(d.site) || { site: d.site, ...emptyTotals() };
    addTo(site, d);
    bySite.set(d.site, site);
    const day = daily.get(d.day) || { day: d.day, ...emptyTotals() };
    addTo(day, d);
    daily.set(d.day, day);
    const wk = mondayOf(d.day);
    const week = weekly.get(wk) || { week: wk, ...emptyTotals() };
    addTo(week, d);
    weekly.set(wk, week);
    const mo = d.day.slice(0, 7);
    const month = monthly.get(mo) || { month: mo, ...emptyTotals() };
    addTo(month, d);
    monthly.set(mo, month);
    const yr = d.day.slice(0, 4);
    const year = yearly.get(yr) || { year: yr, ...emptyTotals() };
    addTo(year, d);
    yearly.set(yr, year);
  }
  const sortK = (a, b) => b.impressions - a.impressions || b.visits - a.visits;
  return {
    totals: withCtr(totals),
    bySource: [...bySource.values()].map(withCtr).sort(sortK),
    bySite: [...bySite.values()].map(withCtr).sort(sortK),
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    weekly: [...weekly.values()].sort((a, b) => a.week.localeCompare(b.week)),
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    yearly: [...yearly.values()].sort((a, b) => a.year.localeCompare(b.year)),
  };
}

function periods(days) {
  const today = todayISO();
  const d = new Date(`${today}T12:00:00+05:30`);
  const weekFrom = mondayOf(today);
  const monthFrom = today.slice(0, 7) + "-01";
  const yearFrom = today.slice(0, 4) + "-01-01";
  const yest = new Date(d);
  yest.setDate(yest.getDate() - 1);
  const yesterday = todayISO(yest);
  return {
    today: summarize(days, today, today).totals,
    yesterday: summarize(days, yesterday, yesterday).totals,
    week: summarize(days, weekFrom, today).totals,
    month: summarize(days, monthFrom, today).totals,
    year: summarize(days, yearFrom, today).totals,
  };
}

function trackerJs(origin) {
  const base = origin || "https://crm.proofvault.space";
  return `(() => {
  const BASE = ${JSON.stringify(base)};
  const END = BASE + "/api/llm/hit";
  const host = (location.hostname || "").replace(/^www\\./i, "").toLowerCase();
  if (host !== "socilet.com" && host !== "socilet.in") return;
  const params = new URLSearchParams(location.search);
  const utm = params.get("utm_source") || params.get("ref") || "";
  const body = (kind, extra) => JSON.stringify({
    kind,
    site: host,
    path: location.pathname.slice(0, 220),
    referrer: document.referrer || "",
    utm,
    href: extra || location.href
  });
  const send = (kind, extra) => {
    try {
      const payload = body(kind, extra);
      if (navigator.sendBeacon) navigator.sendBeacon(END, payload);
      else fetch(END, { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) {}
  };
  send("impression");
  try {
    if (!sessionStorage.getItem("socilet.llm.visit")) {
      sessionStorage.setItem("socilet.llm.visit", "1");
      send("visit");
    }
  } catch (e) { send("visit"); }
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a,[data-llm-click]") : null;
    if (!a) return;
    send("click", a.href || a.getAttribute("data-llm-click") || "");
  }, { capture: true });
})();`;
}

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function ingest(req, hit) {
  if (!hit.site || !SITES.has(hit.site)) return { ok: false, error: "site" };
  if (!hit.source) return { ok: true, skipped: "not-llm" };
  const ip = clientIp(req);
  const lim = rateLimit(`llm:${ip}`, 80, 60_000);
  if (!lim.ok) return { ok: false, error: "rate", retryAfter: lim.retryAfter };
  const store = loadStore();
  const changed = bump(store, { day: todayISO(), site: hit.site, source: hit.source, kind: hit.kind, n: 1 });
  if (changed) saveStore(store);
  return { ok: true, source: hit.source, kind: hit.kind };
}

export async function handleLlmRequest(req, res, env = process.env) {
  const path = (req.url || "/").split("?")[0];
  if (!path.startsWith("/api/llm")) return false;

  if (req.method === "OPTIONS") {
    setPublicCors(req, res);
    res.statusCode = 204;
    res.end();
    return true;
  }

  if ((req.method === "GET" || req.method === "POST") && (path === "/api/llm/hit" || path === "/api/llm/pixel.gif")) {
    setPublicCors(req, res);
    const origin = str(req.headers.origin);
    if (origin && !llmOriginOk(origin)) {
      json(res, 403, { error: "Origin not allowed" });
      return true;
    }
    const hit = await readHit(req);
    const result = ingest(req, hit);
    if (path === "/api/llm/pixel.gif") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.end(PIXEL);
      return true;
    }
    if (!result.ok && result.error === "rate") {
      json(res, 429, { error: "Slow down", retryAfter: result.retryAfter });
      return true;
    }
    json(res, 200, { ok: true, skipped: result.skipped || null });
    return true;
  }

  if (req.method === "GET" && path === "/api/llm/tracker.js") {
    setPublicCors(req, res);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(trackerJs("https://crm.proofvault.space"));
    return true;
  }

  const { corsAndOptions, guardOrigin } = await import("./security.mjs");
  if (corsAndOptions(req, res, env)) return true;
  if (!guardOrigin(req, res, env)) return true;
  const user = await requireApiUser(req, res, env);
  if (!user) return true;

  const store = loadStore();
  const qs = parseQs(req);

  if (req.method === "GET" && path === "/api/llm/stats") {
    const from = str(qs.from);
    const to = str(qs.to);
    const site = siteOf(qs.site);
    const days = site ? store.days.filter((d) => d.site === site) : store.days;
    json(res, 200, {
      data: {
        sources: LLM_SOURCES.map((s) => ({ id: s.id, label: s.label })),
        periods: periods(days),
        range: summarize(days, from, to),
        updated_at: store.updated_at,
      },
    });
    return true;
  }

  if (req.method === "POST" && path === "/api/llm/adjust") {
    if (user.role !== "admin") {
      json(res, 403, { error: "Admin only" });
      return true;
    }
    const { readJson } = await import("./security.mjs");
    const input = await readJson(req, res);
    if (!input) return true;
    const site = siteOf(input.site);
    const source = str(input.source);
    const day = str(input.day).slice(0, 10) || todayISO();
    if (!site || !SITES.has(site) || !source) {
      json(res, 400, { error: "site and source required" });
      return true;
    }
    const nImp = Math.max(0, Number(input.impressions) || 0);
    const nVis = Math.max(0, Number(input.visits) || 0);
    const nClk = Math.max(0, Number(input.clicks) || 0);
    bump(store, { day, site, source, kind: "impression", n: nImp });
    bump(store, { day, site, source, kind: "visit", n: nVis });
    bump(store, { day, site, source, kind: "click", n: nClk });
    saveStore(store);
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: "Not found" });
  return true;
}

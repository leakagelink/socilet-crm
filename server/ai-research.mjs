import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import { maskKey } from "./ai-providers.mjs";

const UA = "SociletOS/1.0 (+https://crm.proofvault.space; research)";
const FETCH_MS = 12_000;

export function researchStore(state) {
  if (!state.settings) state.settings = {};
  if (!state.settings.ai || typeof state.settings.ai !== "object") state.settings.ai = {};
  if (!state.settings.ai.research || typeof state.settings.ai.research !== "object") {
    state.settings.ai.research = { tavily: "", brave: "", serper: "" };
  }
  const r = state.settings.ai.research;
  if (typeof r.tavily !== "string") r.tavily = "";
  if (typeof r.brave !== "string") r.brave = "";
  if (typeof r.serper !== "string") r.serper = "";
  return r;
}

function keys(env = process.env) {
  const state = loadCrmState();
  const stored = researchStore(state);
  return {
    tavily: String(env.TAVILY_API_KEY || stored.tavily || "").trim(),
    brave: String(env.BRAVE_SEARCH_API_KEY || env.BRAVE_API_KEY || stored.brave || "").trim(),
    serper: String(env.SERPER_API_KEY || stored.serper || "").trim(),
  };
}

export function researchPublic(env = process.env) {
  const k = keys(env);
  return {
    tavily: { has_key: Boolean(k.tavily), key_hint: maskKey(k.tavily) },
    brave: { has_key: Boolean(k.brave), key_hint: maskKey(k.brave) },
    serper: { has_key: Boolean(k.serper), key_hint: maskKey(k.serper) },
    fallback: ["wikipedia", "duckduckgo"],
    note: "Tavily / Brave / Serper = paid search. Bina key ke Wikipedia + DuckDuckGo chalega, kam deep.",
  };
}

export function patchResearchKeys(input) {
  const state = loadCrmState();
  const r = researchStore(state);
  for (const name of ["tavily", "brave", "serper"]) {
    if (input[name] == null) continue;
    const v = String(input[name]).trim();
    if (v === "") r[name] = "";
    else r[name] = v;
  }
  saveCrmState(state);
  return researchPublic();
}

function abortMs(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function fetchText(url, init = {}, ms = FETCH_MS) {
  const { signal, done } = abortMs(ms);
  try {
    return await fetch(url, {
      ...init,
      signal,
      redirect: init.redirect || "manual",
      headers: { "User-Agent": UA, Accept: "application/json,text/html;q=0.9,*/*;q=0.5", ...(init.headers || {}) },
    });
  } finally {
    done();
  }
}

export function publicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".corp")) {
    return null;
  }
  if (host.includes(":")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const p = host.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0 || p[0] === 255) return null;
    if (p[0] === 192 && p[1] === 168) return null;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return null;
    if (p[0] === 169 && p[1] === 254) return null;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return null;
  }
  return u.toString();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function source(title, url, snippet) {
  const href = publicHttpUrl(url);
  if (!href) return null;
  return {
    title: String(title || href).slice(0, 180),
    url: href,
    href,
    snippet: String(snippet || "").replace(/\s+/g, " ").trim().slice(0, 420),
    kind: "source",
    module: "research",
  };
}

async function searchTavily(key, query, advanced) {
  const res = await fetchText("https://api.tavily.com/search", {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: advanced ? "advanced" : "basic",
      include_answer: true,
      max_results: advanced ? 8 : 5,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Tavily HTTP ${res.status}`);
  const sources = (data.results || []).map((r) => source(r.title, r.url, r.content || r.snippet)).filter(Boolean);
  return { engine: "tavily", answer: String(data.answer || "").slice(0, 1200), sources };
}

async function searchBrave(key, query, advanced) {
  const count = advanced ? 8 : 5;
  const res = await fetchText(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { "X-Subscription-Token": key, Accept: "application/json" }, redirect: "follow" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Brave HTTP ${res.status}`);
  const sources = (data.web?.results || []).map((r) => source(r.title, r.url, r.description)).filter(Boolean);
  return { engine: "brave", answer: "", sources };
}

async function searchSerper(key, query, advanced) {
  const res = await fetchText("https://google.serper.dev/search", {
    method: "POST",
    redirect: "follow",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: advanced ? 10 : 6 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Serper HTTP ${res.status}`);
  const organic = data.organic || [];
  const sources = organic.map((r) => source(r.title, r.link, r.snippet)).filter(Boolean);
  const answer = String(data.answerBox?.answer || data.answerBox?.snippet || "").slice(0, 800);
  return { engine: "serper", answer, sources };
}

async function searchWikipedia(query) {
  const res = await fetchText(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&srlimit=5`,
    { redirect: "follow" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const hits = data.query?.search || [];
  const sources = [];
  for (const h of hits.slice(0, 4)) {
    const title = String(h.title || "");
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    sources.push(source(title, url, stripHtml(h.snippet || "")));
  }
  let answer = "";
  if (hits[0]?.title) {
    const sum = await fetchText(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title)}`,
      { redirect: "follow" },
    );
    const body = await sum.json().catch(() => ({}));
    answer = String(body.extract || "").slice(0, 900);
    if (body.content_urls?.desktop?.page) {
      const first = source(body.title, body.content_urls.desktop.page, answer);
      if (first) sources.unshift(first);
    }
  }
  return { engine: "wikipedia", answer, sources: sources.filter(Boolean) };
}

async function searchDuckDuckGo(query) {
  const instant = await fetchText(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { redirect: "follow" },
  );
  const data = await instant.json().catch(() => ({}));
  const sources = [];
  if (data.AbstractURL) sources.push(source(data.Heading || query, data.AbstractURL, data.AbstractText));
  for (const t of data.RelatedTopics || []) {
    if (t.FirstURL) sources.push(source(stripHtml(t.Text || "").slice(0, 80), t.FirstURL, t.Text));
    for (const n of t.Topics || []) {
      if (n.FirstURL) sources.push(source(stripHtml(n.Text || "").slice(0, 80), n.FirstURL, n.Text));
    }
  }
  const htmlRes = await fetchText("https://html.duckduckgo.com/html/", {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `q=${encodeURIComponent(query)}`,
  });
  const html = await htmlRes.text().catch(() => "");
  const re = /uddg=([^&"]+)/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) && sources.length < 8) {
    let decoded = m[1];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep */
    }
    if (seen.has(decoded)) continue;
    seen.add(decoded);
    const row = source(decoded.replace(/^https?:\/\//, "").slice(0, 60), decoded, "");
    if (row) sources.push(row);
  }
  return {
    engine: "duckduckgo",
    answer: String(data.AbstractText || "").slice(0, 800),
    sources: sources.filter(Boolean),
  };
}

async function extractPages(urls, limit) {
  const out = [];
  for (const url of urls.slice(0, limit)) {
    const href = publicHttpUrl(url);
    if (!href) continue;
    try {
      const res = await fetchText(href, { redirect: "manual" }, 8_000);
      if (res.status >= 300 && res.status < 400) {
        const loc = publicHttpUrl(res.headers.get("location") || "");
        if (!loc) continue;
        const hop = await fetchText(loc, { redirect: "manual" }, 8_000);
        if (!hop.ok) continue;
        const html = await hop.text();
        out.push({ href: loc, title: loc, text: stripHtml(html).slice(0, 2800), kind: "source", module: "research" });
        continue;
      }
      if (!res.ok) continue;
      const type = res.headers.get("content-type") || "";
      if (!/html|xml|text|json/i.test(type)) continue;
      const html = await res.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || href;
      out.push({
        href,
        url: href,
        title: stripHtml(title).slice(0, 140),
        text: stripHtml(html).slice(0, 2800),
        kind: "source",
        module: "research",
      });
    } catch {
      /* skip blocked pages */
    }
  }
  return out;
}

export async function fetchPublicPages(urls, limit = 2) {
  return extractPages(urls, limit);
}

export async function runWebResearch(env, { query, depth, focus }) {
  const q = String(query || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (q.length < 3) return { ok: false, error: "Research query too short." };
  const advanced = String(depth || "").toLowerCase() === "advanced" || /deep|full|expert/i.test(String(depth || ""));
  const k = keys(env);
  const attempts = [];
  const tryOne = async (name, fn) => {
    try {
      const out = await fn();
      if (out.sources?.length) return out;
      attempts.push(`${name}: no results`);
      return null;
    } catch (err) {
      attempts.push(`${name}: ${err instanceof Error ? err.message : "fail"}`);
      return null;
    }
  };

  let hit =
    (k.tavily && (await tryOne("tavily", () => searchTavily(k.tavily, q, advanced)))) ||
    (k.brave && (await tryOne("brave", () => searchBrave(k.brave, q, advanced)))) ||
    (k.serper && (await tryOne("serper", () => searchSerper(k.serper, q, advanced)))) ||
    (await tryOne("wikipedia", () => searchWikipedia(q))) ||
    (await tryOne("duckduckgo", () => searchDuckDuckGo(q)));

  if (!hit) {
    return {
      ok: false,
      error: "No research results. Add Tavily, Brave Search, or Serper on AI Keys, or try a sharper query.",
      attempts,
    };
  }

  const seen = new Set();
  hit.sources = (hit.sources || []).filter((s) => {
    if (!s?.href || seen.has(s.href)) return false;
    seen.add(s.href);
    return true;
  }).slice(0, advanced ? 10 : 6);

  let extracted = [];
  if (advanced) {
    extracted = await extractPages(
      hit.sources.map((s) => s.href),
      4,
    );
  }

  const focusNote = String(focus || "").trim();
  return {
    ok: true,
    query: q,
    focus: focusNote || "general",
    depth: advanced ? "advanced" : "quick",
    engine: hit.engine,
    answer: hit.answer || "",
    sources: hit.sources,
    extracted,
    attempts,
    caveats: [
      "Web is not CRM. Do not treat these snippets as invoices, clients, or balances.",
      "Cite sources with markdown links. If sources disagree, say so.",
      "Laws, GST, visas, and prices change — flag that the user should verify the original page.",
    ],
  };
}

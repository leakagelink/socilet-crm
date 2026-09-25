import { fetchPublicPages } from "./ai-research.mjs";

const CANON = {
  brand: "Socilet",
  founder_role: "Technology entrepreneur — this CRM is the founder operating system, not a generic chatbot product page.",
  domains: {
    marketing: "https://socilet.com",
    india: "https://socilet.in",
    crm: "https://crm.proofvault.space",
    email: "socilet.in",
  },
  product: {
    name: "Socilet CRM / Socilet OS",
    what: "Internal CRM for projects, mail, invoices, quotations, tasks, meetings, cash, lend/borrow, and a founder AI agent.",
    live: "https://crm.proofvault.space",
    roles: ["admin", "designer", "accountant"],
    tone: "Premium cream-and-gold. Direct. Evidence over slogans.",
  },
  rules: [
    "Do not invent Socilet services, pricing, case studies, or team bios that are not in this pack, live site extracts, CRM, or web_research sources.",
    "socilet.com and socilet.in are the public sites. crm.proofvault.space is the live CRM.",
    "If the live extract is empty or stale, say so and offer web_research on those URLs.",
  ],
};

let cache = { at: 0, live: [] };

async function liveSites() {
  if (Date.now() - cache.at < 6 * 60 * 60 * 1000 && cache.live.length) return cache.live;
  try {
    const pages = await Promise.race([
      fetchPublicPages(["https://socilet.com", "https://socilet.in", "https://www.socilet.com"], 3),
      new Promise((resolve) => setTimeout(() => resolve([]), 7000)),
    ]);
    cache = { at: Date.now(), live: Array.isArray(pages) ? pages : [] };
  } catch {
    cache = { at: Date.now(), live: [] };
  }
  return cache.live;
}

export async function companyPack(refresh = false) {
  if (refresh) cache = { at: 0, live: [] };
  const live = await liveSites();
  return {
    ...CANON,
    live_sites: live.map((p) => ({
      href: p.href,
      title: p.title,
      extract: String(p.text || "").slice(0, 1800),
    })),
    live_ok: live.length > 0,
    fetched_at: cache.at ? new Date(cache.at).toISOString() : null,
  };
}

export function companyPackSync() {
  return {
    ...CANON,
    live_sites: cache.live.map((p) => ({
      href: p.href,
      title: p.title,
      extract: String(p.text || "").slice(0, 1800),
    })),
    live_ok: cache.live.length > 0,
    fetched_at: cache.at ? new Date(cache.at).toISOString() : null,
  };
}

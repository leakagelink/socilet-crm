import { apiJson } from "@/lib/apiBase";

export type LlmCounts = {
  impressions: number;
  visits: number;
  clicks: number;
  ctr: number;
};

export type LlmStats = {
  sources: { id: string; label: string }[];
  periods: {
    today: LlmCounts;
    yesterday: LlmCounts;
    week: LlmCounts;
    month: LlmCounts;
    year: LlmCounts;
  };
  range: {
    totals: LlmCounts;
    bySource: Array<LlmCounts & { source: string; label: string }>;
    bySite: Array<LlmCounts & { site: string }>;
    daily: Array<LlmCounts & { day: string }>;
    weekly: Array<LlmCounts & { week: string }>;
    monthly: Array<LlmCounts & { month: string }>;
    yearly: Array<LlmCounts & { year: string }>;
  };
  updated_at: string | null;
};

export function fetchLlmStats(from = "", to = "", site = "") {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (site) q.set("site", site);
  const tail = q.toString() ? `?${q}` : "";
  return apiJson<{ data: LlmStats }>(`/api/llm/stats${tail}`);
}

export function logLlmManual(input: {
  day: string;
  site: string;
  source: string;
  impressions: number;
  visits: number;
  clicks: number;
}) {
  return apiJson<{ ok: boolean }>("/api/llm/adjust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export const LLM_TRACK_SNIPPET = `<script src="https://crm.proofvault.space/api/llm/tracker.js" defer></script>
<noscript><img src="https://crm.proofvault.space/api/llm/pixel.gif?site=socilet.com" width="1" height="1" alt="" /></noscript>`;

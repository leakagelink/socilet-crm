import { apiJson, apiFetch, ApiError } from "@/lib/apiBase";

export type BriefItem = {
  impact: number;
  why: string;
  href: string;
  title: string;
};

export type DailyBrief = {
  generated_at: string;
  counts: {
    open_tasks: number;
    running_projects: number;
    overdue_tasks: number;
    invoices_due: number;
    reminders_due: number;
  };
  attention: BriefItem[];
  do_not_spend_time_on?: string[];
  stalled_projects?: Record<string, unknown>[];
  collection_projects?: Record<string, unknown>[];
  invoices_due?: Record<string, unknown>[];
};

export type ConfirmNeed = {
  needs_confirmation: true;
  token: string;
  preview: Record<string, unknown>;
  warning?: string;
};

export type AgentSessionMeta = {
  id: string;
  title: string;
  updated_at: string;
  created_at?: string;
  preview: string;
  turns: number;
  pinned?: boolean;
};

export type AgentFile = {
  id: string;
  name: string;
  mime: string;
  kind: string;
  bytes?: number;
};

export type AgentLink = { href: string; title: string; kind?: string };

export type AgentMessage = { role: "user" | "assistant"; content: string; at?: string; files?: AgentFile[]; links?: AgentLink[] };

export type AiTokenBucket = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  calls?: number;
  errors?: number;
  last_at?: string | null;
};

export type AiProvider = {
  id: string;
  name: string;
  base_url: string;
  key_hint: string;
  has_key: boolean;
  enabled: boolean;
  model: string;
  reason_model: string;
  image_model?: string;
  priority: number;
  cooling: boolean;
  cooldown_until?: string | null;
  last_error?: string;
  usage?: AiTokenBucket;
};

export type AiUsageSummary = {
  total: AiTokenBucket;
  today: AiTokenBucket;
  month: AiTokenBucket;
  recent_days: Array<{ date: string } & AiTokenBucket>;
  providers: Array<{
    id: string;
    name: string;
    enabled: boolean;
    cooling: boolean;
    model?: string;
    reason_model?: string;
    usage?: AiTokenBucket;
  }>;
  models?: Array<{ id: string } & AiTokenBucket>;
};

export async function aiStatus() {
  return apiJson<{
    data: {
      configured: boolean;
      model: string;
      reason_model: string;
      provider?: string | null;
      providers?: number;
      usage?: AiUsageSummary;
    };
  }>("/api/ai/status");
}

export async function fetchBrief() {
  return apiJson<{ data: DailyBrief; llm: boolean }>("/api/ai/brief");
}

export async function listAgentSessions() {
  return apiJson<{ data: AgentSessionMeta[] }>("/api/ai/sessions");
}

export async function createAgentSession() {
  return apiJson<{ data: AgentSessionMeta }>("/api/ai/sessions", { method: "POST", body: "{}" });
}

export async function getAgentSession(id: string) {
  return apiJson<{ data: AgentSessionMeta & { messages: AgentMessage[] } }>(`/api/ai/sessions/${id}`);
}

export async function renameAgentSession(id: string, title: string) {
  return apiJson<{ data: AgentSessionMeta }>(`/api/ai/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function pinAgentSession(id: string, pinned: boolean) {
  return apiJson<{ data: AgentSessionMeta }>(`/api/ai/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
}

export async function deleteAgentSession(id: string) {
  return apiJson<{ ok: boolean }>(`/api/ai/sessions/${id}`, { method: "DELETE" });
}

export type AgentChatResult = {
  reply: string;
  mode?: string;
  confirmations: ConfirmNeed[];
  files?: AgentFile[];
  links?: AgentLink[];
  sessionId: string;
};

export async function sendAgentChat(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
  extra?: { model?: string; attachments?: { name: string; mime: string; text?: string; dataUrl?: string }[] },
) {
  return apiJson<{ data: AgentChatResult }>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, sessionId, model: extra?.model, attachments: extra?.attachments }),
    signal,
  });
}

export async function sendAgentChatStream(
  message: string,
  sessionId: string | undefined,
  signal: AbortSignal | undefined,
  extra: { model?: string; attachments?: { name: string; mime: string; text?: string; dataUrl?: string }[] },
  onDelta: (chunk: string) => void,
): Promise<AgentChatResult> {
  const res = await apiFetch("/api/ai/chat/stream", {
    method: "POST",
    body: JSON.stringify({ message, sessionId, model: extra?.model, attachments: extra?.attachments }),
    signal,
  });
  const type = res.headers.get("content-type") || "";
  if (!type.includes("ndjson")) {
    const raw = await res.text();
    let parsed: { error?: string; data?: AgentChatResult } = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) throw new ApiError(parsed.error || res.statusText, res.status);
    if (!parsed.data) throw new ApiError("Empty AI reply", res.status);
    return parsed.data;
  }
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("No stream", 502);
  const dec = new TextDecoder();
  let buf = "";
  let done: AgentChatResult | null = null;
  let streamError = "";
  while (true) {
    const { done: closed, value } = await reader.read();
    if (closed) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let row: { type?: string; text?: string; error?: string; data?: AgentChatResult };
      try {
        row = JSON.parse(t);
      } catch {
        continue;
      }
      if (row.type === "delta" && row.text) onDelta(row.text);
      if (row.type === "error") streamError = row.error || "AI failed";
      if (row.type === "done" && row.data) done = row.data;
    }
  }
  if (streamError) throw new ApiError(streamError, 502);
  if (!done) throw new ApiError("Empty AI reply", 502);
  return done;
}

export async function fetchAiCatalog() {
  return apiJson<{ data: { id: string; provider: string; provider_id: string }[]; usage: AiUsageSummary }>("/api/ai/catalog");
}

export async function listAgentFiles() {
  return apiJson<{ data: AgentFile[] }>("/api/ai/files");
}

export async function downloadAgentFile(id: string) {
  const res = await apiFetch(`/api/ai/files/${id}`);
  if (!res.ok) throw new ApiError("Download failed", res.status);
  const blob = await res.blob();
  const raw = res.headers.get("content-disposition") || "";
  const name = raw.match(/filename="([^"]+)"/)?.[1] || "download";
  return { blob, name, mime: res.headers.get("content-type") || blob.type };
}

export function saveBlobFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2_000);
}

export async function confirmAgentAction(token: string) {
  return apiJson<{ ok: boolean; error?: string; data?: unknown }>("/api/ai/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function fetchMemory() {
  return apiJson<{ data: { user: { id: string; text: string }[]; business: { id: string; text: string }[]; work: { id: string; text: string }[] } }>(
    "/api/ai/memory",
  );
}

export async function listAiProviders() {
  return apiJson<{ data: AiProvider[]; preset: { name: string; base_url: string; model: string; reason_model: string } }>("/api/ai/providers");
}

export async function addAiProvider(body: {
  name: string;
  base_url: string;
  key: string;
  model?: string;
  reason_model?: string;
  image_model?: string;
  priority?: number;
}) {
  return apiJson<{ data: AiProvider }>("/api/ai/providers", { method: "POST", body: JSON.stringify(body) });
}

export async function patchAiProvider(id: string, body: Record<string, unknown>) {
  return apiJson<{ data: AiProvider }>(`/api/ai/providers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteAiProvider(id: string) {
  return apiJson<{ ok: boolean }>(`/api/ai/providers/${id}`, { method: "DELETE" });
}

export async function fetchAiProviderModels(id: string) {
  return apiJson<{ data: string[] }>(`/api/ai/providers/${id}/models`);
}

export async function fetchAiUsage() {
  return apiJson<{ data: AiUsageSummary }>("/api/ai/usage");
}

export type ResearchKeysStatus = {
  tavily: { has_key: boolean; key_hint: string };
  brave: { has_key: boolean; key_hint: string };
  serper: { has_key: boolean; key_hint: string };
  fallback: string[];
  note?: string;
};

export async function fetchResearchKeys() {
  return apiJson<{ data: ResearchKeysStatus }>("/api/ai/research");
}

export async function patchResearchKeys(body: { tavily?: string; brave?: string; serper?: string }) {
  return apiJson<{ data: ResearchKeysStatus }>("/api/ai/research", { method: "PATCH", body: JSON.stringify(body) });
}

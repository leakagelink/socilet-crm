import { apiJson } from "@/lib/apiBase";

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

export async function aiStatus() {
  return apiJson<{ data: { configured: boolean; model: string; reason_model: string } }>("/api/ai/status");
}

export async function fetchBrief() {
  return apiJson<{ data: DailyBrief; llm: boolean }>("/api/ai/brief");
}

export async function sendAgentChat(message: string) {
  return apiJson<{ data: { reply: string; mode: string; confirmations: ConfirmNeed[] } }>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
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

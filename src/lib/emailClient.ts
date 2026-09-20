import { apiFetch } from "@/lib/apiBase";

export type Mailbox = {
  id: string;
  label: string;
  from: string;
  domain: string;
  keyHint: string;
  connected: boolean;
  lastError?: string | null;
};

export async function emailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const raw = await res.text();
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) {
    throw new Error(
      "Email server nahi chal raha. Live par Hostinger start command `node server.mjs` hona chahiye.",
    );
  }
  const data = (raw ? JSON.parse(raw) : {}) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function mailboxQuery(mailboxId: string, path: string) {
  const u = new URL(path, window.location.origin);
  if (mailboxId) u.searchParams.set("mailbox", mailboxId);
  return u.pathname + u.search;
}

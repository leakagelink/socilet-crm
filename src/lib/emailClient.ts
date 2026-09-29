import { apiFetch } from "@/lib/apiBase";
import type { MailDetail, MailListItem } from "@/lib/mailView";

export type Mailbox = {
  id: string;
  label: string;
  from: string;
  domain: string;
  keyHint: string;
  connected: boolean;
  lastError?: string | null;
};

export type { MailDetail, MailListItem };

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

export async function emailFile(path: string) {
  const res = await apiFetch(path);
  if (!res.ok) {
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Attachment download failed");
    }
    throw new Error("Attachment download failed");
  }
  const blob = await res.blob();
  const disp = res.headers.get("content-disposition") || "";
  const named = /filename="?([^"]+)"?/i.exec(disp)?.[1];
  return { blob, url: URL.createObjectURL(blob), type: blob.type, name: named || "file" };
}

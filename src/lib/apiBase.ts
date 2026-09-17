import { Capacitor } from "@capacitor/core";

export const LIVE_ORIGIN = "https://crm.proofvault.space";

export function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (Capacitor.isNativePlatform()) return `${LIVE_ORIGIN}${p}`;
  return p;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const type = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!type.includes("json")) throw new Error("API did not return JSON");
  const data = (raw ? JSON.parse(raw) : {}) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

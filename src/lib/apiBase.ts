import { Capacitor } from "@capacitor/core";

export const LIVE_ORIGIN = "https://crm.proofvault.space";

const TOKEN_KEY = "socilet.token";
const VAULT_KEY = "socilet.vault";

export function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (Capacitor.isNativePlatform()) return `${LIVE_ORIGIN}${p}`;
  return p;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function getVaultToken() {
  try {
    return sessionStorage.getItem(VAULT_KEY);
  } catch {
    return null;
  }
}

export function setVaultToken(token: string | null) {
  try {
    if (!token) sessionStorage.removeItem(VAULT_KEY);
    else sessionStorage.setItem(VAULT_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const vault = getVaultToken();
  if (vault) headers.set("X-Vault-Token", vault);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(apiUrl(path), { ...init, headers });
  if (
    res.status === 401 &&
    (path.startsWith("/api/crm") || path.startsWith("/api/email") || path.startsWith("/api/ai") || path === "/api/auth/me")
  ) {
    setToken(null);
    try {
      localStorage.removeItem("socilet.session");
    } catch {
      /* ignore */
    }
  }
  return res;
}

export class ApiError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status = 400, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const type = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!type.includes("json")) throw new Error("API did not return JSON");
  const data = (raw ? JSON.parse(raw) : {}) as T & { error?: string; retryAfter?: number };
  if (!res.ok) {
    throw new ApiError(data.error || res.statusText, res.status, Number(data.retryAfter) || 0);
  }
  return data;
}

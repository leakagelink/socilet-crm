import { apiJson, getToken, setToken } from "@/lib/apiBase";
import type { RoleName } from "@/lib/db";

const KEY = "socilet.session";

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  role: RoleName;
  totpEnabled: boolean;
};

export type LoginResult =
  | { needsTotp: true; ticket: string }
  | { needsTotp?: false; session: Session };

function toSession(user: {
  userId: string;
  email: string;
  fullName: string;
  role: RoleName;
  totpEnabled?: boolean;
}): Session {
  return {
    userId: user.userId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    totpEnabled: Boolean(user.totpEnabled),
  };
}

export function readSession(): Session | null {
  if (!getToken()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null) {
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

function applyAuth(token: string, user: Session) {
  setToken(token);
  writeSession(user);
  return user;
}

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const data = await apiJson<{
    needsTotp?: boolean;
    ticket?: string;
    token?: string;
    user?: Session;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.needsTotp && data.ticket) return { needsTotp: true, ticket: data.ticket };
  if (!data.token || !data.user) throw new Error("Sign-in failed");
  return { session: applyAuth(data.token, toSession(data.user)) };
}

export async function verifyTotpLogin(ticket: string, code: string): Promise<Session> {
  const data = await apiJson<{ token?: string; user?: Session }>("/api/auth/totp", {
    method: "POST",
    body: JSON.stringify({ ticket, code }),
  });
  if (!data.token || !data.user) throw new Error("Invalid authenticator code");
  return applyAuth(data.token, toSession(data.user));
}

export async function refreshSession(): Promise<Session | null> {
  if (!getToken()) {
    writeSession(null);
    return null;
  }
  try {
    const data = await apiJson<{ user: Session }>("/api/auth/me");
    const session = toSession(data.user);
    writeSession(session);
    return session;
  } catch {
    setToken(null);
    writeSession(null);
    return null;
  }
}

export async function signOut() {
  try {
    await apiJson("/api/auth/logout", { method: "POST" });
  } catch {
    /* still clear local */
  }
  setToken(null);
  writeSession(null);
}

export async function changePassword(currentPassword: string, newPassword: string, code?: string) {
  const data = await apiJson<{ token: string; user: Session }>("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, code }),
  });
  return applyAuth(data.token, toSession(data.user));
}

export async function changeEmail(currentPassword: string, newEmail: string, code?: string) {
  const data = await apiJson<{ user: Session }>("/api/auth/email", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newEmail, code }),
  });
  const session = toSession(data.user);
  writeSession(session);
  return session;
}

export async function startTwoFactor() {
  return apiJson<{ ticket: string; secret: string; otpauth: string }>("/api/auth/2fa/setup", {
    method: "POST",
  });
}

export async function enableTwoFactor(ticket: string, code: string) {
  const data = await apiJson<{ user: Session }>("/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ ticket, code }),
  });
  const session = toSession(data.user);
  writeSession(session);
  return session;
}

export async function disableTwoFactor(currentPassword: string, code: string) {
  const data = await apiJson<{ user: Session }>("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ currentPassword, code }),
  });
  const session = toSession(data.user);
  writeSession(session);
  return session;
}

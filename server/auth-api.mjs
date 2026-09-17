import { timingSafeEqual } from "node:crypto";
import { json } from "./http-util.mjs";
import { clientIp, corsAndOptions, guardOrigin, passwordPolicy, rateLimit, readJson } from "./security.mjs";
import {
  checkPassword,
  ensureAdmin,
  getBearer,
  issueTicket,
  issueToken,
  loadAuth,
  makePassword,
  makeTotpSecret,
  otpauthUrl,
  prune,
  publicUser,
  saveAuth,
  sha256Hex,
  takeTicket,
  userFromRequest,
  verifyLogin,
  verifyTotp,
} from "./auth-store.mjs";

function pathname(req) {
  return (req.url || "/").split("?")[0];
}

function requireUser(req, res, state) {
  const user = userFromRequest(req, state);
  if (!user) {
    json(res, 401, { error: "Sign in required" });
    return null;
  }
  return user;
}

export { userFromRequest, loadAuth, prune, saveAuth };

export async function handleAuthRequest(req, res, env = process.env) {
  if (corsAndOptions(req, res, env)) return true;
  if (!guardOrigin(req, res, env)) return true;

  const path = pathname(req);
  const state = prune(await ensureAdmin(env));

  try {
    if (req.method === "POST" && path === "/api/auth/login") {
      const limit = rateLimit(`login:${clientIp(req)}`, 5, 5 * 60 * 1000);
      if (!limit.ok) {
        res.setHeader("Retry-After", String(limit.retryAfter));
        json(res, 429, {
          error: "Too many sign-in attempts",
          retryAfter: limit.retryAfter,
        });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const user = await verifyLogin(state, input.email, input.password);
      if (!user) {
        json(res, 401, { error: "Invalid email or password" });
        return true;
      }
      if (user.role !== "admin") {
        json(res, 403, { error: "This CRM is limited to admins" });
        return true;
      }
      if (user.totpEnabled) {
        const ticket = issueTicket(state, user.id, "totp-login");
        saveAuth(state);
        json(res, 200, { needsTotp: true, ticket });
        return true;
      }
      const token = issueToken(state, user.id);
      saveAuth(state);
      json(res, 200, { token, user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/totp") {
      const limit = rateLimit(`totp:${clientIp(req)}`, 5, 5 * 60 * 1000);
      if (!limit.ok) {
        res.setHeader("Retry-After", String(limit.retryAfter));
        json(res, 429, {
          error: "Too many codes",
          retryAfter: limit.retryAfter,
        });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const ticket = takeTicket(state, String(input.ticket || ""), "totp-login");
      if (!ticket) {
        json(res, 401, { error: "Session expired. Sign in again." });
        return true;
      }
      const user = state.users.find((u) => u.id === ticket.userId);
      if (!user?.totpEnabled || !verifyTotp(user.totpSecret, input.code)) {
        json(res, 401, { error: "Invalid authenticator code" });
        return true;
      }
      const token = issueToken(state, user.id);
      saveAuth(state);
      json(res, 200, { token, user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/logout") {
      const token = getBearer(req);
      if (token) {
        const hash = sha256Hex(token);
        state.sessions = state.sessions.filter((s) => s.tokenHash !== hash);
        saveAuth(state);
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && path === "/api/auth/me") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      json(res, 200, { user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/password") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      const input = await readJson(req, res);
      if (!input) return true;
      if (!(await checkPassword(user, input.currentPassword))) {
        json(res, 401, { error: "Current password is wrong" });
        return true;
      }
      if (user.totpEnabled && !verifyTotp(user.totpSecret, input.code)) {
        json(res, 401, { error: "Authenticator code required" });
        return true;
      }
      const policy = passwordPolicy(input.newPassword);
      if (policy) {
        json(res, 400, { error: policy });
        return true;
      }
      const next = await makePassword(input.newPassword);
      user.passwordSalt = next.salt;
      user.passwordHash = next.hash;
      state.sessions = state.sessions.filter((s) => s.userId !== user.id);
      const token = issueToken(state, user.id);
      saveAuth(state);
      json(res, 200, { token, user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/email") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      const input = await readJson(req, res);
      if (!input) return true;
      if (!(await checkPassword(user, input.currentPassword))) {
        json(res, 401, { error: "Current password is wrong" });
        return true;
      }
      if (user.totpEnabled && !verifyTotp(user.totpSecret, input.code)) {
        json(res, 401, { error: "Authenticator code required" });
        return true;
      }
      const email = String(input.newEmail || "")
        .trim()
        .toLowerCase();
      if (!email.includes("@") || email.length < 5) {
        json(res, 400, { error: "Enter a valid email" });
        return true;
      }
      if (state.users.some((u) => u.email === email && u.id !== user.id)) {
        json(res, 409, { error: "That email is already in use" });
        return true;
      }
      user.email = email;
      saveAuth(state);
      json(res, 200, { user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/2fa/setup") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      if (user.totpEnabled) {
        json(res, 400, { error: "2FA is already on. Turn it off first to reset." });
        return true;
      }
      const secret = makeTotpSecret();
      const ticket = issueTicket(state, user.id, "2fa-setup", { secret }, 10);
      saveAuth(state);
      json(res, 200, {
        ticket,
        secret,
        otpauth: otpauthUrl(user.email, secret),
      });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/2fa/enable") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      const input = await readJson(req, res);
      if (!input) return true;
      const ticket = takeTicket(state, String(input.ticket || ""), "2fa-setup");
      if (!ticket?.secret) {
        json(res, 400, { error: "2FA setup expired. Generate a new QR code." });
        return true;
      }
      if (!verifyTotp(ticket.secret, input.code)) {
        state.tickets.push(ticket);
        saveAuth(state);
        json(res, 401, { error: "Invalid authenticator code" });
        return true;
      }
      user.totpSecret = ticket.secret;
      user.totpEnabled = true;
      saveAuth(state);
      json(res, 200, { user: publicUser(user) });
      return true;
    }

    if (req.method === "POST" && path === "/api/auth/2fa/disable") {
      const user = requireUser(req, res, state);
      if (!user) return true;
      const input = await readJson(req, res);
      if (!input) return true;
      if (!(await checkPassword(user, input.currentPassword))) {
        json(res, 401, { error: "Current password is wrong" });
        return true;
      }
      if (!verifyTotp(user.totpSecret, input.code)) {
        json(res, 401, { error: "Invalid authenticator code" });
        return true;
      }
      user.totpEnabled = false;
      user.totpSecret = null;
      saveAuth(state);
      json(res, 200, { user: publicUser(user) });
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Auth request failed" });
    return true;
  }
}

export async function requireApiUser(req, res, env = process.env) {
  const state = prune(await ensureAdmin(env));
  const user = userFromRequest(req, state);
  if (!user || user.role !== "admin") {
    json(res, 401, { error: "Sign in required" });
    return null;
  }
  return user;
}

export function inboundOk(req, env = process.env) {
  const state = loadAuth();
  const expected = String(env.INBOUND_WEBHOOK_SECRET || state.inboundSecret || "");
  if (!expected) return false;
  const url = new URL(req.url || "/", "http://local");
  const got = String(req.headers["x-socilet-secret"] || url.searchParams.get("secret") || "");
  if (!got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

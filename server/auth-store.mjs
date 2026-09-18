import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { persistCopyCount, pickBestCopy, readJsonCopies, writeJsonCopies } from "./persist.mjs";

const scrypt = promisify(scryptCb);
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function emptyState() {
  return {
    users: [],
    sessions: [],
    tickets: [],
    inboundSecret: randomBytes(24).toString("base64url"),
  };
}

function normalizeAuth(raw) {
  return {
    users: Array.isArray(raw?.users) ? raw.users : [],
    sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
    tickets: Array.isArray(raw?.tickets) ? raw.tickets : [],
    inboundSecret: String(raw?.inboundSecret || randomBytes(24).toString("base64url")),
    savedAt: String(raw?.savedAt || ""),
  };
}

function authScore(copy) {
  const users = Array.isArray(copy.raw?.users) ? copy.raw.users : [];
  const saved = Date.parse(copy.raw?.savedAt || "") || 0;
  const defaultEmail = String(process.env.ADMIN_EMAIL || "admin@socilet.local")
    .trim()
    .toLowerCase();
  const custom = users.some(
    (u) =>
      u?.totpEnabled ||
      (u?.email && String(u.email).toLowerCase() !== defaultEmail) ||
      (u?.updatedAt && u.updatedAt !== u.createdAt),
  );
  return users.length * 1e13 + (custom ? 1e12 : 0) + Math.max(saved, copy.mtime || 0);
}

export function loadAuth() {
  const copies = readJsonCopies("auth.json").filter((c) => c.raw && typeof c.raw === "object" && !Array.isArray(c.raw));
  const best = pickBestCopy(copies, authScore);
  if (!best) return emptyState();
  return normalizeAuth(best.raw);
}

export function saveAuth(state) {
  state.savedAt = new Date().toISOString();
  writeJsonCopies("auth.json", state);
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export async function hashPassword(password, salt) {
  const buf = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return Buffer.from(buf).toString("base64");
}

export async function makePassword(password) {
  const salt = randomBytes(16).toString("base64");
  const hash = await hashPassword(password, salt);
  return { salt, hash };
}

export async function checkPassword(user, password) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const next = await hashPassword(password, user.passwordSalt);
  const a = Buffer.from(next);
  const b = Buffer.from(String(user.passwordHash));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function publicUser(user) {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    totpEnabled: Boolean(user.totpEnabled),
  };
}

export function prune(state) {
  const now = Date.now();
  state.sessions = state.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  state.tickets = state.tickets.filter((t) => new Date(t.expiresAt).getTime() > now);
  return state;
}

export function getBearer(req) {
  const h = String(req.headers.authorization || "");
  const m = /^Bearer\s+(\S+)/i.exec(h);
  return m ? m[1] : "";
}

export function userFromRequest(req, state) {
  prune(state);
  const token = getBearer(req);
  if (!token) return null;
  const hash = sha256Hex(token);
  const session = state.sessions.find((s) => s.tokenHash === hash);
  if (!session) return null;
  return state.users.find((u) => u.id === session.userId) || null;
}

export function issueToken(state, userId, days = 7) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const others = state.sessions.filter((s) => s.userId !== userId);
  const mine = state.sessions.filter((s) => s.userId === userId).slice(-4);
  mine.push({
    id: randomBytes(8).toString("hex"),
    userId,
    tokenHash: sha256Hex(token),
    expiresAt: expires,
    createdAt: new Date().toISOString(),
  });
  state.sessions = [...others, ...mine];
  return token;
}

export function issueTicket(state, userId, kind, extra = {}, minutes = 5) {
  const token = randomBytes(24).toString("base64url");
  state.tickets.push({
    id: randomBytes(8).toString("hex"),
    userId,
    kind,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
    ...extra,
  });
  return token;
}

export function takeTicket(state, token, kind) {
  prune(state);
  const hash = sha256Hex(token);
  const idx = state.tickets.findIndex((t) => t.tokenHash === hash && t.kind === kind);
  if (idx < 0) return null;
  const [row] = state.tickets.splice(idx, 1);
  return row;
}

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export function makeTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secretB32, at = Date.now()) {
  const secret = base32Decode(secretB32);
  const counter = Math.floor(at / 1000 / 30);
  return hotp(secret, counter);
}

export function verifyTotp(secretB32, code) {
  const expected = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(expected)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (const w of [-1, 0, 1]) {
    const got = hotp(secret, counter + w);
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function otpauthUrl(email, secret) {
  const label = encodeURIComponent(`Socilet:${email}`);
  const issuer = encodeURIComponent("Socilet CRM");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

const dummy = await makePassword("invalid-placeholder-password");

export async function verifyLogin(state, email, password) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  const user = state.users.find((u) => u.email === normalized);
  if (!user) {
    await checkPassword({ passwordHash: dummy.hash, passwordSalt: dummy.salt }, password);
    return null;
  }
  const ok = await checkPassword(user, password);
  return ok ? user : null;
}

export async function ensureAdmin(env = process.env) {
  const state = prune(loadAuth());
  if (state.users.length) {
    if (persistCopyCount("auth.json") < 2) {
      try {
        saveAuth(state);
      } catch {
        /* extra copies are best-effort */
      }
    }
    return state;
  }
  const email = String(env.ADMIN_EMAIL || "admin@socilet.local")
    .trim()
    .toLowerCase();
  const password = String(env.ADMIN_PASSWORD || "Admin@Socilet1!");
  const { salt, hash } = await makePassword(password);
  state.users.push({
    id: randomBytes(16).toString("hex"),
    email,
    fullName: "Socilet Admin",
    role: "admin",
    passwordSalt: salt,
    passwordHash: hash,
    totpEnabled: false,
    totpSecret: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveAuth(state);
  if (!env.ADMIN_PASSWORD) {
    console.warn("Auth store created default admin. Change email/password and enable 2FA in Account.");
  }
  return state;
}

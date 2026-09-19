import { Capacitor } from "@capacitor/core";

const ENABLED_KEY = "socilet.bio.enabled";
const UNLOCKED_KEY = "socilet.bio.unlocked";
const FAILS_KEY = "socilet.bio.fails";
const WEBAUTHN_KEY = "socilet.bio.cred";
export const BIO_MAX_FAILS = 5;

function readNum(key: string) {
  try {
    const n = Number(localStorage.getItem(key) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function fingerprintEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFingerprintEnabled(on: boolean) {
  write(ENABLED_KEY, on ? "1" : null);
  if (!on) {
    write(FAILS_KEY, null);
    write(WEBAUTHN_KEY, null);
    setFingerprintUnlocked(false);
  }
}

export function fingerprintUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFingerprintUnlocked(on: boolean) {
  try {
    if (on) sessionStorage.setItem(UNLOCKED_KEY, "1");
    else sessionStorage.removeItem(UNLOCKED_KEY);
  } catch {
    /* ignore */
  }
}

export function fingerprintFails() {
  return readNum(FAILS_KEY);
}

export function resetFingerprintFails() {
  write(FAILS_KEY, null);
}

export function bumpFingerprintFail() {
  const n = fingerprintFails() + 1;
  write(FAILS_KEY, String(n));
  return n;
}

export async function fingerprintAvailable() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
      const res = await NativeBiometric.isAvailable();
      return Boolean(res.isAvailable);
    } catch {
      return false;
    }
  }
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function isCancel(err: unknown) {
  const code = typeof err === "object" && err && "code" in err ? Number((err as { code?: number }).code) : NaN;
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return code === 16 || code === 15 || name === "NotAllowedError" || msg.includes("cancel");
}

async function verifyNative() {
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  await NativeBiometric.verifyIdentity({
    reason: "Unlock Socilet CRM",
    title: "Fingerprint",
    subtitle: "Verify to open the app",
    description: "5 failed tries ke baad password + 2FA chahiye.",
    useFallback: false,
  });
}

function bufToB64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function enrollWeb(email: string) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Socilet CRM" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Fingerprint enroll failed");
  write(WEBAUTHN_KEY, bufToB64(cred.rawId));
}

async function verifyWeb() {
  const raw = localStorage.getItem(WEBAUTHN_KEY);
  const allow: PublicKeyCredentialDescriptor[] = raw
    ? [{ type: "public-key", id: b64ToBuf(raw) }]
    : [];
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: allow,
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!cred) throw new Error("Fingerprint failed");
}

export async function enrollFingerprint(email: string) {
  if (Capacitor.isNativePlatform()) await verifyNative();
  else await enrollWeb(email);
  setFingerprintEnabled(true);
  resetFingerprintFails();
  setFingerprintUnlocked(true);
}

export type FingerprintResult = "ok" | "cancel" | "fail";

export async function verifyFingerprint(): Promise<FingerprintResult> {
  try {
    if (Capacitor.isNativePlatform()) await verifyNative();
    else await verifyWeb();
    resetFingerprintFails();
    setFingerprintUnlocked(true);
    return "ok";
  } catch (err) {
    if (isCancel(err)) return "cancel";
    return "fail";
  }
}

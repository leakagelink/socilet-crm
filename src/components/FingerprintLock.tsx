import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BIO_MAX_FAILS,
  bumpFingerprintFail,
  fingerprintEnabled,
  fingerprintFails,
  fingerprintUnlocked,
  setFingerprintUnlocked,
  verifyFingerprint,
} from "@/lib/biometrics";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";

export function FingerprintLock() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [locked, setLocked] = useState(() => fingerprintEnabled() && !fingerprintUnlocked());
  const [fails, setFails] = useState(fingerprintFails);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prompting = useRef(false);

  useEffect(() => {
    if (!session || !fingerprintEnabled()) {
      setLocked(false);
      return;
    }
    if (!fingerprintUnlocked()) setLocked(true);
  }, [session]);

  useEffect(() => {
    const lock = () => {
      if (!fingerprintEnabled()) return;
      setFingerprintUnlocked(false);
      setLocked(true);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") lock();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", lock);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", lock);
    };
  }, []);

  async function forcePasswordLogin() {
    await signOut();
    setLocked(false);
    navigate("/login", { replace: true });
  }

  async function prompt() {
    if (prompting.current || busy) return;
    prompting.current = true;
    setBusy(true);
    setErr(null);
    try {
      const result = await verifyFingerprint();
      if (result === "ok") {
        setFails(0);
        setLocked(false);
        return;
      }
      if (result === "fail") {
        const n = bumpFingerprintFail();
        setFails(n);
        if (n >= BIO_MAX_FAILS) {
          await forcePasswordLogin();
          return;
        }
        setErr(`Fingerprint fail ${n}/${BIO_MAX_FAILS}. ${BIO_MAX_FAILS - n} tries left.`);
      }
    } finally {
      prompting.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (locked && session) void prompt();
  }, [locked, session]);

  if (!session || !locked) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/95 p-6 pt-[calc(var(--sat)+1.5rem)] pb-[calc(var(--sab)+1.5rem)]">
      <div className="grid w-full max-w-sm justify-items-center gap-4 text-center">
        <BrandLogo className="h-20 w-auto max-w-[14rem]" />
        <div>
          <h1 className="font-display text-2xl">Unlock Socilet CRM</h1>
          <p className="mt-1 text-sm text-paper/55">Fingerprint se app kholo. 5 fail ke baad password + 2FA.</p>
        </div>
        {err ? <p className="text-sm text-rose-300">{err}</p> : null}
        <p className="text-xs text-paper/40">
          Tries {fails}/{BIO_MAX_FAILS}
        </p>
        <Button className="w-full" disabled={busy} onClick={() => void prompt()}>
          {busy ? "Waiting…" : "Use fingerprint"}
        </Button>
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  readSession,
  refreshSession,
  signIn as doSignIn,
  signOut as doSignOut,
  verifyTotpLogin,
  type Session,
} from "@/lib/auth";

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ needsTotp: true; ticket: string } | Session>;
  confirmTotp: (ticket: string, code: string) => Promise<Session>;
  signOut: () => Promise<void>;
  setSession: (s: Session | null) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void refreshSession().then((s) => {
      setSession(s);
      setReady(true);
    });
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      setSession,
      signIn: async (email, password) => {
        const result = await doSignIn(email, password);
        if ("needsTotp" in result && result.needsTotp) return result;
        setSession(result.session);
        const { ensureSeed } = await import("@/lib/db");
        await ensureSeed();
        const { setFingerprintUnlocked, resetFingerprintFails } = await import("@/lib/biometrics");
        resetFingerprintFails();
        setFingerprintUnlocked(true);
        return result.session;
      },
      confirmTotp: async (ticket, code) => {
        const s = await verifyTotpLogin(ticket, code);
        setSession(s);
        const { ensureSeed } = await import("@/lib/db");
        await ensureSeed();
        const { setFingerprintUnlocked, resetFingerprintFails } = await import("@/lib/biometrics");
        resetFingerprintFails();
        setFingerprintUnlocked(true);
        return s;
      },
      signOut: async () => {
        const { setFingerprintUnlocked } = await import("@/lib/biometrics");
        setFingerprintUnlocked(false);
        await doSignOut();
        setSession(null);
      },
    }),
    [session, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

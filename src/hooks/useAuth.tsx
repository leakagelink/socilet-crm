import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { readSession, signIn as doSignIn, signOut as doSignOut, type Session } from "@/lib/auth";

type AuthCtx = {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [ready] = useState(true);
  const value = useMemo<AuthCtx>(
    () => ({
      session,
      ready,
      signIn: async (email, password) => {
        const s = await doSignIn(email, password);
        setSession(s);
        return s;
      },
      signOut: async () => {
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

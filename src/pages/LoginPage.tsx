import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ROLE_HOME, isStaffRole } from "@/lib/roles";

const LOCK_KEY = "socilet.loginLock";

function lockMs() {
  try {
    const n = Number(sessionStorage.getItem(LOCK_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function formatRemain(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const schema = z.object({
  email: z.string().trim().min(3).refine((v) => v.includes("@"), "Enter an email"),
  password: z.string().min(8),
});

export function LoginPage() {
  const { signIn, confirmTotp, ready } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [until, setUntil] = useState(lockMs);
  const [now, setNow] = useState(Date.now());
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const remain = Math.max(0, until - now);
  const locked = remain > 0;

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [locked]);

  useEffect(() => {
    if (until && until <= Date.now()) {
      setUntil(0);
      try {
        sessionStorage.removeItem(LOCK_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [until, now]);

  function applyLock(retryAfter: number) {
    const next = Date.now() + retryAfter * 1000;
    setUntil(next);
    setNow(Date.now());
    try {
      sessionStorage.setItem(LOCK_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  function fail(e: unknown) {
    if (e instanceof ApiError && e.retryAfter > 0) {
      applyLock(e.retryAfter);
      setErr(null);
      return;
    }
    setErr(e instanceof Error ? e.message : "Sign-in failed");
  }

  if (!ready) return <div className="grid min-h-full place-items-center text-sm text-paper/50">Loading…</div>;

  return (
    <div className="relative grid min-h-full lg:grid-cols-2">
      <div className="relative hidden items-end p-10 lg:flex">
        <div className="orb pointer-events-none absolute -left-16 top-10 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
        <div className="orb pointer-events-none absolute bottom-10 right-10 h-80 w-80 rounded-full bg-gold/15 blur-3xl" />
        <div className="grid-fade pointer-events-none absolute inset-0" />
        <div className="relative max-w-md">
          <img src="/socilet-logo.svg" alt="Socilet" className="brand-mark mb-6 h-16 w-16 rounded-2xl ring-1 ring-gold/40" />
          <div className="text-[11px] uppercase tracking-[0.32em] text-gold">Socilet</div>
          <h1 className="font-display mt-3 text-5xl leading-tight">The ledger, dressed for night work.</h1>
          <p className="mt-4 text-sm text-paper/55">INR command deck for projects, mail, and cash. Admin, designer, and accountant logins.</p>
        </div>
      </div>
      <div className="relative flex items-center justify-center p-4 pt-[calc(var(--sat)+1rem)] pb-[calc(var(--sab)+1rem)]">
        <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-gold/15 blur-3xl lg:hidden" />
        <Card className="page-enter shine relative w-full max-w-md border-gold/35">
          <img src="/socilet-logo.svg" alt="" className="brand-mark mb-4 h-12 w-12 rounded-2xl ring-1 ring-gold/40 lg:hidden" />
          <div className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gold">Socilet</div>
          <h1 className="font-display mb-2 text-3xl">{ticket ? "Two-factor code" : "Welcome back"}</h1>
          <p className="mb-6 text-sm text-paper/50">
            {ticket
              ? "Authenticator app ka 6-digit code enter karo."
              : "Sign in to the command deck."}
          </p>
          {locked ? (
            <p className="mb-4 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
              Too many sign-in attempts. Try again in <span className="font-mono text-base text-paper">{formatRemain(remain)}</span>
            </p>
          ) : null}
          {ticket ? (
            <form
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (locked) return;
                setErr(null);
                try {
                  const s = await confirmTotp(ticket, code);
                  navigate(isStaffRole(s.role) ? ROLE_HOME[s.role] : "/denied", { replace: true });
                } catch (er) {
                  fail(er);
                }
              }}
            >
              <div className="grid gap-1">
                <Label htmlFor="totp">Authenticator code</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  disabled={locked}
                  value={code}
                  onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              {err ? <p className="text-sm text-red-400">{err}</p> : null}
              <Button type="submit" disabled={locked}>Verify</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTicket(null);
                  setCode("");
                  setErr(null);
                }}
              >
                Back
              </Button>
            </form>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={form.handleSubmit(async (v) => {
                if (locked) return;
                setErr(null);
                try {
                  const result = await signIn(v.email, v.password);
                  if ("ticket" in result) {
                    setTicket(result.ticket);
                    return;
                  }
                  navigate(isStaffRole(result.role) ? ROLE_HOME[result.role] : "/denied", { replace: true });
                } catch (e) {
                  fail(e);
                }
              })}
            >
              <div className="grid gap-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" disabled={locked} {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" disabled={locked} {...form.register("password")} />
                {form.formState.errors.password ? (
                  <p className="text-xs text-red-400">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              {err ? <p className="text-sm text-red-400">{err}</p> : null}
              <Button type="submit" disabled={locked || form.formState.isSubmitting}>
                Sign in
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export function DeniedPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <h1 className="font-display text-2xl">Access denied</h1>
        <p className="mt-2 text-sm text-paper/70">This page is not in your role. Ask an admin if you need access.</p>
        <Button
          className="mt-4"
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
        >
          Back to sign in
        </Button>
      </Card>
    </div>
  );
}

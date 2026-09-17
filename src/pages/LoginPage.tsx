import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const schema = z.object({
  email: z.string().trim().min(3).refine((v) => v.includes("@"), "Enter an email"),
  password: z.string().min(8),
});

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-mint/10 blur-3xl" />
      <Card className="page-enter relative w-full max-w-md border-gold/20">
        <div className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gold">Socilet</div>
        <h1 className="font-display mb-2 text-3xl">Welcome back</h1>
        <p className="mb-6 text-sm text-paper/50">Sign in to the command deck. No public sign-up.</p>
        <form
          className="grid gap-3"
          onSubmit={form.handleSubmit(async (v) => {
            setErr(null);
            try {
              const s = await signIn(v.email, v.password);
              navigate(s.role === "admin" ? "/" : "/denied", { replace: true });
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Sign-in failed");
            }
          })}
        >
          <div className="grid gap-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <p className="text-xs text-red-400">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
        </form>
      </Card>
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
        <p className="mt-2 text-sm text-paper/70">This CRM is limited to admins. Your role is stored in user_roles, not on your profile.</p>
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

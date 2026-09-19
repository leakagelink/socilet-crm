import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { vaultEnable, vaultSetup, vaultStatus, vaultUnlock } from "@/lib/auth";
import { getVaultToken } from "@/lib/apiBase";
import { moduleById } from "@/lib/modules";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";

export function ServiceCredentialsPage() {
  const module = moduleById("service_credentials")!;
  const status = useQuery({ queryKey: ["vault-status"], queryFn: vaultStatus });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ ticket: string; secret: string; otpauth: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!setup?.otpauth) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL(setup.otpauth, { width: 220, margin: 1, color: { dark: "#060914", light: "#f3eee4" } }).then(
      setQr,
    );
  }, [setup?.otpauth]);

  const unlocked = open || Boolean(getVaultToken()) || status.data?.unlocked;
  if (status.data?.configured && unlocked) {
    return <ModuleCrud module={module} />;
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Lockbox"
        title="Service Credentials"
        description="Pehle vault password aur 2FA set karo. Uske baad yahi password + authenticator code se yeh page khulega."
      />
      {status.isLoading ? <Card>Loading…</Card> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {!status.data?.configured && !setup ? (
        <Card className="grid max-w-md gap-3">
          <h2 className="font-semibold">Set vault password + 2FA</h2>
          <p className="text-sm text-paper/55">
            Yeh login password se alag hai. Authenticator mein <span className="text-paper">Socilet Vault</span> naam se naya entry add hoga.
          </p>
          <div className="grid gap-1">
            <Label htmlFor="vault-pass">Vault password</Label>
            <Input
              id="vault-pass"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="vault-confirm">Confirm password</Label>
            <Input
              id="vault-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <p className="text-xs text-paper/45">Min 10 characters, with upper, lower, and a number.</p>
          <Button
            disabled={busy}
            onClick={async () => {
              setErr(null);
              if (password !== confirm) {
                setErr("Passwords do not match");
                return;
              }
              setBusy(true);
              try {
                setSetup(await vaultSetup(password));
                setPassword("");
                setConfirm("");
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not start vault setup");
              } finally {
                setBusy(false);
              }
            }}
          >
            Continue to 2FA
          </Button>
        </Card>
      ) : null}

      {setup ? (
        <Card className="grid max-w-md gap-3">
          <h2 className="font-semibold">Scan vault 2FA</h2>
          {qr ? <img src={qr} alt="Vault 2FA QR" className="h-44 w-44 rounded-lg bg-paper p-2" /> : null}
          <p className="break-all text-xs text-paper/45">{setup.secret}</p>
          <div className="grid gap-1">
            <Label htmlFor="vault-enable">Authenticator code</Label>
            <Input
              id="vault-enable"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <Button
            disabled={busy || code.length !== 6}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await vaultEnable(setup.ticket, code);
                setCode("");
                setSetup(null);
                setOpen(true);
                await status.refetch();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not enable vault 2FA");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save and open
          </Button>
        </Card>
      ) : null}

      {status.data?.configured && !unlocked ? (
        <Card className="grid max-w-md gap-3">
          <h2 className="font-semibold">Unlock</h2>
          <p className="text-sm text-paper/55">Vault password aur authenticator code daalo — tabhi credentials khulenge.</p>
          <div className="grid gap-1">
            <Label htmlFor="unlock-pass">Vault password</Label>
            <Input
              id="unlock-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="unlock-code">Authenticator code</Label>
            <Input
              id="unlock-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <Button
            disabled={busy || code.length !== 6}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await vaultUnlock(password, code);
                setPassword("");
                setCode("");
                setOpen(true);
                await status.refetch();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Unlock failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Unlock
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  changeEmail,
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  startTwoFactor,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { listAllRecords, mergeRecords } from "@/lib/db";
import { downloadText } from "@/lib/tableTools";

export function AccountPage() {
  const { session, setSession } = useAuth();
  const qc = useQueryClient();
  const backupRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState(session?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passCode, setPassCode] = useState("");

  const [setup, setSetup] = useState<{ ticket: string; secret: string; otpauth: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => {
    setNewEmail(session?.email ?? "");
  }, [session?.email]);

  useEffect(() => {
    if (!setup?.otpauth) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL(setup.otpauth, { width: 220, margin: 1, color: { dark: "#060914", light: "#f3eee4" } }).then(
      setQr,
    );
  }, [setup?.otpauth]);

  function flash(ok: string) {
    setErr(null);
    setMsg(ok);
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Security"
        title="Account"
        description="Email, password, aur 2-factor authentication yahin se change hote hain. Server pe lock hain — localStorage se admin nahi banta."
      />
      {msg ? <p className="text-sm text-mint">{msg}</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {!session?.totpEnabled ? (
        <Card className="border-gold/40">
          <div className="font-medium text-gold">2FA abhi off hai</div>
          <p className="mt-1 text-sm text-paper/60">
            Authenticator app (Google Authenticator, Authy) laga lo. Password leak ho to bhi bina code ke login nahi hoga.
          </p>
        </Card>
      ) : null}

      <Card className="grid gap-3">
        <h2 className="font-semibold">Change email</h2>
        <div className="grid gap-1">
          <Label htmlFor="new-email">New email</Label>
          <Input id="new-email" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="email-pass">Current password</Label>
          <Input
            id="email-pass"
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
          />
        </div>
        {session?.totpEnabled ? (
          <div className="grid gap-1">
            <Label htmlFor="email-totp">Authenticator code</Label>
            <Input
              id="email-totp"
              inputMode="numeric"
              maxLength={6}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          onClick={async () => {
            try {
              const s = await changeEmail(emailPassword, newEmail, emailCode);
              setSession(s);
              setEmailPassword("");
              setEmailCode("");
              flash("Email updated.");
            } catch (e) {
              setMsg(null);
              setErr(e instanceof Error ? e.message : "Could not change email");
            }
          }}
        >
          Save email
        </Button>
      </Card>

      <Card className="grid gap-3">
        <h2 className="font-semibold">Change password</h2>
        <p className="text-xs text-paper/50">Min 10 characters, with upper, lower, and a number.</p>
        <div className="grid gap-1">
          <Label htmlFor="cur-pass">Current password</Label>
          <Input
            id="cur-pass"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="new-pass">New password</Label>
          <Input
            id="new-pass"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="conf-pass">Confirm new password</Label>
          <Input
            id="conf-pass"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {session?.totpEnabled ? (
          <div className="grid gap-1">
            <Label htmlFor="pass-totp">Authenticator code</Label>
            <Input
              id="pass-totp"
              inputMode="numeric"
              maxLength={6}
              value={passCode}
              onChange={(e) => setPassCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          onClick={async () => {
            if (newPassword !== confirmPassword) {
              setMsg(null);
              setErr("New passwords do not match");
              return;
            }
            try {
              const s = await changePassword(currentPassword, newPassword, passCode);
              setSession(s);
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setPassCode("");
              flash("Password updated. Other sessions were signed out.");
            } catch (e) {
              setMsg(null);
              setErr(e instanceof Error ? e.message : "Could not change password");
            }
          }}
        >
          Save password
        </Button>
      </Card>

      <Card className="grid gap-3">
        <h2 className="font-semibold">Two-factor authentication</h2>
        {session?.totpEnabled ? (
          <>
            <p className="text-sm text-paper/60">2FA is on. Login now needs password + app code.</p>
            <div className="grid gap-1">
              <Label htmlFor="off-pass">Password</Label>
              <Input
                id="off-pass"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="off-code">Authenticator code</Label>
              <Input
                id="off-code"
                inputMode="numeric"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={async () => {
                try {
                  const s = await disableTwoFactor(disablePassword, disableCode);
                  setSession(s);
                  setDisablePassword("");
                  setDisableCode("");
                  flash("2FA turned off.");
                } catch (e) {
                  setMsg(null);
                  setErr(e instanceof Error ? e.message : "Could not disable 2FA");
                }
              }}
            >
              Turn off 2FA
            </Button>
          </>
        ) : setup ? (
          <>
            <p className="text-sm text-paper/60">Scan this QR in your authenticator app, then enter the 6-digit code.</p>
            {qr ? <img src={qr} alt="2FA QR code" className="h-44 w-44 rounded-xl border border-line" /> : null}
            <p className="break-all font-mono text-xs text-paper/70">{setup.secret}</p>
            <div className="grid gap-1">
              <Label htmlFor="on-code">Authenticator code</Label>
              <Input
                id="on-code"
                inputMode="numeric"
                maxLength={6}
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={async () => {
                try {
                  const s = await enableTwoFactor(setup.ticket, enableCode);
                  setSession(s);
                  setSetup(null);
                  setEnableCode("");
                  flash("2FA is on.");
                } catch (e) {
                  setMsg(null);
                  setErr(e instanceof Error ? e.message : "Could not enable 2FA");
                }
              }}
            >
              Confirm and enable
            </Button>
          </>
        ) : (
          <Button
            className="w-full sm:w-auto"
            onClick={async () => {
              try {
                setSetup(await startTwoFactor());
                setErr(null);
                setMsg(null);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not start 2FA");
              }
            }}
          >
            Set up 2FA
          </Button>
        )}
      </Card>

      <Card className="grid gap-3">
        <h2 className="font-semibold">Backup</h2>
        <p className="text-sm text-paper/55">
          Full CRM JSON export/import — same idea as the old admin dump. Module pages also have CSV/JSON per table.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const records = await listAllRecords();
                downloadText(
                  `socilet-crm-${new Date().toISOString().slice(0, 10)}.json`,
                  JSON.stringify({ records }, null, 2),
                  "application/json",
                );
                flash(`Exported ${records.length} rows.`);
              } catch (e) {
                setMsg(null);
                setErr(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            Export all JSON
          </Button>
          <Button variant="outline" onClick={() => backupRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text()) as { records?: { id?: string; module?: string; data?: Record<string, unknown>; created_at?: string; updated_at?: string }[] };
                const rows = (parsed.records ?? []).filter((r) => r.id && r.module && r.data);
                if (!rows.length) throw new Error("JSON needs a records array");
                await mergeRecords(
                  rows.map((r) => ({
                    id: String(r.id),
                    module: String(r.module),
                    data: r.data ?? {},
                    created_at: r.created_at || new Date().toISOString(),
                    updated_at: r.updated_at || new Date().toISOString(),
                  })),
                );
                await qc.invalidateQueries();
                flash(`Imported ${rows.length} rows.`);
              } catch (er) {
                setMsg(null);
                setErr(er instanceof Error ? er.message : "Import failed");
              }
            }}
          />
        </div>
      </Card>
    </div>
  );
}

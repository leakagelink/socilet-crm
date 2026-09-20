import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  changeEmail,
  changePassword,
  createStaff,
  deleteStaff,
  disableTwoFactor,
  enableTwoFactor,
  listStaff,
  resetStaffPassword,
  startTwoFactor,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { listAllRecords, mergeRecords } from "@/lib/db";
import { downloadText } from "@/lib/tableTools";
import {
  enrollFingerprint,
  fingerprintAvailable,
  fingerprintEnabled,
  setFingerprintEnabled,
} from "@/lib/biometrics";

export function AccountPage() {
  const { session, setSession } = useAuth();
  const qc = useQueryClient();
  const backupRef = useRef<HTMLInputElement>(null);
  const restoreEncRef = useRef<HTMLInputElement>(null);
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

      {session?.role !== "admin" ? (
        <Card>
          <h2 className="font-semibold">Staff access</h2>
          <p className="mt-1 text-sm text-paper/60">
            Signed in as {session?.email} ({session?.role}). Email, password, and 2FA only the admin can change.
          </p>
        </Card>
      ) : null}

      <FingerprintCard onMsg={flash} onErr={(m) => { setMsg(null); setErr(m); }} email={session?.email || ""} />

      {session?.role === "admin" ? (
        <>
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

      <FirmCard onMsg={flash} onErr={(e) => { setMsg(null); setErr(e); }} />
      <StaffCard onMsg={flash} onErr={(e) => { setMsg(null); setErr(e); }} />

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
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const { apiJson } = await import("@/lib/apiBase");
                const res = await apiJson<{ skipped?: boolean; day?: string }>("/api/crm/backup", { method: "POST" });
                flash(res.skipped ? "Backup already ran in the last day." : `Encrypted backup saved (${res.day}).`);
              } catch (e) {
                setMsg(null);
                setErr(e instanceof Error ? e.message : "Backup failed");
              }
            }}
          >
            Run encrypted backup now
          </Button>
          <Button variant="outline" onClick={() => backupRef.current?.click()}>
            Import JSON
          </Button>
          <Button variant="outline" onClick={() => restoreEncRef.current?.click()}>
            Restore encrypted backup
          </Button>
          <input
            ref={restoreEncRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
                const { apiJson } = await import("@/lib/apiBase");
                const res = await apiJson<{ restored?: number; data?: { id: string; module: string; data: Record<string, unknown>; created_at: string; updated_at: string }[] }>(
                  "/api/crm/backup/restore",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(parsed),
                  },
                );
                if (res.data?.length) await mergeRecords(res.data);
                await qc.invalidateQueries();
                flash(`Restored ${res.restored ?? res.data?.length ?? 0} rows from encrypted backup.`);
              } catch (er) {
                setMsg(null);
                setErr(er instanceof Error ? er.message : "Restore failed — wrong file or backup key.");
              }
            }}
          />
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
        </>
      ) : null}
    </div>
  );
}

function FingerprintCard({
  email,
  onMsg,
  onErr,
}: {
  email: string;
  onMsg: (s: string) => void;
  onErr: (s: string) => void;
}) {
  const [on, setOn] = useState(fingerprintEnabled);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fingerprintAvailable().then(setOk);
  }, []);
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Fingerprint unlock</h2>
      <p className="text-sm text-paper/60">
        On karne ke baad app fingerprint se khulegi. 5 fail ke baad password + 2FA se login. Idle auto-logout band hai — sirf Sign out se logout.
      </p>
      {!ok ? (
        <p className="text-sm text-amber-200">Is device par fingerprint / biometric nahi mila.</p>
      ) : on ? (
        <>
          <p className="text-sm text-mint">Fingerprint on hai.</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setFingerprintEnabled(false);
              setOn(false);
              onMsg("Fingerprint unlock off.");
            }}
          >
            Turn off fingerprint
          </Button>
        </>
      ) : (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enrollFingerprint(email);
              setOn(true);
              onMsg("Fingerprint set. Ab app fingerprint se unlock hogi.");
            } catch (e) {
              onErr(e instanceof Error ? e.message : "Could not set fingerprint");
            } finally {
              setBusy(false);
            }
          }}
        >
          Set fingerprint
        </Button>
      )}
    </Card>
  );
}

function FirmCard({ onMsg, onErr }: { onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [legal, setLegal] = useState("");
  const [gstin, setGstin] = useState("");
  const [upi, setUpi] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logo, setLogo] = useState("/socilet-logo.svg");
  useEffect(() => {
    void import("@/lib/firm").then(({ loadFirm }) =>
      loadFirm().then((f) => {
        setLegal(f.legal_name);
        setGstin(f.gstin);
        setUpi(f.upi_id);
        setAddress(f.address);
        setPhone(f.phone);
        setEmail(f.email);
        setLogo(f.logo_url || "/socilet-logo.svg");
      }),
    );
  }, []);
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Firm / GSTIN / UPI</h2>
      <p className="text-xs text-paper/50">Shows on invoice and quote PDFs.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Legal name</Label>
          <Input value={legal} onChange={(e) => setLegal(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>GSTIN</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>UPI id</Label>
          <Input value={upi} onChange={(e) => setUpi(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1">
        <Label>Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>Logo URL</Label>
        <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="/socilet-logo.svg" />
      </div>
      <div className="grid gap-1">
        <Label>Address</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <Button
        className="w-full sm:w-auto"
        onClick={async () => {
          try {
            const { saveFirm } = await import("@/lib/firm");
            await saveFirm({ legal_name: legal, gstin, upi_id: upi, address, phone, email, logo_url: logo || "/socilet-logo.svg" });
            onMsg("Firm details saved.");
          } catch (e) {
            onErr(e instanceof Error ? e.message : "Could not save firm");
          }
        }}
      >
        Save firm
      </Button>
    </Card>
  );
}

function StaffCard({ onMsg, onErr }: { onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"designer" | "accountant">("designer");
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listStaff>>["users"]>([]);
  async function refresh() {
    const res = await listStaff();
    setUsers(res.users);
  }
  useEffect(() => {
    void refresh().catch((e) => onErr(e instanceof Error ? e.message : "Could not load staff"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Staff logins</h2>
      <p className="text-xs text-paper/50">Designer: tasks/projects. Accountant: money. They cannot change email, password, or 2FA.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Temp password (10+ chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select
          className="h-10 rounded-xl border border-line bg-ink/70 px-3 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as "designer" | "accountant")}
        >
          <option value="designer">Designer</option>
          <option value="accountant">Accountant</option>
        </select>
      </div>
      <Button
        className="w-full sm:w-auto"
        onClick={async () => {
          try {
            await createStaff({ email, password, fullName: name, role });
            setEmail("");
            setName("");
            setPassword("");
            await refresh();
            onMsg("Staff account created.");
          } catch (e) {
            onErr(e instanceof Error ? e.message : "Could not create staff");
          }
        }}
      >
        Add staff
      </Button>
      <div className="grid gap-2">
        {users
          .filter((u) => u.role !== "admin")
          .map((u) => (
            <div key={u.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/20 px-3 py-2 text-sm">
              <span>
                {u.fullName} · {u.email} · {u.role}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const next = window.prompt("New password (10+ chars, upper, lower, number)");
                    if (!next) return;
                    try {
                      await resetStaffPassword(u.userId, next);
                      onMsg("Password reset.");
                    } catch (e) {
                      onErr(e instanceof Error ? e.message : "Reset failed");
                    }
                  }}
                >
                  Reset pass
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await deleteStaff(u.userId);
                      await refresh();
                      onMsg("Staff removed.");
                    } catch (e) {
                      onErr(e instanceof Error ? e.message : "Delete failed");
                    }
                  }}
                >
                  Remove
                </Button>
              </span>
            </div>
          ))}
      </div>
    </Card>
  );
}

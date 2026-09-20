import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRecord, insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { defaultPay, isDefaultPay, payLabel, paySnapshot, PAY_TYPES, unsetOtherDefaults } from "@/lib/payments";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

function str(v: unknown) {
  return String(v ?? "").trim();
}

const empty = {
  name: "",
  type: "upi",
  bank_name: "",
  account_name: "",
  account_number: "",
  ifsc: "",
  upi_id: "",
  provider: "",
  last4: "",
  wallet_id: "",
  details: "",
  is_default: false,
  active: true,
};

export function PaymentMethodsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["module", "payment_methods"], queryFn: () => listRecords("payment_methods") });
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function load(row: RecordRow | null) {
    setEditing(row);
    if (!row) {
      setForm(empty);
      return;
    }
    setForm({
      name: str(row.data.name),
      type: str(row.data.type) || "upi",
      bank_name: str(row.data.bank_name),
      account_name: str(row.data.account_name),
      account_number: str(row.data.account_number),
      ifsc: str(row.data.ifsc),
      upi_id: str(row.data.upi_id),
      provider: str(row.data.provider),
      last4: str(row.data.last4),
      wallet_id: str(row.data.wallet_id),
      details: str(row.data.details),
      is_default: isDefaultPay(row),
      active: row.data.active !== false,
    });
  }

  async function save() {
    setErr(null);
    if (!form.name) {
      setErr("Label required");
      return;
    }
    const data = { ...form };
    const row = editing ? await updateRecord(editing.id, data) : await insertRecord("payment_methods", data);
    if (form.is_default) await unsetOtherDefaults(row.id);
    await qc.invalidateQueries({ queryKey: ["module", "payment_methods"] });
    load(null);
  }

  const rows = q.data ?? [];
  const def = defaultPay(rows);

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Finance"
        title="Payment methods"
        description="Type choose karo, details + label daalo, Set as default. Invoice/quote par yahi methods select hote hain."
      />
      <Card className="grid gap-3">
        <h2 className="font-semibold text-gold">{editing ? "Edit method" : "Add payment method"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label / name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="HDFC current / PhonePe" />
          </Field>
          <Field label="Type">
            <select
              className="h-11 w-full rounded-xl border border-line bg-ink/70 px-3"
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
            >
              {PAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {form.type === "bank" ? (
            <>
              <Field label="Bank name">
                <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
              </Field>
              <Field label="Account name">
                <Input value={form.account_name} onChange={(e) => set("account_name", e.target.value)} />
              </Field>
              <Field label="Account number">
                <Input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
              </Field>
              <Field label="IFSC">
                <Input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} />
              </Field>
            </>
          ) : null}
          {form.type === "upi" ? (
            <Field label="UPI id">
              <Input value={form.upi_id} onChange={(e) => set("upi_id", e.target.value)} placeholder="name@upi" />
            </Field>
          ) : null}
          {form.type === "card" ? (
            <>
              <Field label="Network / provider">
                <Input value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Visa / Razorpay" />
              </Field>
              <Field label="Last 4">
                <Input value={form.last4} onChange={(e) => set("last4", e.target.value)} />
              </Field>
            </>
          ) : null}
          {form.type === "wallet" ? (
            <>
              <Field label="Wallet">
                <Input value={form.provider} onChange={(e) => set("provider", e.target.value)} />
              </Field>
              <Field label="Wallet id">
                <Input value={form.wallet_id} onChange={(e) => set("wallet_id", e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <Field label="Notes / extra details">
          <Textarea value={form.details} onChange={(e) => set("details", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} />
          Set as default
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Active
        </label>
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()}>{editing ? "Save method" : "Add method"}</Button>
          {editing ? (
            <Button variant="outline" onClick={() => load(null)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-2">
        {q.isLoading ? <Card>Loading…</Card> : null}
        {rows.length === 0 && !q.isLoading ? <Card className="text-sm text-paper/50">Abhi koi payment method nahi.</Card> : null}
        {rows.map((row) => (
          <Card key={row.id} className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">
                {payLabel(row)}
                {def?.id === row.id ? <span className="ml-2 text-xs text-gold">default</span> : null}
              </div>
              <div className="text-xs uppercase text-paper/45">{str(row.data.type)}</div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-paper/60">{paySnapshot(row)}</pre>
            </div>
            <div className="flex flex-wrap gap-2">
              {def?.id !== row.id ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await updateRecord(row.id, { ...row.data, is_default: true });
                    await unsetOtherDefaults(row.id);
                    await qc.invalidateQueries({ queryKey: ["module", "payment_methods"] });
                  }}
                >
                  Set default
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => load(row)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await deleteRecord(row.id);
                  await qc.invalidateQueries({ queryKey: ["module", "payment_methods"] });
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

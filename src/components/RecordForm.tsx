import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { FieldDef, ModuleDef } from "@/lib/modules";
import { listRecords } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ProjectPaymentsEditor } from "@/components/ProjectPaymentsEditor";
import { FileAttachments } from "@/components/FileAttachments";
import { parseAttachments, type Attachment } from "@/lib/attachments";
import { ensureClientRecord } from "@/lib/pipeline";
import { applyCollections, parseCollections, parseProjectPayments, receivedFromPayments, settleIfComplete } from "@/lib/projectPayments";
import { finalizeRecurringSave, isAutomaticPayment } from "@/lib/recurring";
import { applyLendBorrow, expectedTotal, installmentAmount, isLend } from "@/lib/lendBorrow";

const FIELD_OPTION_LABELS: Record<string, Record<string, string>> = {
  direction: { lend: "Lend — maine diya", borrow: "Borrow — maine liya" },
  payout: {
    monthly: "Monthly",
    yearly: "Yearly",
    one_time: "Ek saath (lump sum)",
    ongoing: "Abhi mil / de rahe hain",
  },
  status: { open: "Open", receiving: "Running", overdue: "Overdue", settled: "Settled" },
  payment_mode: {
    manual: "Manual payment — mark received yourself",
    automatic: "Automatic payment — already received on billing date",
  },
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lookupLabelOf(f: FieldDef) {
  return f.lookupLabel || "product";
}

export function RecordForm({
  module,
  defaults,
  onSubmit,
  submitting,
}: {
  module: ModuleDef;
  defaults?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
}) {
  const autoRemain =
    module.fields.some((f) => f.name === "remaining_amount") &&
    module.fields.some((f) => f.name === "total_amount") &&
    module.fields.some((f) => f.name === "advance_amount");

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(module.schema) as never,
    defaultValues: Object.fromEntries(
      module.fields.map((f) => {
        const d = defaults?.[f.name];
        if (d !== undefined && !(f.kind === "select" && String(d) === "")) return [f.name, d];
        if (f.kind === "number") return [f.name, f.name === "quantity" ? 1 : 0];
        if (f.kind === "checkbox") return [f.name, false];
        if (f.kind === "select") return [f.name, f.options?.[0] ?? ""];
        if (f.kind === "date" && (f.name === "date" || f.name === "added_at") && module.id === "project_addons") {
          return [f.name, new Date().toISOString().slice(0, 10)];
        }
        if (f.kind === "time") {
          return [f.name, new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })];
        }
        return [f.name, ""];
      }),
    ),
  });

  const total = form.watch("total_amount");
  const advance = form.watch("advance_amount");
  const quantity = form.watch("quantity");
  const product = form.watch("product");
  const lbAmount = form.watch("amount");
  const lbRoi = form.watch("roi_percent");
  const lbPayout = form.watch("payout");
  const lbStart = form.watch("start_date");
  const lbDue = form.watch("due_date");
  const lbDirection = form.watch("direction");
  const isProject = module.id === "projects";
  const isRecurring = module.id === "recurring_earnings";
  const isLendBorrow = module.id === "lend_borrow";
  const [pays, setPays] = useState(() => parseProjectPayments(defaults));
  const [cols, setCols] = useState(() => parseCollections(defaults));
  const [files, setFiles] = useState<Attachment[]>(() => parseAttachments(defaults?.attachments));
  const wantsFiles = ["projects", "invoices", "quotations"].includes(module.id);

  const hasClientField = module.id !== "clients" && module.fields.some((f) => f.name === "client");
  const lookupMods = [...new Set(module.fields.filter((f) => f.kind === "lookup" && f.lookupModule).map((f) => f.lookupModule!))];
  if (isProject) lookupMods.push("invoices");
  if (hasClientField) lookupMods.push("clients");
  const catalogs = useQuery({
    queryKey: ["lookups", lookupMods.join(",")],
    queryFn: async () => {
      const pairs = await Promise.all(lookupMods.map(async (id) => [id, await listRecords(id)] as const));
      return Object.fromEntries(pairs);
    },
    enabled: lookupMods.length > 0,
  });

  useEffect(() => {
    if (!autoRemain) return;
    const received = isProject ? receivedFromPayments(pays) : money(advance);
    form.setValue("advance_amount", received, { shouldValidate: true });
    form.setValue("remaining_amount", Math.max(0, money(total) - received), { shouldValidate: true });
  }, [autoRemain, isProject, total, advance, pays, form]);

  useEffect(() => {
    if (!isLendBorrow) return;
    const data = {
      amount: lbAmount,
      roi_percent: lbRoi,
      payout: lbPayout,
      start_date: lbStart,
      due_date: lbDue,
    };
    form.setValue("expected_return", expectedTotal(lbAmount, lbRoi), { shouldValidate: true });
    form.setValue("installment_amount", installmentAmount(data), { shouldValidate: true });
    const paid = cols.length ? receivedFromPayments(cols) : money(form.getValues("received_amount"));
    form.setValue("received_amount", paid, { shouldValidate: true });
    form.setValue("remaining_amount", Math.max(0, expectedTotal(lbAmount, lbRoi) - paid), { shouldValidate: true });
  }, [isLendBorrow, lbAmount, lbRoi, lbPayout, lbStart, lbDue, cols, form]);

  useEffect(() => {
    if (module.id !== "cosmofeed") return;
    const rows = catalogs.data?.cosmofeed_products ?? [];
    const name = String(product || "");
    const row = rows.find((r) => String(r.data.product || "") === name);
    if (!row) return;
    const qty = Math.max(1, money(quantity) || 1);
    const unit = money(row.data.price);
    const gst = money(row.data.gst_amount);
    form.setValue("price", unit, { shouldValidate: true });
    form.setValue("gst_amount", gst * qty, { shouldValidate: true });
    form.setValue("amount", unit * qty, { shouldValidate: true });
    if (money(quantity) < 1) form.setValue("quantity", qty, { shouldValidate: true });
  }, [module.id, catalogs.data, product, quantity, form]);

  const clientRows = [...(catalogs.data?.clients ?? [])].sort((a, b) =>
    String(a.data.name || "").localeCompare(String(b.data.name || ""), "en", { sensitivity: "base" }),
  );
  const names = new Set(module.fields.map((f) => f.name));

  useEffect(() => {
    if (!hasClientField || !clientRows.length) return;
    if (String(form.getValues("client_id") || "")) return;
    const name = String(form.getValues("client") || "")
      .trim()
      .toLowerCase();
    if (!name) return;
    const row = clientRows.find((r) => String(r.data.name || "").trim().toLowerCase() === name);
    if (row) form.setValue("client_id", row.id);
  }, [hasClientField, clientRows, form]);

  function fieldVisible(f: FieldDef) {
    if (!f.showWhen) return true;
    return String(form.watch(f.showWhen.field) ?? "") === f.showWhen.equals;
  }

  function applyExistingClient(id: string) {
    if (!id) {
      form.setValue("client_id", "");
      return;
    }
    const row = clientRows.find((r) => r.id === id);
    if (!row) return;
    const name = String(row.data.name || "").trim();
    form.setValue("client_id", row.id, { shouldValidate: true });
    if (name) form.setValue("client", name, { shouldValidate: true });
    if (names.has("client_email")) form.setValue("client_email", String(row.data.email || ""), { shouldValidate: true });
    if (names.has("client_phone")) form.setValue("client_phone", String(row.data.phone || ""), { shouldValidate: true });
    if (names.has("client_gstin")) form.setValue("client_gstin", String(row.data.gstin || ""), { shouldValidate: true });
    if (names.has("client_address")) form.setValue("client_address", String(row.data.address || ""), { shouldValidate: true });
  }

  function applyLookup(f: FieldDef, label: string) {
    form.setValue(f.name, label, { shouldValidate: true });
    const rows = catalogs.data?.[f.lookupModule || ""] ?? [];
    const key = lookupLabelOf(f);
    const row = rows.find((r) => String(r.data[key] || "") === label);
    if (!label) {
      if (f.lookupModule === "projects") form.setValue("project_id", "");
      return;
    }
    if (!row) return;
    if (f.lookupModule === "projects") form.setValue("project_id", row.id);
    if (!f.fillFrom) return;
    for (const [dest, src] of Object.entries(f.fillFrom)) {
      const fromData = src === "id" ? row.id : row.data[src];
      form.setValue(dest, fromData, { shouldValidate: true });
    }
  }

  const clientName = String(form.watch("client") || "");
  const clientId = String(form.watch("client_id") || "");
  const payMethod = String(form.watch("payment_method") || "UPI");
  const paymentMode = String(form.watch("payment_mode") || "manual");

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (v) => {
        if (isProject) {
          Object.assign(v, settleIfComplete(v, pays));
        } else if (isRecurring) {
          Object.assign(v, finalizeRecurringSave(v, cols));
        } else if (isLendBorrow) {
          Object.assign(v, applyCollections(applyLendBorrow(v, cols), cols));
        } else if (autoRemain) {
          v.remaining_amount = Math.max(0, money(v.total_amount) - money(v.advance_amount));
        }
        if (wantsFiles) v.attachments = files;
        if (module.id !== "clients" && (String(v.client ?? "").trim() || String(v.client_email ?? "").trim())) {
          const client = await ensureClientRecord(v);
          if (client) {
            v.client_id = client.id;
            v.client = String(client.data.name || v.client || "");
            if (!String(v.client_email ?? "").trim()) v.client_email = client.data.email || "";
            if (!String(v.client_phone ?? "").trim()) v.client_phone = client.data.phone || "";
          }
        }
        for (const f of module.fields) {
          if (f.showWhen && String(v[f.showWhen.field] ?? "") !== f.showWhen.equals) {
            v[f.name] = f.kind === "number" ? 0 : f.kind === "checkbox" ? false : "";
          }
        }
        await onSubmit(v);
      })}
    >
      {module.fields.map((f) => {
        if (isProject && f.name === "advance_amount") return null;
        if (isRecurring && (f.name === "last_paid_date" || f.name === "last_paid_amount")) return null;
        if (isLendBorrow && ["expected_return", "remaining_amount", "installment_amount", "received_amount"].includes(f.name)) return null;
        if (f.name === "project_id" || f.name === "client_id") return null;
        if (!fieldVisible(f)) return null;
        const err = form.formState.errors[f.name]?.message as string | undefined;
        const derived = autoRemain && (f.name === "remaining_amount" || (isProject && f.name === "advance_amount"));
        const lookupRows = f.kind === "lookup" ? catalogs.data?.[f.lookupModule || ""] ?? [] : [];
        const current = f.kind === "lookup" ? String(form.watch(f.name) || "") : "";
        const labels = lookupRows
          .filter((r) => r.data.active !== false)
          .map((r) => String(r.data[lookupLabelOf(f)] || "").trim())
          .filter(Boolean);
        const unique = [...new Set(labels)];
        if (current && !unique.includes(current)) unique.unshift(current);
        const selectClass =
          "h-11 w-full min-w-0 rounded-lg border border-gold/20 bg-ink/60 px-3 text-base touch-manipulation transition focus:border-gold/70 sm:h-10";
        const wide =
          f.kind === "textarea" ||
          ["name", "title", "client", "notes", "file_url", "item", "address", "body", "message", "description"].includes(f.name);
        const fieldBlock = (
          <div key={f.name} className={wide ? "grid gap-1 sm:col-span-2" : "grid min-w-0 gap-1"}>
            {hasClientField && f.name === "client" ? (
              <div className="grid gap-1">
                <Label htmlFor="existing_client">
                  Existing client
                  <span className="ml-1 text-paper/40">(optional)</span>
                </Label>
                <select
                  id="existing_client"
                  className={selectClass}
                  value={clientId}
                  onChange={(e) => applyExistingClient(e.target.value)}
                >
                  <option value="">Naya client — name type karo</option>
                  {clientRows.map((r) => {
                    const name = String(r.data.name || "").trim() || r.id;
                    const extra = String(r.data.company || r.data.email || "").trim();
                    return (
                      <option key={r.id} value={r.id}>
                        {extra ? `${name} · ${extra}` : name}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
            <Label htmlFor={f.name}>
              {f.label}
              {derived ? <span className="ml-1 text-paper/40">(auto)</span> : null}
              {f.kind === "lookup" ? <span className="ml-1 text-paper/40">(select)</span> : null}
              {f.optional ? <span className="ml-1 text-paper/40">(optional)</span> : null}
            </Label>
            {f.kind === "textarea" ? (
              <Textarea id={f.name} {...form.register(f.name)} />
            ) : f.kind === "select" ? (
              <select id={f.name} className={selectClass} {...form.register(f.name)}>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {FIELD_OPTION_LABELS[f.name]?.[o] ?? o}
                  </option>
                ))}
              </select>
            ) : f.kind === "lookup" ? (
              <select
                id={f.name}
                className={selectClass}
                value={current}
                onChange={(e) => applyLookup(f, e.target.value)}
              >
                <option value="">{f.optional ? "None" : "Select"}</option>
                {unique.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.kind === "checkbox" ? (
              <input id={f.name} type="checkbox" className="h-4 w-4" {...form.register(f.name)} />
            ) : (
              (() => {
                const reg = form.register(f.name, { valueAsNumber: f.kind === "number" });
                return (
                  <Input
                    id={f.name}
                    type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "time" ? "time" : "text"}
                    step={f.kind === "number" ? "1" : undefined}
                    readOnly={derived}
                    inputMode={f.kind === "number" ? "decimal" : undefined}
                    autoComplete={f.name === "client" || f.name === "name" ? "name" : f.name.includes("email") ? "email" : f.name.includes("phone") ? "tel" : "off"}
                    {...reg}
                    className={derived ? "cursor-not-allowed opacity-80 sm:text-base" : "sm:text-base"}
                    onChange={(e) => {
                      void reg.onChange(e);
                      if (f.name !== "client") return;
                      const typed = e.target.value.trim().toLowerCase();
                      const row = clientRows.find((r) => r.id === String(form.getValues("client_id") || ""));
                      if (row && typed && typed !== String(row.data.name || "").trim().toLowerCase()) {
                        form.setValue("client_id", "");
                      }
                    }}
                  />
                );
              })()
            )}
            {err ? <p className="text-xs text-red-600">{err}</p> : null}
          </div>
        );
        if (isProject && f.name === "total_amount") {
          return (
            <div key="project-total-pays" className="grid gap-3 sm:col-span-2">
              {fieldBlock}
              <ProjectPaymentsEditor
                client={clientName}
                total={money(total)}
                method={payMethod}
                pays={pays}
                onChange={setPays}
                invoices={(catalogs.data?.invoices ?? [])
                  .filter((r) => {
                    const who = clientName.toLowerCase();
                    return (
                      (!who && !clientId) ||
                      String(r.data.client_id || "") === clientId ||
                      String(r.data.client || "").toLowerCase() === who
                    );
                  })
                  .map((r) => ({
                    id: r.id,
                    label: `${String(r.data.invoice_no || "INV")} · ${String(r.data.status || "")} · ${money(r.data.amount)}`,
                  }))}
              />
            </div>
          );
        }
        return fieldBlock;
      })}
      {isRecurring ? (
        <div className="sm:col-span-2">
          <ProjectPaymentsEditor
            client={clientName || "retainer"}
            total={0}
            method={payMethod}
            pays={cols}
            onChange={setCols}
            openEnded
            title={isAutomaticPayment({ payment_mode: paymentMode }) ? "Automatic receipts" : "Manual receipts"}
            hint={
              isAutomaticPayment({ payment_mode: paymentMode })
                ? "On each billing date this is recorded as received and balances update. Due is not shown."
                : "Add a receipt when money actually arrives. Until then this stays due."
            }
          />
        </div>
      ) : null}
      {isLendBorrow ? (
        <div className="grid gap-3 sm:col-span-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gold/20 bg-gold/5 p-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-paper/45">Principal + ROI</div>
              <div className="font-medium">{expectedTotal(lbAmount, lbRoi).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div className="text-paper/45">Installment</div>
              <div className="font-medium">{installmentAmount({ amount: lbAmount, roi_percent: lbRoi, payout: lbPayout, start_date: lbStart, due_date: lbDue }).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div className="text-paper/45">Settled</div>
              <div className="font-medium">{receivedFromPayments(cols).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div className="text-paper/45">Remaining</div>
              <div className="font-medium">{Math.max(0, expectedTotal(lbAmount, lbRoi) - receivedFromPayments(cols)).toLocaleString("en-IN")}</div>
            </div>
          </div>
          <ProjectPaymentsEditor
            client={String(form.watch("party") || "person")}
            total={expectedTotal(lbAmount, lbRoi)}
            method={payMethod}
            pays={cols}
            onChange={setCols}
            title={isLend({ direction: lbDirection }) ? "Wapas milne wali rashi (EMI / lump sum)" : "Wapas dene wali rashi (EMI / lump sum)"}
            hint={
              isLend({ direction: lbDirection })
                ? "Jitna unhone wapas diya — date ke sath. Monthly/yearly ho to har installment yahan."
                : "Jitna tumne wapas kiya — date ke sath. Monthly/yearly ho to har installment yahan."
            }
          />
        </div>
      ) : null}
      {wantsFiles ? (
        <div className="sm:col-span-2">
          <FileAttachments files={files} onChange={setFiles} />
        </div>
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-3 mt-1 border-t border-gold/15 bg-panel/95 px-3 py-3 backdrop-blur-md sm:static sm:col-span-2 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-1 sm:backdrop-blur-none">
        <Button type="submit" className="h-12 w-full touch-manipulation sm:h-10 sm:w-auto" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

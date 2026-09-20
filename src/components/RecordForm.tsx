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
import { applyCollections, parseCollections, parseProjectPayments, receivedFromPayments, settleIfComplete } from "@/lib/projectPayments";

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
        if (d !== undefined) return [f.name, d];
        if (f.kind === "number") return [f.name, f.name === "quantity" ? 1 : 0];
        if (f.kind === "checkbox") return [f.name, false];
        if (f.kind === "select") return [f.name, f.options?.[0] ?? ""];
        return [f.name, ""];
      }),
    ),
  });

  const total = form.watch("total_amount");
  const advance = form.watch("advance_amount");
  const quantity = form.watch("quantity");
  const product = form.watch("product");
  const isProject = module.id === "projects";
  const isRecurring = module.id === "recurring_earnings";
  const [pays, setPays] = useState(() => parseProjectPayments(defaults));
  const [cols, setCols] = useState(() => parseCollections(defaults));
  const [files, setFiles] = useState<Attachment[]>(() => parseAttachments(defaults?.attachments));
  const wantsFiles = ["projects", "invoices", "quotations"].includes(module.id);

  const lookupMods = [...new Set(module.fields.filter((f) => f.kind === "lookup" && f.lookupModule).map((f) => f.lookupModule!))];
  if (isProject) lookupMods.push("invoices");
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

  function fieldVisible(f: FieldDef) {
    if (!f.showWhen) return true;
    return String(form.watch(f.showWhen.field) ?? "") === f.showWhen.equals;
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

  return (
    <form
      className="grid gap-3 pb-2"
      onSubmit={form.handleSubmit(async (v) => {
        if (isProject) {
          Object.assign(v, settleIfComplete(v, pays));
        } else if (isRecurring) {
          Object.assign(v, applyCollections(v, cols));
        } else if (autoRemain) {
          v.remaining_amount = Math.max(0, money(v.total_amount) - money(v.advance_amount));
        }
        if (wantsFiles) v.attachments = files;
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
        if (f.name === "project_id") return null;
        if (!fieldVisible(f)) return null;
        const err = form.formState.errors[f.name]?.message as string | undefined;
        const derived = autoRemain && (f.name === "remaining_amount" || (isProject && f.name === "advance_amount"));
        const lookupRows = f.kind === "lookup" ? catalogs.data?.[f.lookupModule || ""] ?? [] : [];
        const current = String(form.watch(f.name) || "");
        const labels = lookupRows
          .filter((r) => r.data.active !== false)
          .map((r) => String(r.data[lookupLabelOf(f)] || "").trim())
          .filter(Boolean);
        const unique = [...new Set(labels)];
        if (current && !unique.includes(current)) unique.unshift(current);
        const fieldBlock = (
          <div key={f.name} className="grid gap-1">
            <Label htmlFor={f.name}>
              {f.label}
              {derived ? <span className="ml-1 text-paper/40">(auto)</span> : null}
              {f.kind === "lookup" ? <span className="ml-1 text-paper/40">(select)</span> : null}
              {f.optional ? <span className="ml-1 text-paper/40">(optional)</span> : null}
            </Label>
            {f.kind === "textarea" ? (
              <Textarea id={f.name} {...form.register(f.name)} />
            ) : f.kind === "select" ? (
              <select
                id={f.name}
                className="h-11 w-full rounded-lg border border-gold/20 bg-ink/60 px-3 text-base transition focus:border-gold/70 sm:h-10 sm:text-sm"
                {...form.register(f.name)}
              >
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.kind === "lookup" ? (
              <select
                id={f.name}
                className="h-11 w-full rounded-lg border border-gold/20 bg-ink/60 px-3 text-base transition focus:border-gold/70 sm:h-10 sm:text-sm"
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
              <Input
                id={f.name}
                type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                step={f.kind === "number" ? "1" : undefined}
                readOnly={derived}
                className={derived ? "cursor-not-allowed opacity-80" : undefined}
                {...form.register(f.name, { valueAsNumber: f.kind === "number" })}
              />
            )}
            {err ? <p className="text-xs text-red-600">{err}</p> : null}
          </div>
        );
        if (isProject && f.name === "total_amount") {
          return (
            <div key="project-total-pays" className="grid gap-3">
              {fieldBlock}
              <ProjectPaymentsEditor
                client={String(form.watch("client") || "")}
                total={money(total)}
                method={String(form.watch("payment_method") || "UPI")}
                pays={pays}
                onChange={setPays}
                invoices={(catalogs.data?.invoices ?? [])
                  .filter((r) => {
                    const who = String(form.watch("client") || "").toLowerCase();
                    const cid = String(form.watch("client_id") || "");
                    return (
                      (!who && !cid) ||
                      String(r.data.client_id || "") === cid ||
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
        <ProjectPaymentsEditor
          client={String(form.watch("client") || "retainer")}
          total={0}
          method={String(form.watch("payment_method") || "UPI")}
          pays={cols}
          onChange={setCols}
          openEnded
        />
      ) : null}
      {wantsFiles ? <FileAttachments files={files} onChange={setFiles} /> : null}
      <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

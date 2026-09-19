import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ModuleDef } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
  const autoRemain = module.fields.some((f) => f.name === "remaining_amount") &&
    module.fields.some((f) => f.name === "total_amount") &&
    module.fields.some((f) => f.name === "advance_amount");

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(module.schema) as never,
    defaultValues: Object.fromEntries(
      module.fields.map((f) => {
        const d = defaults?.[f.name];
        if (d !== undefined) return [f.name, d];
        if (f.kind === "number") return [f.name, 0];
        if (f.kind === "checkbox") return [f.name, false];
        if (f.kind === "select") return [f.name, f.options?.[0] ?? ""];
        return [f.name, ""];
      }),
    ),
  });

  const total = form.watch("total_amount");
  const advance = form.watch("advance_amount");

  useEffect(() => {
    if (!autoRemain) return;
    form.setValue("remaining_amount", Math.max(0, money(total) - money(advance)), { shouldValidate: true });
  }, [autoRemain, total, advance, form]);

  return (
    <form
      className="grid gap-3 pb-2"
      onSubmit={form.handleSubmit(async (v) => {
        if (autoRemain) {
          v.remaining_amount = Math.max(0, money(v.total_amount) - money(v.advance_amount));
        }
        await onSubmit(v);
      })}
    >
      {module.fields.map((f) => {
        const err = form.formState.errors[f.name]?.message as string | undefined;
        const derived = autoRemain && f.name === "remaining_amount";
        return (
          <div key={f.name} className="grid gap-1">
            <Label htmlFor={f.name}>
              {f.label}
              {derived ? <span className="ml-1 text-paper/40">(auto)</span> : null}
              {f.optional ? <span className="ml-1 text-paper/40">(optional)</span> : null}
            </Label>
            {f.kind === "textarea" ? (
              <Textarea id={f.name} {...form.register(f.name)} />
            ) : f.kind === "select" ? (
              <select
                id={f.name}
                className="h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-base sm:h-10 sm:text-sm"
                {...form.register(f.name)}
              >
                {f.options?.map((o) => (
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
            {err ? <p className="text-xs text-red-400">{err}</p> : null}
          </div>
        );
      })}
      <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

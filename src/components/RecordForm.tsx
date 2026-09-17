import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ModuleDef } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

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

  return (
    <form
      className="grid gap-3"
      onSubmit={form.handleSubmit(async (v) => {
        await onSubmit(v);
      })}
    >
      {module.fields.map((f) => {
        const err = form.formState.errors[f.name]?.message as string | undefined;
        return (
          <div key={f.name} className="grid gap-1">
            <Label htmlFor={f.name}>
              {f.label}
              {f.optional ? <span className="ml-1 text-paper/40">(optional)</span> : null}
            </Label>
            {f.kind === "textarea" ? (
              <Textarea id={f.name} {...form.register(f.name)} />
            ) : f.kind === "select" ? (
              <select
                id={f.name}
                className="h-10 rounded-lg border border-line bg-ink/60 px-3"
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
                {...form.register(f.name, { valueAsNumber: f.kind === "number" })}
              />
            )}
            {err ? <p className="text-xs text-red-400">{err}</p> : null}
          </div>
        );
      })}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

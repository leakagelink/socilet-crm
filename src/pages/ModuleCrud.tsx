import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { deleteRecord, insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import type { ModuleDef } from "@/lib/modules";
import { RecordForm } from "@/components/RecordForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { inr } from "@/lib/utils";

function cell(v: unknown) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? inr(v) : String(v);
  return String(v ?? "");
}

export function ModuleCrud({
  module,
  extra,
  hideHeader,
}: {
  module: ModuleDef;
  extra?: ReactNode;
  hideHeader?: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["module", module.id],
    queryFn: () => listRecords(module.id),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (editing) await updateRecord(editing.id, values);
      else await insertRecord(module.id, values);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: deleteRecord,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  return (
    <div className="grid gap-4">
      {!hideHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{module.title}</h1>
            <p className="text-sm text-paper/60">{module.description}</p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New row
          </Button>
        </div>
      )}
      {extra}
      {q.isLoading ? <Card>Loading…</Card> : null}
      {q.isError ? <Card className="text-red-300">Could not load records.</Card> : null}
      {q.data && q.data.length === 0 ? <Card>No rows yet. Create the first {module.title.toLowerCase()} record.</Card> : null}
      {q.data && q.data.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-panel">
              <tr>
                {module.fields.map((f) => (
                  <th key={f.name} className="px-3 py-2 font-medium text-paper/70">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {q.data.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  {module.fields.map((f) => (
                    <td key={f.name} className="max-w-48 truncate px-3 py-2">
                      {f.kind === "number" ? (typeof row.data[f.name] === "number" ? inr(row.data[f.name] as number) : cell(row.data[f.name])) : cell(row.data[f.name])}
                    </td>
                  ))}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(row);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(row.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${module.title}` : `New ${module.title}`}
      >
        <RecordForm
          key={editing?.id ?? "new"}
          module={module}
          defaults={editing?.data}
          submitting={save.isPending}
          onSubmit={(v) => save.mutateAsync(v)}
        />
        {save.isError ? <p className="mt-2 text-sm text-red-400">Save failed. Check the fields.</p> : null}
      </Modal>
    </div>
  );
}

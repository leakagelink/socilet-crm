import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { moduleById } from "@/lib/modules";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { RecordForm } from "@/components/RecordForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const COLS = ["todo", "in_progress", "review", "done"] as const;

export function TasksPage() {
  const module = moduleById("tasks")!;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["module", "tasks"], queryFn: () => listRecords("tasks") });
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => insertRecord("tasks", values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["module", "tasks"] }),
  });

  const move = useMutation({
    mutationFn: async ({ row, status }: { row: RecordRow; status: string }) => {
      await updateRecord(row.id, { ...row.data, status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["module", "tasks"] }),
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader kicker="Work" title="Tasks" description="Kanban — move cards between columns, or add a new task." />
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          New task
        </Button>
      </div>
      {q.isLoading ? <Card>Loading…</Card> : null}
      {q.isError ? <Card className="text-red-300">Could not load tasks.</Card> : null}
      {q.data && q.data.length === 0 ? <Card>No tasks. Add one to fill the board.</Card> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col) => {
          const items = (q.data ?? []).filter((r) => String(r.data.status) === col);
          return (
            <div key={col} className="kanban-col rounded-2xl border border-white/10 bg-panel/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-gold/80">
                <span>{col.replace("_", " ")}</span>
                <span className="rounded-full bg-white/8 px-2 py-0.5 text-paper/50">{items.length}</span>
              </div>
              <div className="grid gap-2">
                {items.map((row) => (
                  <Card key={row.id} className="shine p-3">
                    <div className="font-medium">{String(row.data.title)}</div>
                    <div className="text-xs text-paper/50">
                      {String(row.data.priority)} · {String(row.data.assignee)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {COLS.filter((c) => c !== col).map((c) => (
                        <Button key={c} size="sm" variant="outline" onClick={() => move.mutate({ row, status: c })}>
                          {c.replace("_", " ")}
                        </Button>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="New task">
        <RecordForm
          module={module}
          submitting={save.isPending}
          onSubmit={async (v) => {
            await save.mutateAsync(v);
            setOpen(false);
          }}
        />
      </Modal>
      <p className={cn("text-xs text-paper/40")}>Table CRUD (edit / delete) below the board.</p>
      <ModuleCrud module={module} hideHeader />
    </div>
  );
}

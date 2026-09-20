import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { moduleById } from "@/lib/modules";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { RecordForm } from "@/components/RecordForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DateChip, RemainingChip, StatusBadge } from "@/components/HighlightCell";
import { cn } from "@/lib/utils";

const COLS = ["todo", "in_progress", "review", "done"] as const;

export function TasksPage() {
  const module = moduleById("tasks")!;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["module", "tasks"], queryFn: () => listRecords("tasks") });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return q.data ?? [];
    return (q.data ?? []).filter((row) =>
      `${row.data.title} ${row.data.assignee} ${row.data.priority} ${row.data.status}`.toLowerCase().includes(needle),
    );
  }, [q.data, search]);

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
    <div className="grid min-w-0 gap-4 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <PageHeader kicker="Work" title="Tasks" description="Kanban — cards move between columns, dashboard-style." />
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          New task
        </Button>
      </div>
      <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
        {COLS.map((col) => {
          const n = (q.data ?? []).filter((r) => String(r.data.status) === col).length;
          return (
            <div key={col} className="shine rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/15 to-panel p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">{col.replaceAll("_", " ")}</div>
              <div className="mt-1 font-display text-2xl">{n}</div>
            </div>
          );
        })}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks" className="pl-9" />
      </div>
      {q.isLoading ? <Card>Loading…</Card> : null}
      {q.isError ? <Card className="text-red-300">Could not load tasks.</Card> : null}
      {q.data && q.data.length === 0 ? <Card>No tasks. Add one to fill the board.</Card> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col) => {
          const items = filtered.filter((r) => String(r.data.status) === col);
          return (
            <div key={col} className="kanban-col min-h-48 rounded-2xl border border-gold/20 bg-panel/80 p-3 shadow-[0_18px_40px_-28px_rgba(11,22,36,0.18)]">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-gold/80">
                <StatusBadge value={col} />
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-paper/70">{items.length}</span>
              </div>
              <div className="grid gap-2">
                {items.map((row) => (
                  <Card key={row.id} className="shine p-3">
                    <div className="font-medium">{String(row.data.title)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <StatusBadge value={row.data.priority} />
                      <DateChip value={row.data.due_date} field="due_date" />
                      <RemainingChip value={row.data.due_date} />
                    </div>
                    <div className="mt-1 text-xs text-paper/50">{String(row.data.assignee || "")}</div>
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

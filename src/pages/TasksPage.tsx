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
import { TaskPinPad } from "@/components/TaskPinPad";
import { Lock, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DateChip, RemainingChip, StatusBadge } from "@/components/HighlightCell";
import { useTaskLock } from "@/hooks/useTaskLock";
import {
  changeTaskPin,
  disableTaskLock,
  enableTaskLock,
  formatTaskWhen,
  lockTasksNow,
  setupTaskLock,
  taskLockConfigured,
  tryUnlockTasks,
} from "@/lib/taskLock";
import { cn } from "@/lib/utils";

const COLS = ["todo", "in_progress", "review", "done"] as const;

export function TasksPage() {
  const module = moduleById("tasks")!;
  const qc = useQueryClient();
  const { locked, enabled, unlocked } = useTaskLock();
  const q = useQuery({ queryKey: ["module", "tasks"], queryFn: () => listRecords("tasks") });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [lockModal, setLockModal] = useState<"setup" | "unlock" | "change" | "off" | null>(null);
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
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {enabled && unlocked ? (
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => lockTasksNow()}>
              <Lock className="h-4 w-4" />
              Lock
            </Button>
          ) : null}
          {enabled ? (
            <>
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setLockModal("change")}>
                Change PIN
              </Button>
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setLockModal("off")}>
                Turn lock off
              </Button>
            </>
          ) : (
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => (taskLockConfigured() ? enableTaskLock() : setLockModal("setup"))}>
              <Lock className="h-4 w-4" />
              Lock with PIN
            </Button>
          )}
          {!locked ? (
            <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
              New task
            </Button>
          ) : null}
        </div>
      </div>

      {locked ? (
        <Card className="mx-auto w-full max-w-md p-5">
          <div className="mb-4 flex items-center gap-2 text-gold">
            <Lock className="h-5 w-5" />
            <h2 className="font-display text-xl">Tasks locked</h2>
          </div>
          <p className="mb-4 text-sm text-paper/55">Enter PIN to open the board. Home only shows urgent alerts until then.</p>
          <TaskPinPad
            onSubmit={async (pin) => {
              const ok = await tryUnlockTasks(pin);
              if (!ok) throw new Error("Wrong PIN.");
            }}
          />
        </Card>
      ) : (
        <>
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
                    {items.map((row) => {
                      const when = formatTaskWhen(row.data);
                      return (
                        <Card key={row.id} className="shine p-3">
                          <div className="font-medium">{String(row.data.title)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <StatusBadge value={row.data.priority} />
                            <DateChip value={row.data.due_date} field="due_date" />
                            <RemainingChip value={row.data.due_date} />
                          </div>
                          {row.data.due_date ? (
                            <div className="mt-1 text-xs text-paper/45">
                              {when.date} · {when.time}
                            </div>
                          ) : null}
                          <div className="mt-1 text-xs text-paper/50">{String(row.data.assignee || "")}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {COLS.filter((c) => c !== col).map((c) => (
                              <Button key={c} size="sm" variant="outline" onClick={() => move.mutate({ row, status: c })}>
                                {c.replace("_", " ")}
                              </Button>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
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
        </>
      )}

      <Modal open={lockModal === "setup"} onOpenChange={(v) => !v && setLockModal(null)} title="Lock tasks with PIN">
        <p className="mb-3 text-sm text-paper/55">Home will hide the task list. Urgent items show only countdown, date, and time until you enter this PIN.</p>
        <TaskPinPad
          label="New PIN"
          submitLabel="Turn lock on"
          onSubmit={async (pin) => {
            await setupTaskLock(pin);
            setLockModal(null);
          }}
        />
      </Modal>
      <Modal open={lockModal === "change"} onOpenChange={(v) => !v && setLockModal(null)} title="Change task PIN">
        <ChangePinForm
          onDone={() => setLockModal(null)}
        />
      </Modal>
      <Modal open={lockModal === "off"} onOpenChange={(v) => !v && setLockModal(null)} title="Turn task lock off">
        <TaskPinPad
          submitLabel="Turn off"
          onSubmit={async (pin) => {
            await disableTaskLock(pin);
            setLockModal(null);
          }}
        />
      </Modal>
    </div>
  );
}

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        void changeTaskPin(current, next)
          .then(onDone)
          .catch((e) => setErr(e instanceof Error ? e.message : "Could not change PIN."))
          .finally(() => setBusy(false));
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="text-paper/60">Current PIN</span>
        <Input type="password" inputMode="numeric" maxLength={8} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, "").slice(0, 8))} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-paper/60">New PIN</span>
        <Input type="password" inputMode="numeric" maxLength={8} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 8))} />
      </label>
      {err ? <p className="text-sm text-rose-300">{err}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save PIN"}
      </Button>
    </form>
  );
}

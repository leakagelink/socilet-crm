import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { TaskPinPad } from "@/components/TaskPinPad";
import { RemainingChip, StatusBadge } from "@/components/HighlightCell";
import { useTaskLock } from "@/hooks/useTaskLock";
import { listRecords } from "@/lib/db";
import { countdownParts } from "@/lib/highlights";
import { formatTaskWhen, isOpenTask, isUrgentTask, taskDueAt, tryUnlockTasks } from "@/lib/taskLock";
import { cn } from "@/lib/utils";

function LiveCountdown({ due }: { due: Date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const { text, late } = countdownParts(due);
  return (
    <span className={cn("font-display text-lg tabular-nums", late ? "text-rose-200" : "text-amber-100")}>{text}</span>
  );
}

export function HomeTasksSection() {
  const { locked, enabled } = useTaskLock();
  const [pinOpen, setPinOpen] = useState(false);
  const q = useQuery({
    queryKey: ["module", "tasks"],
    queryFn: () => listRecords("tasks"),
    refetchInterval: 30_000,
  });
  const open = useMemo(() => (q.data ?? []).filter(isOpenTask), [q.data]);
  const urgent = useMemo(() => open.filter(isUrgentTask), [open]);

  return (
    <Card className="min-w-0 overflow-hidden p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">Tasks</h2>
        {enabled ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold/80">
            <Lock className="h-3 w-3" />
            {locked ? "Locked" : "Unlocked"}
          </span>
        ) : null}
      </div>

      {locked ? (
        urgent.length ? (
          <div className="grid gap-2">
            {urgent.map((row) => {
              const due = taskDueAt(row.data);
              const when = formatTaskWhen(row.data);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setPinOpen(true)}
                  className="w-full rounded-2xl border border-rose-400/50 bg-gradient-to-br from-rose-700/90 to-orange-700/70 p-3 text-left text-white shadow-lg"
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Urgent alert
                  </div>
                  <div className="mt-2">{due ? <LiveCountdown due={due} /> : <span className="text-sm text-white/70">No due time</span>}</div>
                  <div className="mt-1 text-xs text-white/80">
                    {when.date} · {when.time}
                  </div>
                  <div className="mt-2 text-[11px] text-white/65">Enter PIN to view</div>
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPinOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-gold/20 bg-gold/8 px-3 py-4 text-left"
          >
            <span className="text-sm text-paper/55">Tasks are hidden. Enter PIN to unhide.</span>
            <Lock className="h-4 w-4 text-gold/70" />
          </button>
        )
      ) : open.length === 0 ? (
        <p className="text-sm text-paper/45">
          No open tasks.{" "}
          <Link to="/tasks" className="text-gold">
            Open board
          </Link>
        </p>
      ) : (
        <div className="grid gap-2">
          {open.slice(0, 6).map((row) => {
            const when = formatTaskWhen(row.data);
            return (
              <Link
                key={row.id}
                to="/tasks"
                className="rounded-xl border border-gold/20 bg-gold/5 px-3 py-2"
              >
                <div className="truncate font-medium">{String(row.data.title || "Task")}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <StatusBadge value={row.data.priority} />
                  <RemainingChip value={row.data.due_date} />
                  <span className="text-[11px] text-paper/45">
                    {when.date} · {when.time}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={pinOpen} onOpenChange={setPinOpen} title="Unlock tasks">
        <p className="mb-3 text-sm text-paper/55">Enter PIN to unhide the task list.</p>
        <TaskPinPad
          onSubmit={async (pin) => {
            const ok = await tryUnlockTasks(pin);
            if (!ok) throw new Error("Wrong PIN.");
            setPinOpen(false);
          }}
        />
      </Modal>
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { markAllNotificationsRead, markNotificationRead, syncNotifications } from "@/lib/alerts";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["app-notifications"],
    queryFn: syncNotifications,
    refetchInterval: 30_000,
  });
  const unread = (q.data ?? []).filter((r) => r.data.read !== true);
  const rows = [...(q.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(q.data ?? []),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-notifications"] }),
  });

  return (
    <>
      <Button variant="outline" size="icon" className="relative" aria-label="Notifications" onClick={() => setOpen(true)}>
        <Bell className="h-4 w-4" />
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-gold px-1 text-[10px] font-bold text-ink">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </Button>
      <OverlayPortal open={open} onClose={() => setOpen(false)}>
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close notifications" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            className="sheet-scroll absolute inset-x-3 top-12 bottom-4 z-10 overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl sm:inset-auto sm:right-3 sm:top-3 sm:bottom-auto sm:max-h-[min(32rem,calc(100dvh-1.5rem))] sm:w-[min(24rem,calc(100vw-1.5rem))]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-semibold">Notifications</h2>
              <Button variant="ghost" size="sm" disabled={!unread.length} onClick={() => readAll.mutate()}>
                Mark all read
              </Button>
            </div>
            <div>
              {q.isLoading ? <p className="p-4 text-sm text-paper/50">Checking email, tasks, projects, reminders…</p> : null}
              {q.isError ? <p className="p-4 text-sm text-red-300">Could not refresh alerts.</p> : null}
              {!q.isLoading && rows.length === 0 ? (
                <p className="p-6 text-sm text-paper/45">Koi pending alert nahi. Naye email, due tasks, reminders yahan aayenge.</p>
              ) : null}
              {rows.map((row) => {
                const unreadRow = row.data.read !== true;
                const href = String(row.data.href || "/notifications");
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={cn(
                      "w-full border-b border-line/70 px-4 py-3 text-left",
                      unreadRow ? "bg-gold/8" : "opacity-70",
                    )}
                    onClick={async () => {
                      await readOne.mutateAsync(row);
                      setOpen(false);
                      navigate(href);
                    }}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-gold/80">{String(row.data.level || "info")}</div>
                    <div className="text-sm font-medium">{String(row.data.title)}</div>
                    <div className="text-xs text-paper/55">{String(row.data.message)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </OverlayPortal>
    </>
  );
}

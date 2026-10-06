import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ sociletNotif: true }, "");
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  function closePanel() {
    if (window.history.state?.sociletNotif) window.history.back();
    else setOpen(false);
  }

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
      <OverlayPortal open={open} onClose={closePanel}>
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close notifications" className="absolute inset-0 bg-black/50" onClick={closePanel} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute inset-x-0 top-0 z-10 flex max-h-[min(92dvh,40rem)] flex-col rounded-b-2xl border-b border-gold/20 bg-panel shadow-2xl sm:inset-auto sm:right-3 sm:top-3 sm:max-h-[min(32rem,calc(100dvh-1.5rem))] sm:w-[min(24rem,calc(100vw-1.5rem))] sm:rounded-2xl sm:border"
          >
            <div className="flex shrink-0 items-center gap-1 border-b border-gold/15 bg-white/80 px-2 py-2 pt-[max(0.5rem,var(--sat))] sm:rounded-t-2xl">
              <button
                type="button"
                aria-label="Back"
                className="flex shrink-0 items-center gap-1 rounded-xl bg-gold/10 px-2 py-2 text-sm font-semibold text-gold hover:bg-gold/20"
                onClick={closePanel}
              >
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
              <h2 className="min-w-0 flex-1 truncate px-1 font-semibold">Notifications</h2>
              <Button variant="ghost" size="sm" disabled={!unread.length} onClick={() => readAll.mutate()}>
                Mark read
              </Button>
              <button
                type="button"
                aria-label="Close"
                className="rounded-xl p-2 text-paper/55 hover:bg-gold/10 hover:text-gold"
                onClick={closePanel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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

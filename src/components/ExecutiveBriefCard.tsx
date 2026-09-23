import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { fetchBrief } from "@/lib/aiClient";

export function ExecutiveBriefCard() {
  const brief = useQuery({ queryKey: ["ai-brief"], queryFn: fetchBrief, refetchInterval: 60_000 });
  const snap = brief.data?.data;
  const top = snap?.attention.slice(0, 5) ?? [];
  return (
    <Card className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Executive brief</div>
          <div className="font-display text-xl">What actually matters</div>
        </div>
        <Link to="/agent" className="text-sm text-gold hover:underline">
          Agent
        </Link>
      </div>
      {brief.isError ? <p className="text-sm text-red-400">{(brief.error as Error).message}</p> : null}
      <div className="flex flex-wrap gap-3 text-xs text-paper/50">
        <span>Overdue tasks {snap?.counts.overdue_tasks ?? "—"}</span>
        <span>Invoices due {snap?.counts.invoices_due ?? "—"}</span>
        <span>Running projects {snap?.counts.running_projects ?? "—"}</span>
      </div>
      {top.map((item) => (
        <Link key={`${item.title}-${item.href}`} to={item.href} className="rounded-xl border border-gold/15 px-3 py-2 hover:border-gold/40">
          <div className="text-sm">{item.title}</div>
          <div className="text-[11px] text-paper/45">
            {item.why} · impact {item.impact}
          </div>
        </Link>
      ))}
      {!brief.isLoading && !top.length ? <p className="text-sm text-paper/50">No urgent CRM conflicts right now.</p> : null}
    </Card>
  );
}

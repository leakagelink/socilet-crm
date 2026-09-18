import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { loadFollowUps } from "@/lib/followups";
import { StatusBadge } from "@/components/HighlightCell";
import { cn } from "@/lib/utils";

export function FollowUpsPage() {
  const q = useQuery({ queryKey: ["follow-ups"], queryFn: loadFollowUps, refetchInterval: 30_000 });
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Today"
        title="Follow-ups"
        description="Pending project money, overdue invoices, due tasks, and reminders — WhatsApp from here."
      />
      {q.isLoading ? <Card>Loading…</Card> : null}
      {(q.data ?? []).length === 0 && !q.isLoading ? (
        <Card className="text-sm text-paper/55">Aaj koi follow-up nahi. Overdue invoices aur remaining projects yahan dikhenge.</Card>
      ) : null}
      <div className="grid gap-2">
        {(q.data ?? []).map((item) => (
          <Card key={item.id} className={cn("min-w-0 p-4", item.tone === "overdue" ? "border-rose-400/40" : "")}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge value={item.kind} />
              <StatusBadge value={item.tone} />
            </div>
            <div className="font-medium">{item.title}</div>
            <div className="text-sm text-paper/55">{item.detail}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={item.href}>Open</Link>
              </Button>
              {item.wa ? (
                <Button size="sm" asChild>
                  <a href={item.wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

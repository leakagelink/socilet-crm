import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { loadFollowUps } from "@/lib/followups";
import { alreadyNudgedToday, autoNudgeOn, sendOverdueNudges, setAutoNudge } from "@/lib/nudge";
import { StatusBadge } from "@/components/HighlightCell";
import { cn } from "@/lib/utils";

export function FollowUpsPage() {
  const q = useQuery({ queryKey: ["follow-ups"], queryFn: loadFollowUps, refetchInterval: 30_000 });
  const [auto, setAuto] = useState(autoNudgeOn);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auto || !q.data?.length) return;
    void sendOverdueNudges(q.data).then((r) => {
      if (r.sent) setNudgeMsg(`Auto email sent for ${r.sent} overdue item${r.sent === 1 ? "" : "s"}.`);
    });
  }, [auto, q.data]);

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Today"
        title="Follow-ups"
        description="Pending project money, overdue invoices, due tasks — WhatsApp or email from here."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={auto ? "default" : "outline"}
          size="sm"
          onClick={() => {
            const next = !auto;
            setAutoNudge(next);
            setAuto(next);
          }}
        >
          Auto email {auto ? "on" : "off"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !q.data?.length}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await sendOverdueNudges(q.data ?? []);
              setNudgeMsg(
                r.sent
                  ? `Emailed ${r.sent}. ${r.skipped ? `${r.skipped} skipped.` : ""}`
                  : r.errors[0] || "Nothing to email (need overdue + client email, once a day).",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Email overdue now"}
        </Button>
      </div>
      {nudgeMsg ? <p className="text-sm text-mint">{nudgeMsg}</p> : null}
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
              {alreadyNudgedToday(item.id) ? <span className="text-[11px] text-mint">Emailed today</span> : null}
            </div>
            <div className="font-medium">{item.title}</div>
            <div className="text-sm text-paper/55">{item.detail}</div>
            {item.email ? <div className="text-xs text-paper/40">{item.email}</div> : null}
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
              {item.email.includes("@") ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const r = await sendOverdueNudges([{ ...item, tone: "overdue" }]);
                    setNudgeMsg(r.sent ? `Emailed ${item.email}` : r.errors[0] || "Already emailed today or send failed.");
                  }}
                >
                  Email
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

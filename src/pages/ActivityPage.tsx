import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { listRecords } from "@/lib/db";
import { moduleById } from "@/lib/modules";
import { StatusBadge } from "@/components/HighlightCell";

export function ActivityPage() {
  const q = useQuery({
    queryKey: ["module", "activity"],
    queryFn: () => listRecords("activity"),
    refetchInterval: 20_000,
  });
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const qv = search.trim().toLowerCase();
    return (q.data ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter((r) => {
        if (!qv) return true;
        return `${r.data.actor} ${r.data.action} ${r.data.target} ${r.data.summary}`.toLowerCase().includes(qv);
      });
  }, [q.data, search]);

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader kicker="Ops" title="Activity" description="Staff create, update, and delete log — not editable." />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff, module, action…" />
      {q.isLoading ? <Card>Loading…</Card> : null}
      {!q.isLoading && rows.length === 0 ? <Card className="text-sm text-paper/55">No activity yet. Save a record and it shows here.</Card> : null}
      <div className="grid gap-2">
        {rows.map((row) => {
          const target = String(row.data.target || "");
          const path = moduleById(target)?.path || "/";
          return (
            <Card key={row.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <StatusBadge value={row.data.action} />
                  <span className="text-xs text-paper/45">{String(row.data.actor || "unknown")}</span>
                </div>
                <div className="text-sm">{String(row.data.summary || `${row.data.action} ${target}`)}</div>
              </div>
              <div className="shrink-0 text-right text-[11px] text-paper/40">
                <div>{row.created_at.slice(0, 19).replace("T", " ")}</div>
                <Link to={path} className="text-gold">
                  {target || "module"}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

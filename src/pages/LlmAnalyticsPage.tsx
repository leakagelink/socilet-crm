import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DateRangeBar } from "@/components/DateRangeBar";
import { rangeBounds, type RangePreset } from "@/lib/dateRange";
import { fetchLlmStats, LLM_TRACK_SNIPPET, logLlmManual, type LlmCounts } from "@/lib/llmAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const COLORS = ["#e8c36a", "#7ddec9", "#a78bfa", "#fb923c", "#38bdf8", "#f472b6", "#34d399", "#f87171", "#818cf8", "#2dd4bf"];

function n(v: number) {
  return new Intl.NumberFormat("en-IN").format(Number.isFinite(v) ? v : 0);
}

function CountBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <p className="text-sm text-paper/45">No LLM traffic in this range yet.</p>;
  return (
    <div
      className="grid h-44 min-w-0 items-end gap-2 sm:h-52"
      style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
    >
      {items.map((i) => (
        <div key={i.label} className="grid min-w-0 justify-items-center gap-1">
          <div className="w-full truncate text-center text-[10px] text-paper/55">{n(i.value)}</div>
          <div className="flex h-28 w-full max-w-[4.5rem] items-end rounded-2xl bg-gold/10 p-1 sm:h-36">
            <div
              className="w-full rounded-xl"
              style={{ height: `${Math.max(8, (i.value / max) * 100)}%`, background: i.color }}
            />
          </div>
          <div className="w-full truncate text-center text-[10px] uppercase tracking-wide text-paper/45">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="shine min-w-0 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-wide text-paper/45">{label}</div>
      <div className="font-display text-2xl sm:text-3xl">{n(value)}</div>
      {hint ? <div className="text-xs text-paper/40">{hint}</div> : null}
    </Card>
  );
}

function Totals({ t, label }: { t: LlmCounts; label: string }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-gold/80">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-paper/40">Impressions</div>
          <div className="font-display text-xl">{n(t.impressions)}</div>
        </div>
        <div>
          <div className="text-paper/40">Traffic</div>
          <div className="font-display text-xl">{n(t.visits)}</div>
        </div>
        <div>
          <div className="text-paper/40">Clicks</div>
          <div className="font-display text-xl">{n(t.clicks)}</div>
        </div>
        <div>
          <div className="text-paper/40">CTR</div>
          <div className="font-display text-xl">{t.ctr}%</div>
        </div>
      </div>
    </Card>
  );
}

export function LlmAnalyticsPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const admin = session?.role === "admin";
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [site, setSite] = useState("");
  const [copied, setCopied] = useState(false);
  const bounds = rangeBounds(preset, customFrom, customTo);
  const q = useQuery({
    queryKey: ["llm-stats", bounds.from, bounds.to, site],
    queryFn: () => fetchLlmStats(bounds.from, bounds.to, site),
    refetchInterval: 60_000,
  });
  const data = q.data?.data;
  const range = data?.range;
  const sources = range?.bySource ?? [];
  const sites = range?.bySite ?? [];
  const chartItems = (range?.daily ?? []).map((d, i) => ({
    label: d.day.slice(5),
    value: d.visits || d.impressions,
    color: COLORS[i % COLORS.length],
  }));
  const sourceBars = sources.slice(0, 10).map((s, i) => ({
    label: s.label,
    value: s.impressions,
    color: COLORS[i % COLORS.length],
  }));

  const add = useMutation({
    mutationFn: logLlmManual,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-stats"] }),
  });

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Growth"
        title="LLM analytics"
        description="socilet.com and socilet.in traffic from ChatGPT, Copilot, Claude, Grok, Gemini, Perplexity and other AI apps — impressions, visits, clicks. Daily, weekly, monthly, yearly."
      />

      <Card className="grid gap-3 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-sm text-paper/60">
            Paste this on both sites (footer of every page). LLM crawlers count as impressions. People arriving from an AI chat count as traffic. Clicks on links are recorded too. Use <span className="text-gold">?utm_source=chatgpt</span> on links you share in AI answers.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-gold/20 bg-ink/60 p-3 text-[11px] leading-relaxed text-paper/80">{LLM_TRACK_SNIPPET}</pre>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={async () => {
            await navigator.clipboard.writeText(LLM_TRACK_SNIPPET);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy tracker"}
        </Button>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data ? (
          <>
            <Totals t={data.periods.today} label="Today" />
            <Totals t={data.periods.week} label="This week" />
            <Totals t={data.periods.month} label="This month" />
            <Totals t={data.periods.year} label="This year" />
          </>
        ) : (
          <Card className="p-4 sm:col-span-2 xl:col-span-4">{q.isError ? "Could not load LLM stats." : "Loading…"}</Card>
        )}
      </div>

      <Card className="grid gap-3 p-3 sm:p-4">
        <DateRangeBar
          preset={preset}
          from={customFrom}
          to={customTo}
          onPreset={setPreset}
          onFrom={setCustomFrom}
          onTo={setCustomTo}
        />
        <label className="grid max-w-xs gap-1 text-sm">
          <span className="text-paper/60">Site</span>
          <select
            className="h-11 rounded-xl border border-gold/20 bg-ink/70 px-3"
            value={site}
            onChange={(e) => setSite(e.target.value)}
          >
            <option value="">socilet.com + socilet.in</option>
            <option value="socilet.com">socilet.com</option>
            <option value="socilet.in">socilet.in</option>
          </select>
        </label>
      </Card>

      {range ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Impressions" value={range.totals.impressions} hint="AI views + crawls" />
            <Metric label="Traffic" value={range.totals.visits} hint="People from LLMs" />
            <Metric label="Clicks" value={range.totals.clicks} hint="On-site clicks" />
            <Metric label="CTR" value={range.totals.ctr} hint="Clicks / impressions %" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0 p-3 sm:p-5">
              <h2 className="mb-3 font-display text-lg">By LLM</h2>
              <CountBar items={sourceBars} />
            </Card>
            <Card className="min-w-0 p-3 sm:p-5">
              <h2 className="mb-3 font-display text-lg">Daily traffic</h2>
              <CountBar items={chartItems.slice(-14)} />
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-paper/45">
                <tr>
                  <th className="px-3 py-2">LLM</th>
                  <th className="px-3 py-2">Impressions</th>
                  <th className="px-3 py-2">Traffic</th>
                  <th className="px-3 py-2">Clicks</th>
                  <th className="px-3 py-2">CTR</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-paper/45" colSpan={5}>
                      No LLM hits yet. Add the tracker on socilet.com and socilet.in.
                    </td>
                  </tr>
                ) : (
                  sources.map((s) => (
                    <tr key={s.source} className="border-t border-gold/15">
                      <td className="px-3 py-2 font-medium">{s.label}</td>
                      <td className="px-3 py-2">{n(s.impressions)}</td>
                      <td className="px-3 py-2">{n(s.visits)}</td>
                      <td className="px-3 py-2">{n(s.clicks)}</td>
                      <td className={cn("px-3 py-2", s.ctr ? "text-mint" : "text-paper/45")}>{s.ctr}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Roll table={range.weekly} keyName="week" title="Weekly" />
            <Roll table={range.monthly} keyName="month" title="Monthly" />
            <Roll table={range.yearly} keyName="year" title="Yearly" />
          </div>

          <Card className="overflow-x-auto p-0">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-paper/45">By site</div>
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-paper/45">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">Impressions</th>
                  <th className="px-3 py-2">Traffic</th>
                  <th className="px-3 py-2">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.site} className="border-t border-gold/15">
                    <td className="px-3 py-2">{s.site}</td>
                    <td className="px-3 py-2">{n(s.impressions)}</td>
                    <td className="px-3 py-2">{n(s.visits)}</td>
                    <td className="px-3 py-2">{n(s.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      {admin ? (
        <Card className="p-3 sm:p-5">
          <h2 className="mb-2 font-display text-lg">Add numbers</h2>
          <p className="mb-3 text-sm text-paper/50">If an LLM dashboard gives you official counts, add them here. They stack on tracker hits.</p>
          <ManualForm
            sources={data?.sources ?? []}
            busy={add.isPending}
            onSubmit={(v) => add.mutate(v)}
          />
          {add.isError ? <p className="mt-2 text-sm text-rose-300">Could not save.</p> : null}
          {add.isSuccess ? <p className="mt-2 text-sm text-mint">Saved.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

function Roll({
  table,
  keyName,
  title,
}: {
  table: Array<LlmCounts & Record<string, string | number>>;
  keyName: string;
  title: string;
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <div className="px-3 py-2 font-display">{title}</div>
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-paper/45">
          <tr>
            <th className="px-3 py-1">{title}</th>
            <th className="px-3 py-1">Imp</th>
            <th className="px-3 py-1">Traffic</th>
            <th className="px-3 py-1">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {table.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-paper/40" colSpan={4}>
                —
              </td>
            </tr>
          ) : (
            table.map((row) => (
              <tr key={String(row[keyName])} className="border-t border-gold/15">
                <td className="px-3 py-1.5">{String(row[keyName])}</td>
                <td className="px-3 py-1.5">{n(row.impressions)}</td>
                <td className="px-3 py-1.5">{n(row.visits)}</td>
                <td className="px-3 py-1.5">{n(row.clicks)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}

function ManualForm({
  sources,
  busy,
  onSubmit,
}: {
  sources: { id: string; label: string }[];
  busy: boolean;
  onSubmit: (v: { day: string; site: string; source: string; impressions: number; visits: number; clicks: number }) => void;
}) {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [site, setSite] = useState("socilet.com");
  const [source, setSource] = useState("chatgpt");
  const [impressions, setImpressions] = useState("0");
  const [visits, setVisits] = useState("0");
  const [clicks, setClicks] = useState("0");
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          day,
          site,
          source,
          impressions: Number(impressions) || 0,
          visits: Number(visits) || 0,
          clicks: Number(clicks) || 0,
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        <Label>Date</Label>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <Label>Site</Label>
        <select className="h-11 rounded-xl border border-gold/20 bg-ink/70 px-3" value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="socilet.com">socilet.com</option>
          <option value="socilet.in">socilet.in</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <Label>LLM</Label>
        <select className="h-11 rounded-xl border border-gold/20 bg-ink/70 px-3" value={source} onChange={(e) => setSource(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <Label>Impressions</Label>
        <Input type="number" min={0} value={impressions} onChange={(e) => setImpressions(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <Label>Traffic</Label>
        <Input type="number" min={0} value={visits} onChange={(e) => setVisits(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <Label>Clicks</Label>
        <Input type="number" min={0} value={clicks} onChange={(e) => setClicks(e.target.value)} />
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add to totals"}
        </Button>
      </div>
    </form>
  );
}

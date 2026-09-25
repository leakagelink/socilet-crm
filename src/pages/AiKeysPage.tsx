import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { addAiProvider, deleteAiProvider, fetchAiUsage, fetchResearchKeys, listAiProviders, patchAiProvider, patchResearchKeys } from "@/lib/aiClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";

function n(v?: number) {
  return new Intl.NumberFormat("en-IN").format(Number(v) || 0);
}

export function AiKeysPage() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: listAiProviders });
  const usage = useQuery({ queryKey: ["ai-usage"], queryFn: fetchAiUsage, refetchInterval: 30_000 });
  const research = useQuery({ queryKey: ["ai-research-keys"], queryFn: fetchResearchKeys });
  const preset = providers.data?.preset;
  const [name, setName] = useState("Relay Models");
  const [base, setBase] = useState("https://api.relaymodels.com/v1");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gpt-5.6-luna");
  const [reason, setReason] = useState("gpt-5.6-sol");
  const [err, setErr] = useState<string | null>(null);
  const [tavily, setTavily] = useState("");
  const [brave, setBrave] = useState("");
  const [serper, setSerper] = useState("");
  const [researchErr, setResearchErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: addAiProvider,
    onSuccess: () => {
      setKey("");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["ai-providers"] });
      void qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const saveResearch = useMutation({
    mutationFn: () =>
      patchResearchKeys({
        ...(tavily.trim() ? { tavily: tavily.trim() } : {}),
        ...(brave.trim() ? { brave: brave.trim() } : {}),
        ...(serper.trim() ? { serper: serper.trim() } : {}),
      }),
    onSuccess: () => {
      setTavily("");
      setBrave("");
      setSerper("");
      setResearchErr(null);
      void qc.invalidateQueries({ queryKey: ["ai-research-keys"] });
    },
    onError: (e) => setResearchErr((e as Error).message),
  });

  const u = usage.data?.data;

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="AI"
        title="AI keys & usage"
        description="Relay Models, OpenAI, ya koi bhi OpenAI-compatible /v1 API. Limit/quota khatam ho to next key automatically use hoti hai. Research keys alag se — Tavily / Brave / Serper."
        actions={
          <Link to="/agent" className="text-sm text-gold hover:underline">
            Open agent
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="grid gap-1 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Today</div>
          <div className="font-display text-2xl">{n(u?.today.total_tokens)}</div>
          <div className="text-xs text-paper/45">{n(u?.today.calls)} calls</div>
        </Card>
        <Card className="grid gap-1 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">This month</div>
          <div className="font-display text-2xl">{n(u?.month.total_tokens)}</div>
          <div className="text-xs text-paper/45">
            in {n(u?.month.prompt_tokens)} · out {n(u?.month.completion_tokens)}
          </div>
        </Card>
        <Card className="grid gap-1 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">All time</div>
          <div className="font-display text-2xl">{n(u?.total.total_tokens)}</div>
          <div className="text-xs text-paper/45">{n(u?.total.calls)} calls · {n(u?.total.errors)} fails</div>
        </Card>
      </div>

      {u?.recent_days?.length ? (
        <Card className="overflow-x-auto p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold/80">Last 14 days</div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-paper/40">
              <tr>
                <th className="py-1">Date</th>
                <th>Tokens</th>
                <th>In</th>
                <th>Out</th>
                <th>Calls</th>
              </tr>
            </thead>
            <tbody>
              {u.recent_days.map((d) => (
                <tr key={d.date} className="border-t border-gold/10">
                  <td className="py-1.5">{d.date}</td>
                  <td>{n(d.total_tokens)}</td>
                  <td>{n(d.prompt_tokens)}</td>
                  <td>{n(d.completion_tokens)}</td>
                  <td>{n(d.calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {u?.models?.length ? (
        <Card className="overflow-x-auto p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold/80">Tokens by model</div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-paper/40">
              <tr>
                <th className="py-1">Model</th>
                <th>Tokens</th>
                <th>In</th>
                <th>Out</th>
                <th>Calls</th>
              </tr>
            </thead>
            <tbody>
              {u.models.map((m) => (
                <tr key={m.id} className="border-t border-gold/10">
                  <td className="max-w-[14rem] truncate py-1.5">{m.id}</td>
                  <td>{n(m.total_tokens)}</td>
                  <td>{n(m.prompt_tokens)}</td>
                  <td>{n(m.completion_tokens)}</td>
                  <td>{n(m.calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="grid max-w-xl gap-3 p-4">
        <h2 className="font-semibold">Add API</h2>
        <p className="text-sm text-paper/55">
          Relay: <span className="text-paper">https://api.relaymodels.com/v1</span>. Key sirf server pe save hoti hai.
        </p>
        {err ? <p className="text-sm text-red-500">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setName(preset?.name || "Relay Models");
              setBase(preset?.base_url || "https://api.relaymodels.com/v1");
              setModel(preset?.model || "gpt-5.6-luna");
              setReason(preset?.reason_model || "gpt-5.6-sol");
            }}
          >
            Relay preset
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setName("OpenAI");
              setBase("https://api.openai.com/v1");
              setModel("gpt-4o-mini");
              setReason("gpt-4o");
            }}
          >
            OpenAI preset
          </Button>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ai-name">Name</Label>
          <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ai-base">Base URL</Label>
          <Input id="ai-base" value={base} onChange={(e) => setBase(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ai-key">API key</Label>
          <Input id="ai-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="ai-model">Everyday model</Label>
            <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ai-reason">Hard / reason model</Label>
            <Input id="ai-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <Button
          disabled={add.isPending || !key.trim()}
          onClick={() => add.mutate({ name, base_url: base, key: key.trim(), model, reason_model: reason, priority: 10 })}
        >
          Save API
        </Button>
      </Card>

      <div className="grid gap-2">
        {(providers.data?.data || []).map((p) => (
          <Card key={p.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                  {p.enabled ? (p.cooling ? "Cooling" : "Live") : "Off"}
                </span>
                <span className="truncate text-xs text-paper/40">{p.key_hint}</span>
              </div>
              <div className="truncate text-xs text-paper/45">{p.base_url}</div>
              <div className="mt-1 text-xs text-paper/55">
                {p.model} · hard {p.reason_model} · {n(p.usage?.total_tokens)} tokens · {n(p.usage?.calls)} calls
              </div>
              {p.last_error ? <p className="text-xs text-red-500">{p.last_error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void patchAiProvider(p.id, { enabled: !p.enabled }).then(() => qc.invalidateQueries({ queryKey: ["ai-providers"] }))
                }
              >
                {p.enabled ? "Pause" : "Enable"}
              </Button>
              {p.cooling ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void patchAiProvider(p.id, { clear_cooldown: true }).then(() => qc.invalidateQueries({ queryKey: ["ai-providers"] }))
                  }
                >
                  Clear cooldown
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Remove this API key?")) {
                    void deleteAiProvider(p.id).then(() => {
                      void qc.invalidateQueries({ queryKey: ["ai-providers"] });
                      void qc.invalidateQueries({ queryKey: ["ai-status"] });
                    });
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {!providers.data?.data?.length ? <p className="text-sm text-paper/45">Abhi koi key nahi. Relay preset + key save karo.</p> : null}
      </div>

      <Card className="grid max-w-xl gap-3 p-4">
        <h2 className="font-semibold">Web research APIs</h2>
        <p className="text-sm text-paper/55">{research.data?.data.note}</p>
        <p className="text-xs text-paper/40">
          Tavily {research.data?.data.tavily.has_key ? `on (${research.data.data.tavily.key_hint})` : "off"} · Brave{" "}
          {research.data?.data.brave.has_key ? `on (${research.data.data.brave.key_hint})` : "off"} · Serper{" "}
          {research.data?.data.serper.has_key ? `on (${research.data.data.serper.key_hint})` : "off"} · fallback Wikipedia + DuckDuckGo
        </p>
        {researchErr ? <p className="text-sm text-red-500">{researchErr}</p> : null}
        <div className="grid gap-1">
          <Label htmlFor="tv">Tavily key</Label>
          <Input id="tv" type="password" autoComplete="off" value={tavily} onChange={(e) => setTavily(e.target.value)} placeholder="tvly-…" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="br">Brave Search key</Label>
          <Input id="br" type="password" autoComplete="off" value={brave} onChange={(e) => setBrave(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sr">Serper key</Label>
          <Input id="sr" type="password" autoComplete="off" value={serper} onChange={(e) => setSerper(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={saveResearch.isPending || (!tavily.trim() && !brave.trim() && !serper.trim())} onClick={() => saveResearch.mutate()}>
            Save research keys
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saveResearch.isPending}
            onClick={() => {
              if (!window.confirm("Clear stored Tavily / Brave / Serper keys?")) return;
              void patchResearchKeys({ tavily: "", brave: "", serper: "" }).then(() => qc.invalidateQueries({ queryKey: ["ai-research-keys"] }));
            }}
          >
            Clear
          </Button>
        </div>
      </Card>
    </div>
  );
}

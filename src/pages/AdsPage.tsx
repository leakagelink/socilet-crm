import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { listRecords, type RecordRow } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import {
  adsSnapshot,
  campaignRoas,
  convertAdLead,
  deleteAdsKey,
  listAdsKeys,
  quoteFromCampaign,
  saveAdsKey,
  testAdsKey,
} from "@/lib/ads";
import { inr } from "@/lib/utils";
import { AnimatedInr } from "@/components/AnimatedInr";

type Pane = "pulse" | "accounts" | "campaigns" | "leads";

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function AdsPage() {
  const { session } = useAuth();
  const admin = session?.role === "admin";
  const [pane, setPane] = useState<Pane>("pulse");
  const tabs: { id: Pane; label: string }[] = [
    { id: "pulse", label: "Pulse" },
    { id: "accounts", label: "Accounts" },
    { id: "campaigns", label: "Campaigns" },
    { id: "leads", label: "Leads" },
  ];

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Growth"
        title="Ads"
        description="Multiple Meta/Google accounts, campaign ROAS, ads leads → clients, winning ad → quote. 10x spend sirf us campaign par jahan CRM cash aata hai."
        actions={
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button key={t.id} size="sm" variant={pane === t.id ? "default" : "outline"} onClick={() => setPane(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>
        }
      />
      {pane === "pulse" ? <AdsPulse /> : null}
      {pane === "accounts" ? admin ? <AdsAccounts /> : <Card className="p-4 text-sm text-paper/55">Only admin can add Meta / Google keys.</Card> : null}
      {pane === "campaigns" ? <ModuleCrud module={moduleById("ad_campaigns")!} hideHeader /> : null}
      {pane === "leads" ? (
        <ModuleCrud
          module={moduleById("ad_leads")!}
          hideHeader
          rowActions={(row) => <LeadActions row={row} />}
        />
      ) : null}
    </div>
  );
}

function AdsPulse() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["module", "ad_accounts"], queryFn: () => listRecords("ad_accounts") });
  const campaigns = useQuery({ queryKey: ["module", "ad_campaigns"], queryFn: () => listRecords("ad_campaigns") });
  const leads = useQuery({ queryKey: ["module", "ad_leads"], queryFn: () => listRecords("ad_leads") });
  const snap = useMemo(
    () => adsSnapshot(accounts.data ?? [], campaigns.data ?? [], leads.data ?? []),
    [accounts.data, campaigns.data, leads.data],
  );
  const win = snap.winning;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function makeQuote() {
    if (!win) return;
    setBusy(true);
    setErr(null);
    try {
      const converted = (leads.data ?? []).find(
        (l) => str(l.data.status) === "converted" && (str(l.data.campaign_id) === win.id || str(l.data.campaign) === str(win.data.name)),
      );
      const allLeads = (leads.data ?? []).find((l) => str(l.data.campaign_id) === win.id || str(l.data.campaign) === str(win.data.name));
      const pick = converted || allLeads;
      if (!pick) {
        setErr("Is campaign ka koi lead nahi. Pehle Leads me naam/phone daalo, Convert, phir quote.");
        return;
      }
      const client = str(pick.data.status) === "converted" && str(pick.data.client_id)
        ? (await listRecords("clients")).find((c) => c.id === str(pick.data.client_id))
        : await convertAdLead(pick);
      if (!client) {
        setErr("Client nahi bana.");
        return;
      }
      const quote = await quoteFromCampaign(win, client);
      void qc.invalidateQueries({ queryKey: ["module"] });
      nav(`/quotations/${quote.id}/edit`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Quote fail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ad spend" value={<AnimatedInr value={snap.spend} />} />
        <Stat label="Attributed revenue" value={<AnimatedInr value={snap.revenue} />} />
        <Stat label="Blended ROAS" value={`${snap.roas ? snap.roas.toFixed(2) : "—"}x`} hint={snap.roas < 1 && snap.spend ? "Spend > cash — pause losers" : undefined} />
        <Stat label="Open leads" value={String(snap.openLeads)} hint={`${snap.converted} converted · ${snap.accounts} accounts`} />
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
      {win ? (
        <Card className="grid gap-2 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold">Winning campaign</div>
          <div className="font-display text-xl">{str(win.data.name)}</div>
          <p className="text-sm text-paper/55">
            {str(win.data.platform)} · spend {inr(Number(win.data.spend) || 0)} · revenue {inr(Number(win.data.revenue) || 0)} · ROAS{" "}
            {campaignRoas(win).toFixed(2)}x
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void makeQuote()}>
              Quote from this ad
            </Button>
            <Button variant="outline" asChild>
              <Link to="/agent">Ask agent: kahan spend badhaun?</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-paper/55">
          Campaigns me spend + revenue daalo. ROAS nikalega. Agent se bhi “ads performance” puchh sakte ho.
        </Card>
      )}
      {snap.losing.length ? (
        <Card className="p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold">Pause / fix (ROAS &lt; 1)</div>
          <ul className="grid gap-1 text-sm">
            {snap.losing.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{str(r.data.name)}</span>
                <span className="shrink-0 text-paper/45">{campaignRoas(r).toFixed(2)}x</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="grid gap-1 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">{label}</div>
      <div className="font-display text-2xl">{value}</div>
      {hint ? <div className="text-xs text-paper/45">{hint}</div> : null}
    </Card>
  );
}

function AdsAccounts() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["ads-keys"], queryFn: listAdsKeys });
  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState("meta");
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => saveAdsKey({ label, platform, account_id: accountId, token }),
    onSuccess: () => {
      setLabel("");
      setAccountId("");
      setToken("");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["ads-keys"] });
      void qc.invalidateQueries({ queryKey: ["module", "ad_accounts"] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <div className="grid gap-3">
      <Card className="grid max-w-xl gap-3 p-4">
        <h2 className="font-semibold">Add ads account</h2>
        <p className="text-sm text-paper/55">
          Meta token Graph pe test hota hai. Google key save hoti hai; spend/ROAS Campaigns me manual (Google Ads API OAuth alag hota hai). Keys server persist me, git nahi.
        </p>
        {err ? <p className="text-sm text-red-500">{err}</p> : null}
        <div className="grid gap-1">
          <Label htmlFor="ad-label">Name</Label>
          <Input id="ad-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Meta — brand" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ad-plat">Platform</Label>
          <select
            id="ad-plat"
            className="h-10 rounded-xl border border-gold/30 bg-white px-3 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="meta">Meta (FB/IG)</option>
            <option value="google">Google Ads</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ad-act">Account ID</Label>
          <Input id="ad-act" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_… / Customer ID" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ad-tok">{platform === "meta" ? "Meta access token" : "API token (optional)"}</Label>
          <Input id="ad-tok" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <Button disabled={add.isPending || !label.trim()} onClick={() => add.mutate()}>
          Save account
        </Button>
      </Card>
      {(keys.data?.data || []).map((p) => (
        <Card key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="font-medium">{p.label}</div>
            <div className="text-xs text-paper/45">
              {p.platform} · {p.account_id || "no id"} · {p.has_key ? p.key_hint : "no key"} · {p.connected ? "connected" : "not tested"}
            </div>
            {p.last_error ? <p className="text-xs text-red-500">{p.last_error}</p> : null}
          </div>
          <div className="flex gap-2">
            {p.has_key ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void testAdsKey(p.id)
                    .then(() => qc.invalidateQueries({ queryKey: ["ads-keys"] }))
                    .catch((e) => setErr((e as Error).message))
                }
              >
                Test
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (!window.confirm("Remove this ads account key?")) return;
                void deleteAdsKey(p.id).then(() => {
                  void qc.invalidateQueries({ queryKey: ["ads-keys"] });
                  void qc.invalidateQueries({ queryKey: ["module", "ad_accounts"] });
                });
              }}
            >
              Delete
            </Button>
          </div>
        </Card>
      ))}
      {!keys.data?.data?.length ? <p className="text-sm text-paper/45">Abhi koi ads account nahi.</p> : null}
    </div>
  );
}

function LeadActions({ row }: { row: RecordRow }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const done = str(row.data.status) === "converted";
  return (
    <Button
      size="sm"
      variant={done ? "outline" : "default"}
      onClick={() => {
        void (async () => {
          const client = done
            ? (await listRecords("clients")).find((c) => c.id === str(row.data.client_id))
            : await convertAdLead(row);
          void qc.invalidateQueries({ queryKey: ["module"] });
          if (client) nav(`/clients/${client.id}`);
        })();
      }}
    >
      {done ? "Open client" : "Convert to client"}
    </Button>
  );
}

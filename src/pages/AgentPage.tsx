import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Textarea } from "@/components/ui/input";
import { confirmAgentAction, fetchBrief, fetchMemory, sendAgentChat, aiStatus, type ConfirmNeed } from "@/lib/aiClient";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string; confirmations?: ConfirmNeed[] };

export function AgentPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const status = useQuery({ queryKey: ["ai-status"], queryFn: aiStatus });
  const brief = useQuery({ queryKey: ["ai-brief"], queryFn: fetchBrief, refetchInterval: 60_000 });
  const memory = useQuery({ queryKey: ["ai-memory"], queryFn: fetchMemory });
  const chat = useMutation({
    mutationFn: sendAgentChat,
    onSuccess: (res, message) => {
      setTurns((prev) => [
        ...prev,
        { role: "user", text: message },
        { role: "assistant", text: res.data.reply, confirmations: res.data.confirmations },
      ]);
      void qc.invalidateQueries({ queryKey: ["ai-brief"] });
      void qc.invalidateQueries({ queryKey: ["ai-memory"] });
    },
  });
  const confirm = useMutation({
    mutationFn: confirmAgentAction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-brief"] });
    },
  });

  const snap = brief.data?.data;
  const configured = status.data?.data.configured;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
      <div className="grid min-w-0 gap-4">
        <PageHeader
          kicker="Socilet OS"
          title="Founder agent"
          description="CRM context pe sochta hai — kal kya karna hai, kaunsa client risk pe hai, kya execute karna hai. ChatGPT clone nahi."
        />
        {!configured ? (
          <Card className="border-gold/40 text-sm text-paper/70">
            LLM key optional hai. Bina key ke bhi impact-ranked brief chalega. Full reasoning ke liye Hostinger env me <code className="text-gold">AI_API_KEY</code> set karo (OpenAI-compatible). Key browser me nahi jaati.
          </Card>
        ) : null}

        <Card className="grid min-h-[28rem] gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-10 w-auto max-w-[8rem] rounded-lg" />
            <div>
              <div className="font-display text-lg">Ask with CRM in the loop</div>
              <p className="text-xs text-paper/45">Try: Kal kya karna hai? · What is happening with [client]? · Focus today · Challenge this plan</p>
            </div>
          </div>
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto">
            {turns.length === 0 ? (
              <p className="text-sm text-paper/50">Pehla sawal poocho. Agent CRM snapshot, memory, aur tools use karega.</p>
            ) : null}
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                  t.role === "user" ? "ml-8 border border-gold/20 bg-gold/10" : "mr-4 border border-line bg-panel",
                )}
              >
                {t.text}
                {t.confirmations?.map((c) => (
                  <div key={c.token} className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    <div className="mb-1 text-amber-200">Needs confirmation</div>
                    <pre className="overflow-x-auto text-[11px] text-paper/70">{JSON.stringify(c.preview, null, 2)}</pre>
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate(c.token)}
                    >
                      Confirm write
                    </Button>
                  </div>
                ))}
              </div>
            ))}
            {chat.isError ? <p className="text-sm text-red-400">{(chat.error as Error).message}</p> : null}
          </div>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = draft.trim();
              if (!msg || chat.isPending) return;
              setDraft("");
              chat.mutate(msg);
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="CRM ke hisaab se soch ke batao…"
              className="min-h-20"
            />
            <Button type="submit" disabled={chat.isPending || !draft.trim()}>
              {chat.isPending ? "Thinking with CRM…" : "Run"}
            </Button>
          </form>
        </Card>
      </div>

      <div className="grid content-start gap-3">
        <Card className="grid gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Today · impact</div>
          {brief.isLoading ? <p className="text-sm text-paper/45">Reading CRM…</p> : null}
          {snap?.attention.slice(0, 8).map((item) => (
            <Link key={`${item.href}-${item.title}`} to={item.href} className="rounded-lg border border-gold/15 px-2 py-1.5 hover:border-gold/40">
              <div className="text-sm text-paper">{item.title}</div>
              <div className="text-[11px] text-paper/45">
                {item.why} · {item.impact}
              </div>
            </Link>
          ))}
          {!snap?.attention.length && !brief.isLoading ? <p className="text-sm text-paper/45">No high-impact items.</p> : null}
        </Card>
        {snap?.do_not_spend_time_on?.length ? (
          <Card className="grid gap-1 text-sm text-paper/60">
            <div className="text-[10px] uppercase tracking-[0.2em] text-paper/35">Skip</div>
            {snap.do_not_spend_time_on.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </Card>
        ) : null}
        <Card className="grid gap-1 text-xs text-paper/55">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Memory</div>
          {(memory.data?.data.business || []).slice(-3).map((m) => (
            <div key={m.id}>{m.text}</div>
          ))}
          {(memory.data?.data.user || []).slice(-3).map((m) => (
            <div key={m.id}>{m.text}</div>
          ))}
          {!memory.data?.data.user?.length && !memory.data?.data.business?.length ? <div>No durable memory yet. Ask the agent to remember a rule.</div> : null}
        </Card>
      </div>
    </div>
  );
}

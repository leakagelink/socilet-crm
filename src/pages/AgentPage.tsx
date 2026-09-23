import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, PanelLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  aiStatus,
  confirmAgentAction,
  createAgentSession,
  deleteAgentSession,
  fetchBrief,
  fetchMemory,
  getAgentSession,
  listAgentSessions,
  renameAgentSession,
  sendAgentChat,
  type AgentMessage,
  type ConfirmNeed,
} from "@/lib/aiClient";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";

const PROMPTS = ["Kal kya karna hai?", "Aaj kis pe focus karun?", "Kaunse clients risk pe hain?", "Pending payments batao"];

type ChatTurn = AgentMessage & { confirmations?: ConfirmNeed[] };

function when(iso?: string) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AgentPage() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ["ai-status"], queryFn: aiStatus });
  const brief = useQuery({ queryKey: ["ai-brief"], queryFn: fetchBrief, refetchInterval: 90_000 });
  const memory = useQuery({ queryKey: ["ai-memory"], queryFn: fetchMemory });
  const sessions = useQuery({ queryKey: ["ai-sessions"], queryFn: listAgentSessions });

  useEffect(() => {
    const list = sessions.data?.data ?? [];
    if (!sessionId && list[0]) setSessionId(list[0].id);
  }, [sessions.data, sessionId]);

  const loaded = useQuery({
    queryKey: ["ai-session", sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => getAgentSession(sessionId!),
  });

  useEffect(() => {
    if (!loaded.data?.data) return;
    setTurns(loaded.data.data.messages.map((m) => ({ role: m.role, content: m.content, at: m.at })));
  }, [loaded.data, sessionId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, loaded.isFetching]);

  const chat = useMutation({
    mutationFn: (message: string) => sendAgentChat(message, sessionId || undefined),
    onSuccess: (res, message) => {
      setSessionId(res.data.sessionId);
      setTurns((prev) => [
        ...prev,
        { role: "user", content: message, at: new Date().toISOString() },
        { role: "assistant", content: res.data.reply, confirmations: res.data.confirmations, at: new Date().toISOString() },
      ]);
      void qc.invalidateQueries({ queryKey: ["ai-sessions"] });
      void qc.invalidateQueries({ queryKey: ["ai-brief"] });
      void qc.invalidateQueries({ queryKey: ["ai-memory"] });
    },
  });

  const makeSession = useMutation({
    mutationFn: createAgentSession,
    onSuccess: (res) => {
      setSessionId(res.data.id);
      setTurns([]);
      setSessionsOpen(false);
      void qc.invalidateQueries({ queryKey: ["ai-sessions"] });
    },
  });

  const dropSession = useMutation({
    mutationFn: deleteAgentSession,
    onSuccess: (_r, id) => {
      if (sessionId === id) {
        setSessionId(null);
        setTurns([]);
      }
      void qc.invalidateQueries({ queryKey: ["ai-sessions"] });
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameAgentSession(id, title),
    onSuccess: () => {
      setRenameId(null);
      void qc.invalidateQueries({ queryKey: ["ai-sessions"] });
    },
  });

  const confirm = useMutation({
    mutationFn: confirmAgentAction,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-brief"] }),
  });

  const snap = brief.data?.data;
  const list = sessions.data?.data ?? [];
  const active = list.find((s) => s.id === sessionId);

  function send(text: string) {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    setDraft("");
    chat.mutate(msg);
  }

  const sessionCol = (
    <div className="flex min-h-0 flex-col gap-2">
      <Button className="w-full" size="sm" disabled={makeSession.isPending} onClick={() => makeSession.mutate()}>
        <Plus className="h-4 w-4" />
        New session
      </Button>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {list.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group rounded-xl border px-2 py-2",
              s.id === sessionId ? "border-gold/50 bg-gold/10" : "border-gold/15 hover:border-gold/35",
            )}
          >
            {renameId === s.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate({ id: s.id, title: renameVal });
                }}
              >
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  className="h-8 w-full rounded-lg border border-gold/30 bg-ink/50 px-2 text-sm"
                />
              </form>
            ) : (
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => {
                  setSessionId(s.id);
                  setSessionsOpen(false);
                }}
                onDoubleClick={() => {
                  setRenameId(s.id);
                  setRenameVal(s.title);
                }}
              >
                <div className="truncate text-sm text-paper">{s.title}</div>
                <div className="truncate text-[11px] text-paper/40">{s.preview || when(s.updated_at)}</div>
              </button>
            )}
            <div className="mt-1 flex justify-end opacity-80 group-hover:opacity-100">
              <button
                type="button"
                className="rounded p-1 text-paper/40 hover:text-red-400"
                aria-label="Delete session"
                onClick={() => {
                  if (window.confirm("Delete this session?")) dropSession.mutate(s.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {!list.length ? <p className="px-1 text-xs text-paper/45">No sessions yet. New session dabao.</p> : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[min(42rem,calc(100dvh-8.5rem))] min-w-0 flex-col gap-3 lg:h-[calc(100dvh-6.5rem)] lg:min-h-0 lg:flex-row">
      <aside className="hidden w-56 shrink-0 lg:flex lg:flex-col">{sessionCol}</aside>

      <OverlayPortal open={sessionsOpen} onClose={() => setSessionsOpen(false)}>
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close sessions" className="absolute inset-0 bg-black/55" onClick={() => setSessionsOpen(false)} />
          <div className="absolute inset-y-0 left-0 z-10 flex w-[min(18rem,88vw)] flex-col border-r border-line bg-panel p-3 pt-[calc(var(--sat)+0.75rem)] pl-[max(0.75rem,var(--sal))]">
            <div className="mb-2 text-sm text-gold">Sessions</div>
            {sessionCol}
          </div>
        </div>
      </OverlayPortal>

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3 sm:p-4">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-gold/25 p-2 text-gold lg:hidden"
            onClick={() => setSessionsOpen(true)}
            aria-label="Sessions"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg leading-tight">{active?.title || "Socilet OS"}</div>
            <p className="truncate text-[11px] text-paper/45">
              {status.data?.data.configured ? "LLM + CRM tools" : "Deterministic brief — set AI_API_KEY for full reasoning"}
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 lg:hidden" onClick={() => makeSession.mutate()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
          {!turns.length ? (
            <div className="grid gap-2 py-4">
              <p className="text-sm text-paper/50">CRM context ke sath poocho. Purani chats left me save rehti hain.</p>
              <div className="flex flex-wrap gap-2">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rounded-full border border-gold/25 px-3 py-1 text-xs text-paper/80 hover:border-gold/50 hover:text-gold"
                    onClick={() => send(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {turns.map((t, i) => (
            <div
              key={`${t.at}-${i}`}
              className={cn(
                "max-w-[95%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm sm:max-w-[85%]",
                t.role === "user" ? "ml-auto border border-gold/25 bg-gold/10" : "mr-auto border border-line bg-ink/30",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-paper/35">
                <span>{t.role === "user" ? "You" : "Agent"} · {when(t.at)}</span>
                {t.role === "assistant" ? (
                  <button
                    type="button"
                    className="hover:text-gold"
                    aria-label="Copy"
                    onClick={() => void navigator.clipboard.writeText(t.content)}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              {t.content}
              {t.confirmations?.map((c) => (
                <div key={c.token} className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <div className="mb-1 text-amber-200">Needs confirmation</div>
                  <pre className="overflow-x-auto text-[11px] text-paper/70">{JSON.stringify(c.preview, null, 2)}</pre>
                  <Button size="sm" className="mt-2" disabled={confirm.isPending} onClick={() => confirm.mutate(c.token)}>
                    Confirm write
                  </Button>
                </div>
              ))}
            </div>
          ))}
          {chat.isPending ? <p className="text-sm text-gold/80">CRM padh raha hai…</p> : null}
          {chat.isError ? <p className="text-sm text-red-400">{(chat.error as Error).message}</p> : null}
        </div>

        <form
          className="shrink-0 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="CRM ke hisaab se soch ke batao…"
            className="min-h-[4.5rem] max-h-36 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <Button type="submit" disabled={chat.isPending || !draft.trim()}>
            {chat.isPending ? "Thinking…" : "Send"}
          </Button>
        </form>
      </Card>

      <aside className="grid shrink-0 content-start gap-2 lg:w-64 lg:overflow-y-auto">
        <Card className="grid gap-2 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Today · impact</div>
          {snap?.attention.slice(0, 6).map((item) => (
            <Link key={`${item.href}-${item.title}`} to={item.href} className="rounded-lg border border-gold/15 px-2 py-1.5 hover:border-gold/40">
              <div className="text-sm text-paper">{item.title}</div>
              <div className="text-[11px] text-paper/45">
                {item.why} · {item.impact}
              </div>
            </Link>
          ))}
          {!snap?.attention.length && !brief.isLoading ? <p className="text-sm text-paper/45">No high-impact items.</p> : null}
        </Card>
        <Card className="hidden gap-1 p-3 text-xs text-paper/55 lg:grid">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Memory</div>
          {(memory.data?.data.business || []).slice(-3).map((m) => (
            <div key={m.id}>{m.text}</div>
          ))}
          {(memory.data?.data.user || []).slice(-3).map((m) => (
            <div key={m.id}>{m.text}</div>
          ))}
          {!memory.data?.data.user?.length && !memory.data?.data.business?.length ? <div>Ask the agent to remember a rule.</div> : null}
        </Card>
      </aside>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAgentImmersive } from "@/lib/agentChrome";
import { useAuth } from "@/hooks/useAuth";
import {
  aiStatus,
  confirmAgentAction,
  createAgentSession,
  deleteAgentSession,
  fetchAiCatalog,
  fetchBrief,
  fetchMemory,
  getAgentSession,
  listAgentFiles,
  listAgentSessions,
  pinAgentSession,
  renameAgentSession,
  saveBlobFile,
  sendAgentChatStream,
  downloadAgentFile,
  type AgentFile,
  type AgentLink,
  type AgentMessage,
  type AgentSessionMeta,
  type ConfirmNeed,
} from "@/lib/aiClient";
import { cn } from "@/lib/utils";

const STARTERS = [
  { q: "Kal kya karna hai?", h: "Impact" },
  { q: "Aaj kis pe focus karun?", h: "Priority" },
  { q: "Kaunse clients risk pe hain?", h: "Clients" },
  { q: "Pending payments batao", h: "Cash" },
  { q: "Client ko follow-up call script do", h: "Call" },
  { q: "Quote draft banao confirm ke sath", h: "Quote" },
  { q: "Client ko email draft karo", h: "Email" },
  { q: "Ads pe kahan spend badhaun, ROAS ke hisaab se?", h: "Ads" },
  { q: "GST e-invoice latest rules research karo, sources ke sath", h: "Research" },
  { q: "Client proposal ka PDF banao", h: "PDF" },
];

const TOOL_HINTS = [
  "Web research",
  "Ads ROAS",
  "Daily brief",
  "Email / quote / invoice",
  "Call script",
  "Meeting notes",
  "PDF Hindi",
];

type Pane = "chats" | "thread" | "pulse";
type ChatTurn = AgentMessage & { confirmations?: ConfirmNeed[]; files?: AgentFile[]; links?: AgentLink[] };

function when(iso?: string) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function AgentReply({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const href = m[2];
        if (href.startsWith("/")) {
          return (
            <Link key={i} to={href} className="font-medium text-gold underline underline-offset-2">
              {m[1]}
            </Link>
          );
        }
        if (/^https?:/i.test(href)) {
          return (
            <a key={i} href={href} target="_blank" rel="noreferrer" className="font-medium text-gold underline underline-offset-2">
              {m[1]}
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

function RecordCards({ links }: { links?: AgentLink[] }) {
  if (!links?.length) return null;
  const seen = new Set<string>();
  const items = links
    .filter((l) => {
      if ((!l.href.startsWith("/") && !/^https?:\/\//i.test(l.href)) || seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    })
    .slice(0, 10);
  if (!items.length) return null;
  const cardClass =
    "flex items-center justify-between rounded-xl border border-gold/25 bg-gold/10 px-3 py-2 text-sm text-[#0b1624] hover:border-gold/50";
  return (
    <div className="mt-3 grid gap-2">
      {items.map((l) =>
        l.href.startsWith("/") ? (
          <Link key={l.href} to={l.href} className={cardClass}>
            <span className="truncate font-medium">{l.title}</span>
            <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-paper/40">{l.kind || "open"}</span>
          </Link>
        ) : (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className={cardClass}>
            <span className="truncate font-medium">{l.title}</span>
            <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-paper/40">{l.kind || "source"}</span>
          </a>
        ),
      )}
    </div>
  );
}

function ConfirmPreview({ preview }: { preview: Record<string, unknown> }) {
  const rows = Object.entries(preview).filter(([, v]) => v != null && v !== "" && typeof v !== "object");
  if (!rows.length) {
    return <pre className="mt-1 overflow-x-auto text-[11px]">{JSON.stringify(preview, null, 2)}</pre>;
  }
  return (
    <dl className="mt-1 grid gap-1 text-[12px]">
      {rows.slice(0, 12).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="text-paper/45">{k.replace(/_/g, " ")}</dt>
          <dd className="break-words font-medium">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

type PendingAttach = {
  id: string;
  name: string;
  mime: string;
  size: number;
  text?: string;
  dataUrl?: string;
  preview?: string;
};

const MODEL_KEY = "socilet.agent.model";

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image"));
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toPending(file: File): Promise<PendingAttach | null> {
  if (file.size > 8_000_000) return null;
  const base: PendingAttach = { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, mime: file.type || "application/octet-stream", size: file.size };
  if (file.type.startsWith("image/")) {
    const dataUrl = await compressImage(file);
    if (!dataUrl) return { ...base, text: `[Image ${file.name} could not be read]` };
    return { ...base, mime: "image/jpeg", dataUrl, preview: dataUrl };
  }
  const texty = /^(text\/|application\/(json|csv))/i.test(file.type) || /\.(txt|md|csv|json|html)$/i.test(file.name);
  if (texty) return { ...base, text: (await file.text()).slice(0, 12_000) };
  return { ...base };
}

function exportMarkdown(title: string, turns: ChatTurn[]) {
  const body = [`# ${title}`, "", ...turns.map((t) => `**${t.role === "user" ? "You" : "Agent"}** · ${when(t.at)}\n\n${t.content}`)].join("\n\n");
  const blob = new Blob([body], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w]+/g, "-").slice(0, 40) || "session"}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AgentPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const { immersive, full, mobile, setImmersive } = useAgentImmersive();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pane, setPane] = useState<Pane>("thread");
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [listening, setListening] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAttach[]>([]);
  const [dropOn, setDropOn] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(MODEL_KEY) || "";
    } catch {
      return "";
    }
  });
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const status = useQuery({ queryKey: ["ai-status"], queryFn: aiStatus });
  const catalog = useQuery({ queryKey: ["ai-catalog"], queryFn: fetchAiCatalog });
  const brief = useQuery({ queryKey: ["ai-brief"], queryFn: fetchBrief, refetchInterval: 90_000 });
  const memory = useQuery({ queryKey: ["ai-memory"], queryFn: fetchMemory });
  const genFiles = useQuery({ queryKey: ["ai-files"], queryFn: listAgentFiles });
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
    setTurns(loaded.data.data.messages.map((m) => ({ role: m.role, content: m.content, at: m.at, files: m.files })));
    setEditIdx(null);
  }, [loaded.data, sessionId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const makeSession = useMutation({
    mutationFn: createAgentSession,
    onSuccess: (res) => {
      setSessionId(res.data.id);
      setTurns([]);
      setPane("thread");
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
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => pinAgentSession(id, pinned),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-sessions"] }),
  });
  const confirm = useMutation({
    mutationFn: confirmAgentAction,
    onSuccess: (_r, token) => {
      setTurns((prev) =>
        prev.map((t) => ({ ...t, confirmations: t.confirmations?.filter((c) => c.token !== token) })),
      );
      void qc.invalidateQueries({ queryKey: ["ai-brief"] });
    },
  });

  const list = sessions.data?.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => `${s.title} ${s.preview}`.toLowerCase().includes(q));
  }, [list, query]);
  const active = list.find((s) => s.id === sessionId);
  const snap = brief.data?.data;
  const lastUser = [...turns].reverse().find((t) => t.role === "user");

  async function send(raw: string) {
    const msg = raw.trim();
    if ((!msg && !pending.length) || sending) return;
    const text = msg || "Please review the attached files.";
    const at = new Date().toISOString();
    const attachments = pending.map((p) => ({ name: p.name, mime: p.mime, text: p.text, dataUrl: p.dataUrl }));
    setDraft("");
    setEditIdx(null);
    setChatError(null);
    setAborted(false);
    setPending([]);
    setPane("thread");
    setTurns((prev) => [...prev, { role: "user", content: text, at }, { role: "assistant", content: "", at }]);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSending(true);
    try {
      const data = await sendAgentChatStream(text, sessionId || undefined, ac.signal, { model: model || undefined, attachments }, (chunk) => {
        setTurns((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      });
      setSessionId(data.sessionId);
      setTurns((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: data.reply,
            confirmations: data.confirmations,
            files: data.files,
            links: data.links,
          };
        }
        return copy;
      });
      void qc.invalidateQueries({ queryKey: ["ai-sessions"] });
      void qc.invalidateQueries({ queryKey: ["ai-brief"] });
      void qc.invalidateQueries({ queryKey: ["ai-files"] });
      void qc.invalidateQueries({ queryKey: ["ai-status"] });
      void qc.invalidateQueries({ queryKey: ["ai-catalog"] });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        setAborted(true);
        setTurns((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant" && !last.content) copy.pop();
          return copy;
        });
        return;
      }
      setChatError(err instanceof Error ? err.message : "AI failed");
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function listen() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      window.alert("Voice is not available in this browser.");
      return;
    }
    const rec = new Rec();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript || "";
      setDraft((d) => (d ? `${d} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: PendingAttach[] = [];
    for (const file of [...fileList].slice(0, 4)) {
      const row = await toPending(file);
      if (row) next.push(row);
    }
    setPending((prev) => [...prev, ...next].slice(0, 4));
    if (filesRef.current) filesRef.current.value = "";
  }

  function selectSession(s: AgentSessionMeta) {
    setSessionId(s.id);
    setPane("thread");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  const chats = (
    <div className="flex min-h-0 flex-1 flex-col bg-white/40">
      <div className="flex items-center gap-2 p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-10 w-full rounded-xl border border-gold/20 bg-white pl-9 pr-3 text-sm outline-none focus:border-gold/50"
          />
        </div>
        <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => makeSession.mutate()} aria-label="New chat">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-start gap-1 rounded-2xl px-2 py-2",
              s.id === sessionId ? "bg-gold/15" : "hover:bg-gold/8",
            )}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => selectSession(s)}>
              <div className="flex items-center gap-1">
                {s.pinned ? <Pin className="h-3 w-3 shrink-0 text-gold" /> : null}
                {renameId === s.id ? null : <span className="truncate text-sm font-medium">{s.title}</span>}
              </div>
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
                    onBlur={() => rename.mutate({ id: s.id, title: renameVal })}
                    className="mt-1 h-8 w-full rounded-lg border border-gold/30 bg-white px-2 text-sm"
                  />
                </form>
              ) : (
                <div className="truncate text-[11px] text-paper/40">{s.preview || when(s.updated_at)}</div>
              )}
            </button>
            <div className="flex shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
              <IconBtn label={s.pinned ? "Unpin" : "Pin"} onClick={() => pin.mutate({ id: s.id, pinned: !s.pinned })}>
                {s.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </IconBtn>
              <IconBtn
                label="Rename"
                onClick={() => {
                  setRenameId(s.id);
                  setRenameVal(s.title);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label="Delete"
                onClick={() => {
                  if (window.confirm("Delete this chat?")) dropSession.mutate(s.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
        ))}
        {!filtered.length ? <p className="px-3 py-6 text-center text-sm text-paper/45">No chats. New se shuru karo.</p> : null}
      </div>
    </div>
  );

  const pulse = (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white/30 p-3">
      <section className="grid gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Today</h2>
        <div className="flex flex-wrap gap-2 text-[11px] text-paper/55">
          <span className="rounded-full bg-gold/10 px-2 py-1">Overdue {snap?.counts.overdue_tasks ?? "—"}</span>
          <span className="rounded-full bg-gold/10 px-2 py-1">Invoices {snap?.counts.invoices_due ?? "—"}</span>
          <span className="rounded-full bg-gold/10 px-2 py-1">Running {snap?.counts.running_projects ?? "—"}</span>
          <span className="rounded-full bg-gold/10 px-2 py-1">
            Tokens {new Intl.NumberFormat("en-IN").format(status.data?.data.usage?.today?.total_tokens || 0)}
          </span>
        </div>
        {(status.data?.data.usage?.models || []).slice(0, 8).map((m) => (
          <button
            key={m.id}
            type="button"
            className="rounded-lg border border-gold/15 bg-white px-2 py-1.5 text-left text-[11px] hover:border-gold/40"
            onClick={() => {
              setModel(m.id);
              try {
                localStorage.setItem(MODEL_KEY, m.id);
              } catch {
                /* ignore */
              }
            }}
          >
            <div className="truncate font-medium">{m.id}</div>
            <div className="text-paper/45">{new Intl.NumberFormat("en-IN").format(m.total_tokens || 0)} tokens · {m.calls || 0} calls</div>
          </button>
        ))}
        {snap?.attention.slice(0, 8).map((item) => (
          <Link key={`${item.href}-${item.title}`} to={item.href} className="rounded-xl border border-gold/15 bg-white px-3 py-2 hover:border-gold/40">
            <div className="text-sm font-medium">{item.title}</div>
            <div className="text-[11px] text-paper/45">{item.why}</div>
          </Link>
        ))}
        {!snap?.attention.length && !brief.isLoading ? <p className="text-sm text-paper/45">No high-impact items.</p> : null}
      </section>
      <section className="grid gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Generated files</h2>
        {(genFiles.data?.data || []).slice(0, 8).map((f) => (
          <AgentFileCard key={f.id} file={f} />
        ))}
        {!genFiles.data?.data?.length ? <p className="text-xs text-paper/45">PDF, Word, CSV, poster — agent se generate karo.</p> : null}
      </section>
      <section className="grid gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Ask</h2>
        {STARTERS.map((s) => (
          <button
            key={s.q}
            type="button"
            className="rounded-xl border border-gold/15 bg-white px-3 py-2 text-left text-sm hover:border-gold/40"
            onClick={() => send(s.q)}
          >
            <span className="text-[10px] uppercase tracking-wider text-gold/70">{s.h}</span>
            <div>{s.q}</div>
          </button>
        ))}
      </section>
      <section className="grid gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Tools in agent</h2>
        <div className="flex flex-wrap gap-1.5">
          {TOOL_HINTS.map((t) => (
            <span key={t} className="rounded-full border border-gold/20 px-2 py-1 text-[11px] text-paper/60">
              {t}
            </span>
          ))}
        </div>
      </section>
      <section className="grid gap-1 text-xs text-paper/55">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Memory</h2>
        {(memory.data?.data.business || []).slice(-4).map((m) => (
          <div key={m.id} className="rounded-lg bg-white px-2 py-1.5">
            {m.text}
          </div>
        ))}
        {(memory.data?.data.user || []).slice(-4).map((m) => (
          <div key={m.id} className="rounded-lg bg-white px-2 py-1.5">
            {m.text}
          </div>
        ))}
        {!memory.data?.data.user?.length && !memory.data?.data.business?.length ? (
          <p>Agent se bolo: “ye rule yaad rakh”.</p>
        ) : null}
      </section>
    </div>
  );

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-panel lg:rounded-2xl lg:border lg:border-gold/20",
        immersive ? "h-full lg:rounded-none lg:border-0" : "min-h-[min(42rem,calc(100dvh-8.5rem))] lg:h-[calc(100dvh-6.5rem)]",
      )}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-gold/15 bg-white/70 px-2 py-2 pt-[max(0.5rem,var(--sat))] backdrop-blur-md sm:gap-2 sm:px-4">
        <BrandLogo className="h-8 w-auto max-w-[7.5rem] sm:h-9 sm:max-w-[9rem]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium sm:text-base">{active?.title || "Socilet OS"}</div>
          <div className="truncate text-[11px] text-paper/40">
            {status.data?.data.configured
              ? `${model || status.data.data.model} · auto-budget · today ${new Intl.NumberFormat("en-IN").format(status.data.data.usage?.today?.total_tokens || 0)} tokens`
              : "Brief mode · AI Keys me API add karo"}
          </div>
        </div>
        <label className="sr-only" htmlFor="agent-model">
          Model
        </label>
        <select
          id="agent-model"
          value={model || status.data?.data.model || ""}
          onChange={(e) => {
            const v = e.target.value;
            setModel(v);
            try {
              localStorage.setItem(MODEL_KEY, v);
            } catch {
              /* ignore */
            }
          }}
          className="max-w-[9.5rem] shrink-0 truncate rounded-xl border border-gold/25 bg-white px-2 py-1.5 text-[11px] outline-none sm:max-w-[14rem] sm:text-xs"
        >
          {(catalog.data?.data?.length
            ? catalog.data.data
            : [
                { id: status.data?.data.model || "gpt-5.6-luna", provider: "default" },
                { id: status.data?.data.reason_model || "gpt-5.6-sol", provider: "default" },
              ]
          ).map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
        <IconBtn label="New chat" onClick={() => makeSession.mutate()}>
          <Plus className="h-4 w-4" />
        </IconBtn>
        {turns.length ? (
          <IconBtn label="Export" onClick={() => exportMarkdown(active?.title || "session", turns)}>
            <Download className="h-4 w-4" />
          </IconBtn>
        ) : null}
        {!mobile ? (
          <IconBtn label={full ? "Exit full" : "Full agent"} onClick={() => setImmersive(!full)}>
            {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconBtn>
        ) : null}
        {session?.role === "admin" ? (
          <Link to="/ai-keys" className="rounded-xl p-2 text-paper/50 hover:bg-gold/10 hover:text-gold" aria-label="AI keys">
            <KeyRound className="h-4 w-4" />
          </Link>
        ) : null}
        {immersive ? (
          <Link to="/" className="rounded-xl px-2 py-2 text-xs font-medium text-paper/50 hover:bg-gold/10 hover:text-gold">
            CRM
          </Link>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "min-h-0 flex-col border-r border-gold/10",
            pane === "chats" ? "flex w-full lg:w-[17.5rem]" : "hidden lg:flex lg:w-[17.5rem]",
          )}
        >
          {chats}
        </aside>

        <section className={cn("flex min-w-0 flex-1 flex-col", pane !== "thread" && "hidden lg:flex")}>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-3xl space-y-4">
              {!turns.length ? (
                <div className="grid gap-4 py-8 text-center sm:py-14">
                  <div className="font-display text-3xl leading-tight sm:text-4xl">What needs a decision?</div>
                  <p className="text-sm text-paper/50">CRM padh ke jawab — lists nahi, priority.</p>
                  <div className="mx-auto grid w-full max-w-lg gap-2 sm:grid-cols-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s.q}
                        type="button"
                        className="rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3 text-left text-sm hover:border-gold/45"
                        onClick={() => send(s.q)}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-gold/70">{s.h}</div>
                        {s.q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {turns.map((t, i) => (
                <article key={`${t.at}-${i}`} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[92%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[78%]",
                      t.role === "user" ? "bg-gold text-[#0b1624]" : "border border-gold/15 bg-white text-paper shadow-sm",
                    )}
                  >
                    {editIdx === i ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          send(draft);
                        }}
                      >
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="min-h-20 w-full rounded-xl bg-white/80 p-2 text-sm text-[#0b1624]"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" type="submit">
                            Resend
                          </Button>
                          <Button size="sm" variant="ghost" type="button" onClick={() => setEditIdx(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="whitespace-pre-wrap">{t.role === "assistant" ? <AgentReply text={t.content} /> : t.content}</div>
                    )}
                    <div
                      className={cn(
                        "mt-2 flex flex-wrap items-center gap-1 text-[11px]",
                        t.role === "user" ? "text-[#0b1624]/55" : "text-paper/35",
                      )}
                    >
                      <span>{when(t.at)}</span>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-black/10"
                        aria-label="Copy"
                        onClick={() => void navigator.clipboard.writeText(t.content)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {t.role === "user" ? (
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-black/10"
                          aria-label="Edit"
                          onClick={() => {
                            setDraft(t.content);
                            setEditIdx(i);
                            box.current?.focus();
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {t.confirmations?.map((c) => (
                      <div key={c.token} className="mt-2 rounded-xl border border-amber-400/40 bg-amber-50 p-2 text-xs text-[#0b1624]">
                        {c.warning || "Confirm CRM write"}
                        <ConfirmPreview preview={c.preview} />
                        <Button size="sm" className="mt-2" disabled={confirm.isPending} onClick={() => confirm.mutate(c.token)}>
                          Confirm
                        </Button>
                      </div>
                    ))}
                    <RecordCards links={t.links} />
                    {t.files?.length ? (
                      <div className="mt-3 grid gap-2">
                        {t.files.map((f) => (
                          <AgentFileCard key={f.id} file={f} light={t.role === "user"} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {sending ? (
                <div className="flex items-center gap-2 text-sm text-gold">
                  <span className="inline-flex gap-1">
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:-0.2s]" />
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold" />
                    <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:0.2s]" />
                  </span>
                  CRM padh raha hai
                </div>
              ) : null}
              {chatError && !aborted ? <p className="text-sm text-red-500">{chatError}</p> : null}
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className={cn(
              "shrink-0 border-t border-gold/10 bg-white/80 px-3 pt-2 sm:px-6",
              mobile ? "pb-2" : "pb-[max(0.75rem,var(--sab))]",
            )}
          >
            <div
              className={cn(
                "mx-auto max-w-3xl rounded-[1.6rem] border bg-white p-2 shadow-[0_12px_40px_-24px_rgba(212,160,23,0.55)]",
                dropOn ? "border-gold border-dashed" : "border-gold/30",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDropOn(true);
              }}
              onDragLeave={() => setDropOn(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropOn(false);
                void onFiles(e.dataTransfer.files);
              }}
            >
              {pending.length ? (
                <div className="flex flex-wrap gap-2 px-2 pt-2">
                  {pending.map((p) => (
                    <div key={p.id} className="flex max-w-full items-center gap-2 rounded-xl border border-gold/20 bg-gold/5 px-2 py-1">
                      {p.preview ? <img src={p.preview} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <FileText className="h-4 w-4 text-gold" />}
                      <span className="max-w-[9rem] truncate text-xs">{p.name}</span>
                      <button type="button" aria-label="Remove file" onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}>
                        <X className="h-3.5 w-3.5 text-paper/45" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={box}
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder={pending.length ? "Add a note, or send files…" : "Ask Socilet OS…"}
                className="max-h-40 min-h-11 w-full resize-none bg-transparent px-3 py-2 text-base outline-none sm:text-sm"
              />
              <div className="flex items-center gap-1 px-1 pb-1">
                <input
                  ref={filesRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.html"
                  className="hidden"
                  onChange={(e) => void onFiles(e.target.files)}
                />
                <IconBtn label="Attach files" onClick={() => filesRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Voice" onClick={listen}>
                  <Mic className={cn("h-4 w-4", listening && "text-gold")} />
                </IconBtn>
                {lastUser ? (
                  <IconBtn label="Retry" onClick={() => send(lastUser.content)}>
                    <RefreshCw className="h-4 w-4" />
                  </IconBtn>
                ) : null}
                <span className="ml-auto" />
                {sending ? (
                  <Button type="button" size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={stop} aria-label="Stop">
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" className="h-10 w-10 rounded-full" disabled={!draft.trim() && !pending.length} aria-label="Send">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <p className="mx-auto mt-1 max-w-3xl px-2 text-center text-[10px] text-paper/35">
              Clip, drop, or pick files · Enter send · model header se change
            </p>
          </form>
        </section>

        <aside
          className={cn(
            "min-h-0 flex-col border-l border-gold/10",
            pane === "pulse" ? "flex w-full lg:w-72" : "hidden lg:flex lg:w-72",
          )}
        >
          {pulse}
        </aside>
      </div>

      {mobile ? (
        <nav className="grid shrink-0 grid-cols-3 border-t border-gold/20 bg-white/95 pb-[var(--sab)]">
          {(
            [
              ["chats", "Chats", MessageSquare],
              ["thread", "Chat", Sparkles],
              ["pulse", "Pulse", Search],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPane(id)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                pane === id ? "text-gold" : "text-paper/45",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function AgentFileCard({ file, light }: { file: AgentFile; light?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const image = /image|svg/i.test(file.mime) || file.kind === "image";
  useEffect(() => {
    if (!image) return;
    let dead = false;
    let url: string | null = null;
    void downloadAgentFile(file.id)
      .then(({ blob }) => {
        if (dead) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, image]);
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-gold/20 bg-white text-left text-[#0b1624]", light && "border-black/10")}>
      {preview ? <img src={preview} alt={file.name} className="max-h-64 w-full object-contain bg-[#fff6e8]" /> : null}
      <div className="flex items-center gap-2 px-3 py-2">
        {image ? <ImageIcon className="h-4 w-4 shrink-0 text-gold" /> : <FileText className="h-4 w-4 shrink-0 text-gold" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-paper/40">
            {file.kind}
            {file.bytes ? ` · ${Math.max(1, Math.round(file.bytes / 1024))} KB` : ""}
          </div>
        </div>
        <Button
          size="sm"
          type="button"
          onClick={() => {
            void downloadAgentFile(file.id).then(({ blob, name }) => saveBlobFile(blob, name));
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-xl p-2 text-paper/50 hover:bg-gold/10 hover:text-gold"
    >
      {children}
    </button>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

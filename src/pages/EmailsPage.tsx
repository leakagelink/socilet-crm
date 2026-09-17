import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Inbox, MailPlus, PenLine, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { insertRecord } from "@/lib/db";
import { apiFetch } from "@/lib/apiBase";
import { forgetMailbox, rememberMailbox } from "@/lib/mailboxStore";
import { cn } from "@/lib/utils";

type Mailbox = {
  id: string;
  label: string;
  from: string;
  domain: string;
  keyHint: string;
  connected: boolean;
  lastError?: string | null;
};

type BoxItem = {
  id: string;
  from?: string;
  to?: string[] | string;
  subject?: string;
  created_at?: string;
};

const composeSchema = z.object({
  to: z.string().trim().min(3).refine((v) => v.includes("@"), "Enter an email"),
  subject: z.string().trim().min(1, "Required"),
  body: z.string().trim().min(1, "Required"),
});

const boxSchema = z.object({
  label: z.string().trim().min(1, "Required"),
  from: z.string().trim().min(3).refine((v) => v.includes("@"), "Use name@your-domain"),
  apiKey: z.string().trim().min(8).refine((v) => v.startsWith("re_"), "Resend keys start with re_"),
});

const ACCENTS = ["#e8c36a", "#7ddec9", "#93c5fd", "#f0abfc", "#fdba74", "#a5b4fc"];

function accentFor(id: string) {
  let n = 0;
  for (const c of id) n = (n + c.charCodeAt(0)) % ACCENTS.length;
  return ACCENTS[n];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const raw = await res.text();
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) {
    throw new Error(
      "Email server nahi chal raha. Live par Hostinger start command `node server.mjs` hona chahiye (sirf dist upload se /api/email nahi chalta). Local: npm run dev.",
    );
  }
  const data = (raw ? JSON.parse(raw) : {}) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function addr(v: string[] | string | undefined) {
  if (Array.isArray(v)) return v.join(", ");
  return v || "";
}

function q(mailboxId: string, path: string) {
  const u = new URL(path, window.location.origin);
  if (mailboxId) u.searchParams.set("mailbox", mailboxId);
  return u.pathname + u.search;
}

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function EmailsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailboxId, setMailboxId] = useState("");
  const [adding, setAdding] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pane, setPane] = useState<"list" | "read">("list");

  const boxes = useQuery({
    queryKey: ["email-mailboxes"],
    queryFn: () => api<{ data: Mailbox[] }>("/api/email/mailboxes"),
  });

  const mailboxes = boxes.data?.data ?? [];
  const activeId = mailboxId || mailboxes[0]?.id || "";
  const active = mailboxes.find((m) => m.id === activeId) ?? mailboxes[0];
  const accent = accentFor(active?.id || "x");

  const inbox = useQuery({
    queryKey: ["email-inbox", activeId],
    queryFn: () => api<{ data?: BoxItem[] }>(q(activeId, "/api/email/inbox")),
    refetchInterval: 30_000,
    enabled: Boolean(activeId) && tab === "inbox",
  });
  const sent = useQuery({
    queryKey: ["email-sent", activeId],
    queryFn: () => api<{ data?: BoxItem[] }>(q(activeId, "/api/email/sent")),
    refetchInterval: 30_000,
    enabled: Boolean(activeId) && tab === "sent",
  });
  const detail = useQuery({
    queryKey: ["email-detail", tab, openId, activeId],
    queryFn: () =>
      api<{ html?: string; text?: string; from?: string; to?: string[]; subject?: string }>(
        q(activeId, tab === "inbox" ? `/api/email/received/${openId}` : `/api/email/sent/${openId}`),
      ),
    enabled: Boolean(openId && activeId),
  });

  const form = useForm({
    resolver: zodResolver(composeSchema),
    defaultValues: { to: "", subject: "", body: "" },
  });
  const addForm = useForm({
    resolver: zodResolver(boxSchema),
    defaultValues: { label: "", from: "", apiKey: "" },
  });

  const send = useMutation({
    mutationFn: async (v: z.infer<typeof composeSchema>) => {
      const data = await api<{ id?: string }>("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId: activeId, to: v.to, subject: v.subject, text: v.body }),
      });
      await insertRecord("emails", {
        to_addr: v.to,
        subject: v.subject,
        body: v.body,
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_id: data.id ?? "",
        mailbox: active?.label ?? "",
      });
      return data;
    },
    onSuccess: () => {
      form.reset();
      setComposing(false);
      void qc.invalidateQueries({ queryKey: ["email-sent", activeId] });
    },
  });

  const addBox = useMutation({
    mutationFn: async (v: z.infer<typeof boxSchema>) => {
      const data = await api<{ mailbox?: Mailbox }>("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!data.mailbox?.id) throw new Error("Mailbox connect fail: server ne mailbox id nahi bheji.");
      await rememberMailbox({
        id: data.mailbox.id,
        label: v.label,
        from: v.from,
        apiKey: v.apiKey,
      });
      return data.mailbox;
    },
    onSuccess: (mailbox) => {
      addForm.reset();
      setAdding(false);
      setMailboxId(mailbox.id);
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
    },
  });

  const removeBox = useMutation({
    mutationFn: async (id: string) => {
      await api(`/api/email/mailboxes/${id}`, { method: "DELETE" });
      await forgetMailbox(id);
    },
    onSuccess: () => {
      setMailboxId("");
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
    },
  });

  const rows = tab === "inbox" ? inbox.data?.data ?? [] : sent.data?.data ?? [];
  const boxQ = tab === "inbox" ? inbox : sent;
  const preview = useMemo(() => {
    const t = detail.data?.text?.trim();
    if (t) return t;
    return detail.data?.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
  }, [detail.data]);

  function startCompose() {
    form.reset({ to: "", subject: "", body: "" });
    setOpenId(null);
    setComposing(true);
    setPane("read");
  }

  function pickBox(id: string) {
    setMailboxId(id);
    setOpenId(null);
    setComposing(false);
    setPane("list");
  }

  function openMail(id: string) {
    setOpenId(id);
    setComposing(false);
    setPane("read");
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Mail</p>
          <h1 className="text-2xl font-semibold tracking-tight">Inboxes</h1>
          <p className="mt-0.5 text-sm text-paper/55">
            Har mailbox alag domain + Resend key. Switch karo — list, send, reply usi box ke rehte hain.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setAdding((v) => !v)}>
            <MailPlus className="h-4 w-4" />
            {adding ? "Close setup" : "Add mailbox"}
          </Button>
          <Button className="flex-1 sm:flex-none" disabled={!activeId} onClick={startCompose}>
            <PenLine className="h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

      {boxes.isError ? (
        <Card className="border-red-900/50 text-sm text-red-300">{(boxes.error as Error).message}</Card>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {mailboxes.map((m) => {
          const on = m.id === activeId;
          const c = accentFor(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pickBox(m.id)}
              className={cn(
                "min-w-0 rounded-2xl border px-3 py-2.5 text-left transition",
                on ? "border-transparent bg-panel shadow-lg" : "border-line/80 bg-ink/40 hover:border-gold/30",
              )}
              style={on ? { boxShadow: `inset 3px 0 0 ${c}` } : undefined}
            >
              <div className="truncate text-sm font-semibold">{m.label}</div>
              <div className="truncate text-[11px] text-paper/45">{m.domain}</div>
            </button>
          );
        })}
        {mailboxes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-paper/50">
            Koi mailbox nahi. Add mailbox se pehla box connect karo.
          </div>
        ) : null}
      </div>

      {adding ? (
        <Card className="grid gap-3">
          <div>
            <h2 className="font-semibold text-gold">Connect a mailbox</h2>
            <p className="text-xs text-paper/50">Resend verified domain + API key. Keys server par rehti hain, GitHub par nahi.</p>
          </div>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={addForm.handleSubmit((v) => addBox.mutate(v))}>
            <div className="grid gap-1">
              <Label htmlFor="box-label">Name</Label>
              <Input id="box-label" placeholder="Socilet" {...addForm.register("label")} />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="box-from">From</Label>
              <Input id="box-from" placeholder="Socilet &lt;hello@socilet.in&gt;" {...addForm.register("from")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="box-key">Resend API</Label>
              <Input id="box-key" type="password" autoComplete="off" placeholder="re_…" {...addForm.register("apiKey")} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={addBox.isPending}>
                {addBox.isPending ? "Connecting…" : "Connect mailbox"}
              </Button>
            </div>
          </form>
          {addBox.isError ? <p className="text-sm text-red-400">{addBox.error.message}</p> : null}
        </Card>
      ) : null}

      {active ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line/70 bg-panel/50 px-3 py-2 text-xs text-paper/55 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span className="min-w-0 break-words">
            Active <span className="font-medium text-paper">{active.label}</span>
            <span className="mx-1 text-line">·</span>
            <span className="break-all">{active.from}</span>
          </span>
          {active.id !== "env-default" ? (
            <Button variant="ghost" size="sm" onClick={() => removeBox.mutate(active.id)}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className="grid min-w-0 overflow-hidden rounded-2xl border border-line bg-panel/60 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        style={{ borderTopColor: accent }}
      >
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-b border-line lg:min-h-[28rem] lg:border-b-0 lg:border-r",
            pane === "read" ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="grid grid-cols-3 gap-1 border-b border-line p-2">
            <Button size="sm" variant={tab === "inbox" ? "default" : "ghost"} className="w-full min-w-0 px-1" onClick={() => { setTab("inbox"); setOpenId(null); }}>
              <Inbox className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Inbox</span>
            </Button>
            <Button size="sm" variant={tab === "sent" ? "default" : "ghost"} className="w-full min-w-0 px-1" onClick={() => { setTab("sent"); setOpenId(null); }}>
              <Send className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Sent</span>
            </Button>
            <Button size="sm" variant="outline" className="w-full min-w-0 px-1" disabled={!activeId} onClick={startCompose}>
              <PenLine className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">New</span>
            </Button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {boxQ.isLoading ? <p className="p-4 text-sm text-paper/50">Loading {tab}…</p> : null}
            {boxQ.isError ? <p className="p-4 text-sm text-red-300">{(boxQ.error as Error).message}</p> : null}
            {boxQ.data && rows.length === 0 ? (
              <p className="p-6 text-sm text-paper/45">Is mailbox ke {tab} mein kuch nahi.</p>
            ) : null}
            {rows.map((row) => {
              const selected = row.id === openId;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openMail(row.id)}
                  className={cn(
                    "w-full min-w-0 border-b border-line/60 px-3 py-3 text-left",
                    selected ? "bg-gold/10" : "hover:bg-ink/50",
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{row.subject || "(no subject)"}</div>
                      <div className="truncate text-[11px] text-paper/45">{tab === "inbox" ? row.from : addr(row.to)}</div>
                    </div>
                    <time className="shrink-0 whitespace-nowrap text-[10px] text-paper/35">{when(row.created_at)}</time>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className={cn("flex min-h-0 min-w-0 flex-col bg-ink/25 lg:min-h-[28rem]", pane === "list" ? "hidden lg:flex" : "flex")}>
          <div className="flex items-center gap-2 border-b border-line px-2 py-2 lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Back to list" onClick={() => setPane("list")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-0 truncate text-sm font-medium">{composing ? "Compose" : "Message"}</span>
          </div>

          {composing ? (
            <form className="grid min-w-0 flex-1 gap-3 overflow-y-auto p-3 sm:p-4" onSubmit={form.handleSubmit((v) => send.mutate(v))}>
              <p className="break-all text-xs text-paper/45">Sending as {active?.from}</p>
              <div className="grid gap-1">
                <Label htmlFor="to">To</Label>
                <Input id="to" placeholder="name@example.com" {...form.register("to")} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" {...form.register("subject")} />
              </div>
              <div className="grid flex-1 gap-1">
                <Label htmlFor="body">Message</Label>
                <Textarea id="body" className="min-h-40" {...form.register("body")} />
              </div>
              {send.isError ? <p className="text-sm text-red-400">{send.error.message}</p> : null}
              {send.isSuccess ? <p className="text-sm text-mint">Sent</p> : null}
              <Button type="submit" disabled={send.isPending || !activeId}>
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </form>
          ) : openId ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {detail.isLoading ? <p className="text-sm text-paper/50">Opening…</p> : null}
              {detail.isError ? <p className="break-words text-sm text-red-300">{(detail.error as Error).message}</p> : null}
              {detail.data ? (
                <article className="grid min-w-0 gap-3">
                  <h2 className="break-words text-lg font-semibold leading-snug">{detail.data.subject}</h2>
                  <p className="break-all text-xs text-paper/50">
                    {detail.data.from} → {addr(detail.data.to)}
                  </p>
                  <div className="whitespace-pre-wrap break-words rounded-xl bg-panel/80 p-4 text-sm leading-relaxed text-paper/90 [overflow-wrap:anywhere]">
                    {preview || "No body text."}
                  </div>
                    {preview || "No body text."}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      form.setValue("to", detail.data?.from || "");
                      form.setValue("subject", `Re: ${detail.data?.subject || ""}`.replace(/^Re: Re: /, "Re: "));
                      setComposing(true);
                    }}
                  >
                    Reply from {active?.label}
                  </Button>
                </article>
              ) : null}
            </div>
          ) : (
            <div className="m-auto grid max-w-sm gap-3 p-8 text-center text-sm text-paper/50">
              <p>{activeId ? "Kisi ko naya mail bhejne ke liye Compose kholo, ya left se ek message padho." : "Pehle mailbox connect karo."}</p>
              {activeId ? (
                <Button className="mx-auto" onClick={startCompose}>
                  <PenLine className="h-4 w-4" />
                  Compose new mail
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {activeId && !composing ? (
        <button
          type="button"
          onClick={startCompose}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-xl lg:hidden"
          aria-label="Compose mail"
        >
          <PenLine className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleAlert, Inbox, Paperclip, PenLine, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { insertRecord } from "@/lib/db";
import { emailApi, mailboxQuery, type Mailbox } from "@/lib/emailClient";
import { markMailSeen, mailIsUnseen } from "@/lib/unreadMail";
import { FileAttachments } from "@/components/FileAttachments";
import { MailBody, StatusChip } from "@/components/MailBody";
import type { Attachment } from "@/lib/attachments";
import { addrLine, isMailFailed, type MailDetail, type MailListItem } from "@/lib/mailView";
import { cn } from "@/lib/utils";
import { Link, useSearchParams } from "react-router-dom";

const composeSchema = z.object({
  to: z.string().trim().min(3).refine((v) => v.includes("@"), "Enter an email"),
  cc: z.string().trim().optional(),
  subject: z.string().trim().min(1, "Required"),
  body: z.string().trim().min(1, "Required"),
});

const ACCENTS = ["#e8c36a", "#7ddec9", "#93c5fd", "#f0abfc", "#fdba74", "#a5b4fc"];

function accentFor(id: string) {
  let n = 0;
  for (const c of id) n = (n + c.charCodeAt(0)) % ACCENTS.length;
  return ACCENTS[n];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return emailApi<T>(path, init);
}

function q(mailboxId: string, path: string) {
  return mailboxQuery(mailboxId, path);
}

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const same = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("en-IN", same ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function EmailsPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"inbox" | "sent" | "failed">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailboxId, setMailboxId] = useState("");
  const [composing, setComposing] = useState(false);
  const [pane, setPane] = useState<"list" | "read">("list");
  const [files, setFiles] = useState<Attachment[]>([]);

  const boxes = useQuery({
    queryKey: ["email-mailboxes"],
    queryFn: () => api<{ data: Mailbox[] }>("/api/email/mailboxes"),
  });

  const mailboxes = boxes.data?.data ?? [];
  const activeId = mailboxId || mailboxes[0]?.id || "";
  const active = mailboxes.find((m) => m.id === activeId) ?? mailboxes[0];
  const accent = accentFor(active?.id || "x");
  const folder = tab === "inbox" ? "inbox" : "sent";

  const inbox = useQuery({
    queryKey: ["email-inbox", activeId],
    queryFn: () => api<{ data?: MailListItem[] }>(q(activeId, "/api/email/inbox")),
    refetchInterval: 30_000,
    enabled: Boolean(activeId),
  });
  const sent = useQuery({
    queryKey: ["email-sent", activeId],
    queryFn: () => api<{ data?: MailListItem[] }>(q(activeId, "/api/email/sent")),
    refetchInterval: 30_000,
    enabled: Boolean(activeId),
  });
  const detail = useQuery({
    queryKey: ["email-detail", folder, openId, activeId],
    queryFn: () =>
      api<MailDetail>(q(activeId, folder === "inbox" ? `/api/email/received/${openId}` : `/api/email/sent/${openId}`)),
    enabled: Boolean(openId && activeId && !composing),
  });

  const form = useForm({
    resolver: zodResolver(composeSchema),
    defaultValues: { to: "", cc: "", subject: "", body: "" },
  });

  useEffect(() => {
    if (params.get("compose") !== "1") return;
    form.reset({
      to: params.get("to") || "",
      cc: "",
      subject: params.get("subject") || "",
      body: params.get("body") || "",
    });
    setOpenId(null);
    setComposing(true);
    setPane("read");
    setFiles([]);
  }, [params, form]);

  const send = useMutation({
    mutationFn: async (v: z.infer<typeof composeSchema>) => {
      const data = await api<{ id?: string; status?: string; last_event?: string; error?: string }>("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: activeId,
          to: v.to,
          cc: v.cc,
          subject: v.subject,
          text: v.body,
          attachments: files.map((f) => ({ name: f.name, mime: f.mime, data: f.data })),
        }),
      });
      await insertRecord("emails", {
        to_addr: v.to,
        subject: v.subject,
        body: v.body,
        status: data.status === "failed" ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        resend_id: data.id ?? "",
        mailbox: active?.label ?? "",
        attachments: files.map((f) => f.name).join(", "),
      });
      return data;
    },
    onSuccess: () => {
      form.reset();
      setFiles([]);
      setComposing(false);
      setTab("sent");
      void qc.invalidateQueries({ queryKey: ["email-sent", activeId] });
    },
    onError: async (_e, v) => {
      try {
        await insertRecord("emails", {
          to_addr: v.to,
          subject: v.subject,
          body: v.body,
          status: "failed",
          sent_at: new Date().toISOString(),
          resend_id: "",
          mailbox: active?.label ?? "",
          attachments: files.map((f) => f.name).join(", "),
        });
      } catch {
        /* ignore */
      }
      void qc.invalidateQueries({ queryKey: ["email-sent", activeId] });
    },
  });

  const source = tab === "inbox" ? inbox.data?.data ?? [] : sent.data?.data ?? [];
  const rows = useMemo(
    () => (tab === "failed" ? source.filter((r) => isMailFailed(r)) : source),
    [tab, source],
  );
  const boxQ = tab === "inbox" ? inbox : sent;
  const failedCount = (sent.data?.data ?? []).filter((r) => isMailFailed(r)).length;

  function startCompose() {
    form.reset({ to: "", cc: "", subject: "", body: "" });
    setFiles([]);
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
    markMailSeen(id);
    void qc.invalidateQueries({ queryKey: ["unseen-mail"] });
    setOpenId(id);
    setComposing(false);
    setPane("read");
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-2 sm:gap-3">
      <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Mail</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Inbox</h1>
          <p className="mt-0.5 hidden text-sm text-paper/55 sm:block">HTML, photos, documents, and send status — same on phone.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button className="flex-1 sm:flex-none" variant="outline" asChild>
            <Link to="/email-setup">
              <Settings2 className="h-4 w-4" />
              Setup
            </Link>
          </Button>
          <Button className="flex-1 sm:flex-none" disabled={!activeId} onClick={startCompose}>
            <PenLine className="h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

      {boxes.isError ? (
        <Card className="shrink-0 border-red-900/50 text-sm text-red-300">{(boxes.error as Error).message}</Card>
      ) : null}

      <div className="flex min-w-0 shrink-0 gap-2 overflow-x-auto pb-0.5">
        {mailboxes.map((m) => {
          const on = m.id === activeId;
          const c = accentFor(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pickBox(m.id)}
              className={cn(
                "min-w-[9.5rem] shrink-0 rounded-2xl border px-3 py-2 text-left transition",
                on ? "border-transparent bg-panel shadow-lg" : "border-line/80 bg-ink/40 hover:border-gold/30",
              )}
              style={on ? { boxShadow: `inset 3px 0 0 ${c}` } : undefined}
            >
              <div className="truncate text-sm font-semibold">{m.label}</div>
              <div className="truncate text-[11px] text-paper/45">{m.from}</div>
            </button>
          );
        })}
        {mailboxes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-paper/50">
            Koi mailbox nahi.{" "}
            <Link to="/email-setup" className="text-gold">
              Email setup
            </Link>
          </div>
        ) : null}
      </div>

      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-panel/60 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        style={{ borderTopColor: accent }}
      >
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-b border-line lg:border-b-0 lg:border-r",
            pane === "read" ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="grid grid-cols-3 gap-1 border-b border-line p-2">
            {(
              [
                ["inbox", "Inbox", Inbox],
                ["sent", "Sent", Send],
                ["failed", `Failed${failedCount ? ` ${failedCount}` : ""}`, CircleAlert],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? "default" : "ghost"}
                className="w-full min-w-0 px-1"
                onClick={() => {
                  setTab(id);
                  setOpenId(null);
                  setComposing(false);
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </Button>
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {boxQ.isLoading ? <p className="p-4 text-sm text-paper/50">Loading {tab}…</p> : null}
            {boxQ.isError ? <p className="p-4 text-sm text-red-300">{(boxQ.error as Error).message}</p> : null}
            {boxQ.data && rows.length === 0 ? (
              <p className="p-6 text-sm text-paper/45">{tab === "failed" ? "Koi failed mail nahi." : `Is mailbox ke ${tab} mein kuch nahi.`}</p>
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
                    tab === "inbox" && mailIsUnseen(row.id) ? "font-semibold" : "",
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {tab === "inbox" && mailIsUnseen(row.id) ? <span className="h-2 w-2 shrink-0 rounded-full bg-gold" /> : null}
                        <div className="truncate text-[13px] font-medium">{row.subject || "(no subject)"}</div>
                      </div>
                      <div className="truncate text-[11px] text-paper/45">{tab === "inbox" ? row.from : addrLine(row.to)}</div>
                      {row.snippet ? <div className="mt-0.5 line-clamp-2 text-[11px] text-paper/40">{row.snippet}</div> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <time className="whitespace-nowrap text-[10px] text-paper/35">{when(row.created_at)}</time>
                      <StatusChip row={row} />
                      {(row.attachment_count || 0) > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-paper/45">
                          <Paperclip className="h-3 w-3" />
                          {row.attachment_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className={cn("flex min-h-0 min-w-0 flex-col bg-ink/25", pane === "list" ? "hidden lg:flex" : "flex")}>
          <div className="flex items-center gap-2 border-b border-line px-2 py-2 lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Back to list" onClick={() => setPane("list")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-0 truncate text-sm font-medium">{composing ? "Compose" : "Message"}</span>
          </div>

          {composing ? (
            <form className="grid min-w-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4" onSubmit={form.handleSubmit((v) => send.mutate(v))}>
              <p className="break-all text-xs text-paper/45">Sending as {active?.from}</p>
              <div className="grid gap-1">
                <Label htmlFor="to">To</Label>
                <Input id="to" inputMode="email" autoComplete="email" placeholder="name@example.com" {...form.register("to")} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cc">Cc</Label>
                <Input id="cc" inputMode="email" placeholder="optional" {...form.register("cc")} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" {...form.register("subject")} />
              </div>
              <div className="grid flex-1 gap-1">
                <Label htmlFor="body">Message</Label>
                <Textarea id="body" className="min-h-40" {...form.register("body")} />
              </div>
              <FileAttachments
                files={files}
                onChange={setFiles}
                label="Photos & documents"
                hint="PDF, images, Word, Excel, zip — max 4 files, 4MB each."
                maxBytes={4_000_000}
              />
              {send.isError ? <p className="text-sm text-red-400">{send.error.message}</p> : null}
              {send.isSuccess ? (
                <p className="text-sm text-mint">
                  {send.data.status === "failed" ? "Failed" : "Queued / sent"} — status Sent folder me dikhega.
                </p>
              ) : null}
              <Button type="submit" disabled={send.isPending || !activeId} className="sticky bottom-0">
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </form>
          ) : openId ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {detail.isLoading ? <p className="text-sm text-paper/50">Opening…</p> : null}
              {detail.isError ? <p className="break-words text-sm text-red-300">{(detail.error as Error).message}</p> : null}
              {detail.data ? (
                <div className="grid min-w-0 gap-3">
                  <MailBody mail={detail.data} mailboxId={activeId} folder={folder} />
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      form.reset({
                        to: detail.data?.from || "",
                        cc: "",
                        subject: `Re: ${detail.data?.subject || ""}`.replace(/^Re: Re: /, "Re: "),
                        body: "",
                      });
                      setComposing(true);
                    }}
                  >
                    Reply from {active?.label}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="m-auto grid max-w-sm gap-3 p-8 text-center text-sm text-paper/50">
              <p>{activeId ? "Compose se naya mail, ya list se message kholo. Photos/PDF yahin khulenge." : "Pehle Email setup se mailbox connect karo."}</p>
              {activeId ? (
                <Button className="mx-auto" onClick={startCompose}>
                  <PenLine className="h-4 w-4" />
                  Compose
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {activeId && !composing && pane === "list" ? (
        <button
          type="button"
          onClick={startCompose}
          className="fixed bottom-[calc(4.75rem+var(--sab))] right-[max(0.75rem,var(--sar))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-xl lg:hidden"
          aria-label="Compose mail"
        >
          <PenLine className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}

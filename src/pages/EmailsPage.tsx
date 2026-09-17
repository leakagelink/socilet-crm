import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { insertRecord } from "@/lib/db";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
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

export function EmailsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mailboxId, setMailboxId] = useState("");

  const boxes = useQuery({
    queryKey: ["email-mailboxes"],
    queryFn: () => api<{ data: Mailbox[] }>("/api/email/mailboxes"),
  });

  const mailboxes = boxes.data?.data ?? [];
  const activeId = mailboxId || mailboxes[0]?.id || "";
  const active = mailboxes.find((m) => m.id === activeId) ?? mailboxes[0];

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
      void qc.invalidateQueries({ queryKey: ["email-sent", activeId] });
    },
  });

  const addBox = useMutation({
    mutationFn: (v: z.infer<typeof boxSchema>) =>
      api<{ mailbox: Mailbox }>("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      }),
    onSuccess: (data) => {
      addForm.reset();
      setMailboxId(data.mailbox.id);
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
    },
  });

  const removeBox = useMutation({
    mutationFn: (id: string) => api(`/api/email/mailboxes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setMailboxId("");
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
    },
  });

  const rows = tab === "inbox" ? inbox.data?.data ?? [] : sent.data?.data ?? [];
  const boxQ = tab === "inbox" ? inbox : sent;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Email setup</h1>
        <p className="text-sm text-paper/60">
          Yahan mailbox connect hota hai. Label + From + Resend API → Add &amp; connect. Niche usi box ka inbox/sent/compose hai.
        </p>
      </div>

      {boxes.isError ? <Card className="text-red-300">Email API is not running on this host (`node server.mjs` / `npm run dev`).</Card> : null}

      <Card id="setup" className="grid gap-4">
        <h2 className="text-lg font-semibold text-gold">Connect mailbox</h2>
        <p className="text-sm text-paper/60">
          Har domain ke liye alag Resend API. Connect ke baad inbox aur send alag rehte hain.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-56 flex-1 gap-1">
            <Label htmlFor="mailbox">Active mailbox</Label>
            <select
              id="mailbox"
              className="h-10 rounded-lg border border-line bg-ink/60 px-3"
              value={activeId}
              onChange={(e) => {
                setMailboxId(e.target.value);
                setOpenId(null);
              }}
            >
              {mailboxes.length === 0 ? <option value="">No mailbox yet</option> : null}
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.domain} {m.connected ? "" : "(disconnected)"}
                </option>
              ))}
            </select>
          </div>
          {active ? (
            <div className="text-xs text-paper/50">
              From {active.from} · key {active.keyHint}
            </div>
          ) : null}
          {active && active.id !== "env-default" ? (
            <Button variant="outline" size="sm" onClick={() => removeBox.mutate(active.id)}>
              Remove mailbox
            </Button>
          ) : null}
        </div>

        <form className="grid gap-3 md:grid-cols-4 md:items-end" onSubmit={addForm.handleSubmit((v) => addBox.mutate(v))}>
          <div className="grid gap-1">
            <Label htmlFor="box-label">New mailbox name</Label>
            <Input id="box-label" placeholder="Proofvault support" {...addForm.register("label")} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="box-from">From (that domain)</Label>
            <Input id="box-from" placeholder="Support &lt;hello@proofvault.space&gt;" {...addForm.register("from")} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="box-key">Resend API key</Label>
            <Input id="box-key" type="password" autoComplete="off" placeholder="re_…" {...addForm.register("apiKey")} />
          </div>
          <Button type="submit" disabled={addBox.isPending}>
            {addBox.isPending ? "Connecting…" : "Add & connect"}
          </Button>
        </form>
        {addBox.isError ? <p className="text-sm text-red-400">{addBox.error.message}</p> : null}
        {addBox.isSuccess ? <p className="text-sm text-mint">Mailbox connected. Inbox/sent is separate from other boxes.</p> : null}
      </Card>

      <div className="flex gap-2">
        <Button variant={tab === "inbox" ? "default" : "outline"} onClick={() => { setTab("inbox"); setOpenId(null); }}>
          Inbox
        </Button>
        <Button variant={tab === "sent" ? "default" : "outline"} onClick={() => { setTab("sent"); setOpenId(null); }}>
          Sent
        </Button>
      </div>

      {!activeId ? <Card>Pehle mailbox add karo: label, from@domain, Resend API. Key server par save hoti hai, GitHub par nahi.</Card> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gold">Compose / Reply · {active?.label ?? "—"}</h2>
          <form className="grid gap-3" onSubmit={form.handleSubmit((v) => send.mutate(v))}>
            <div className="grid gap-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" {...form.register("to")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" {...form.register("subject")} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" rows={8} {...form.register("body")} />
            </div>
            {send.isError ? <p className="text-sm text-red-400">{send.error.message}</p> : null}
            {send.isSuccess ? <p className="text-sm text-mint">Sent from {active?.from}</p> : null}
            <Button type="submit" disabled={send.isPending || !activeId}>
              {send.isPending ? "Sending…" : "Send with this mailbox"}
            </Button>
          </form>
        </Card>

        <div className="grid gap-3">
          <Card>
            {boxQ.isLoading ? <p>Loading…</p> : null}
            {boxQ.isError ? <p className="text-red-300">{(boxQ.error as Error).message}</p> : null}
            {boxQ.data && rows.length === 0 ? <p className="text-paper/60">No messages in {tab} for this mailbox.</p> : null}
            <div className="grid gap-2">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-ink/40"
                  onClick={() => setOpenId(row.id)}
                >
                  <div className="font-medium">{row.subject || "(no subject)"}</div>
                  <div className="text-xs text-paper/50">
                    {tab === "inbox" ? row.from : addr(row.to)} · {row.created_at?.slice(0, 16)?.replace("T", " ")}
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {openId ? (
            <Card>
              {detail.isLoading ? <p>Loading message…</p> : null}
              {detail.isError ? <p className="text-red-300">{(detail.error as Error).message}</p> : null}
              {detail.data ? (
                <div className="grid gap-2 text-sm">
                  <div className="font-medium">{detail.data.subject}</div>
                  <div className="text-xs text-paper/50">
                    From {detail.data.from} → {addr(detail.data.to)}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg border border-line p-3">
                    {detail.data.text || detail.data.html?.replace(/<[^>]+>/g, " ") || ""}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      form.setValue("to", detail.data?.from || "");
                      form.setValue("subject", `Re: ${detail.data?.subject || ""}`.replace(/^Re: Re: /, "Re: "));
                    }}
                  >
                    Reply from this mailbox
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

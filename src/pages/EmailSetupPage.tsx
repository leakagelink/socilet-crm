import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Inbox, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { forgetMailbox, rememberMailbox } from "@/lib/mailboxStore";
import { emailApi, type Mailbox } from "@/lib/emailClient";

const boxSchema = z.object({
  label: z.string().trim().min(1, "Required"),
  from: z.string().trim().min(3).refine((v) => v.includes("@"), "Use name@your-domain"),
  apiKey: z.string().trim().min(8).refine((v) => v.startsWith("re_"), "Resend keys start with re_"),
});

export function EmailSetupPage() {
  const qc = useQueryClient();
  const boxes = useQuery({
    queryKey: ["email-mailboxes"],
    queryFn: () => emailApi<{ data: Mailbox[] }>("/api/email/mailboxes"),
  });
  const mailboxes = boxes.data?.data ?? [];
  const form = useForm({
    resolver: zodResolver(boxSchema),
    defaultValues: { label: "", from: "", apiKey: "" },
  });

  const addBox = useMutation({
    mutationFn: async (v: z.infer<typeof boxSchema>) => {
      const data = await emailApi<{ mailbox?: Mailbox }>("/api/email/mailboxes", {
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
    onSuccess: () => {
      form.reset();
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
      void qc.invalidateQueries({ queryKey: ["unseen-mail"] });
    },
  });

  const removeBox = useMutation({
    mutationFn: async (id: string) => {
      await emailApi(`/api/email/mailboxes/${id}`, { method: "DELETE" });
      await forgetMailbox(id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-mailboxes"] });
      void qc.invalidateQueries({ queryKey: ["unseen-mail"] });
    },
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Mail"
        title="Email setup"
        description="Yahan mailbox connect aur delete hote hain. Inbox se koi account nahi hatega."
        actions={
          <Button variant="outline" asChild>
            <Link to="/emails">
              <Inbox className="h-4 w-4" />
              Open inbox
            </Link>
          </Button>
        }
      />

      {boxes.isError ? <Card className="border-red-900/50 text-sm text-red-300">{(boxes.error as Error).message}</Card> : null}

      <Card className="grid gap-3">
        <h2 className="font-semibold text-gold">Connect mailbox</h2>
        <p className="text-xs text-paper/50">Resend verified domain + API key. Keys server par rehti hain.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => addBox.mutate(v))}>
          <div className="grid gap-1">
            <Label htmlFor="box-label">Name</Label>
            <Input id="box-label" placeholder="Socilet" {...form.register("label")} />
            {form.formState.errors.label ? <p className="text-xs text-red-400">{form.formState.errors.label.message}</p> : null}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="box-from">From</Label>
            <Input id="box-from" placeholder="Socilet &lt;hello@socilet.in&gt;" {...form.register("from")} />
            {form.formState.errors.from ? <p className="text-xs text-red-400">{form.formState.errors.from.message}</p> : null}
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="box-key">Resend API</Label>
            <Input id="box-key" type="password" autoComplete="off" placeholder="re_…" {...form.register("apiKey")} />
            {form.formState.errors.apiKey ? <p className="text-xs text-red-400">{form.formState.errors.apiKey.message}</p> : null}
          </div>
          <div>
            <Button type="submit" disabled={addBox.isPending}>
              {addBox.isPending ? "Connecting…" : "Connect mailbox"}
            </Button>
          </div>
        </form>
        {addBox.isError ? <p className="text-sm text-red-400">{addBox.error.message}</p> : null}
        {addBox.isSuccess ? <p className="text-sm text-mint">Mailbox connected.</p> : null}
      </Card>

      <div className="grid gap-2">
        <h2 className="font-display text-lg">Connected accounts</h2>
        {boxes.isLoading ? <Card>Loading mailboxes…</Card> : null}
        {mailboxes.length === 0 && !boxes.isLoading ? (
          <Card className="text-sm text-paper/55">Koi mailbox nahi. Upar se connect karo.</Card>
        ) : null}
        {mailboxes.map((m) => (
          <Card key={m.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{m.label}</div>
              <div className="truncate text-sm text-paper/50">{m.from}</div>
              <div className="text-xs text-paper/40">
                {m.domain}
                {m.keyHint ? ` · ${m.keyHint}` : ""}
                {m.connected ? " · connected" : " · not connected"}
              </div>
              {m.lastError ? <p className="mt-1 text-xs text-red-400">{m.lastError}</p> : null}
            </div>
            {m.id === "env-default" ? (
              <p className="text-xs text-paper/40">Server env mailbox — yahan se delete nahi hota</p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={removeBox.isPending}
                onClick={() => {
                  if (window.confirm(`Delete mailbox ${m.label}?`)) removeBox.mutate(m.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </Card>
        ))}
        {removeBox.isError ? <p className="text-sm text-red-400">{removeBox.error.message}</p> : null}
      </div>
    </div>
  );
}

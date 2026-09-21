import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Phone, Plus, Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { insertRecord, listRecords, type RecordRow } from "@/lib/db";
import { uid } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/components/HighlightCell";
import { meetingShareUrl } from "@/pages/MeetingRoomPage";
import { moduleById } from "@/lib/modules";
import { ModuleCrud } from "@/pages/ModuleCrud";

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function MeetingsPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"rooms" | "apis" | "log">("rooms");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Client meeting");
  const [kind, setKind] = useState<"meeting" | "call">("meeting");
  const [client, setClient] = useState("");
  const [callee, setCallee] = useState("");
  const [when, setWhen] = useState("");
  const [time, setTime] = useState("10:00");
  const [autoRec, setAutoRec] = useState(true);
  const [log, setLog] = useState<RecordRow | null>(null);

  const q = useQuery({
    queryKey: ["module", "meetings"],
    queryFn: () => listRecords("meetings"),
    refetchInterval: 5000,
  });
  const clients = useQuery({ queryKey: ["module", "clients"], queryFn: () => listRecords("clients") });

  const ringing = useMemo(
    () =>
      (q.data ?? []).filter(
        (r) => str(r.data.status) === "ringing" && str(r.data.callee_email).toLowerCase() === (session?.email || "").toLowerCase(),
      ),
    [q.data, session?.email],
  );

  const create = useMutation({
    mutationFn: async (startNow: boolean) => {
      const token = uid();
      return insertRecord("meetings", {
        title: title.trim() || "Meeting",
        kind,
        direction: "outgoing",
        client,
        callee_email: callee,
        scheduled_at: when,
        scheduled_time: time,
        status: startNow ? (kind === "call" ? "ringing" : "live") : "scheduled",
        recording_enabled: true,
        auto_record: autoRec,
        share_token: token,
        room_name: `socilet-${token.slice(0, 8)}`,
        created_by: session?.email || "",
        active: true,
        duration_sec: 0,
        chat: [],
        files: [],
      });
    },
    onSuccess: async (row, startNow) => {
      await qc.invalidateQueries({ queryKey: ["module", "meetings"] });
      setOpen(false);
      if (startNow) nav(`/meetings/${row.id}/room`);
    },
  });

  const rows = q.data ?? [];
  const past = rows.filter((r) => str(r.data.status) === "ended");

  return (
    <div className="grid gap-4">
      <PageHeader
        kicker="Work"
        title="Meetings & calls"
        description="1-to-1 video, schedule, share link, chat/files, recording. APIs: Daily, LiveKit, Agora, ZEGOCLOUD — quota fail hone par next rotate."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        }
      />

      {ringing.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-mint/40 p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-mint">Incoming call</div>
            <div className="font-display text-xl">{str(r.data.title)}</div>
            <div className="text-sm text-paper/50">{str(r.data.client) || str(r.data.created_by)}</div>
          </div>
          <Button onClick={() => nav(`/meetings/${r.id}/room`)}>
            <Phone className="h-4 w-4" />
            Answer
          </Button>
        </Card>
      ))}

      <div className="flex w-fit gap-1 rounded-full border border-gold/25 bg-gold/8 p-1">
        {(
          [
            ["rooms", "Rooms"],
            ["log", "Closed data"],
            ["apis", "API keys"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs ${tab === id ? "bg-gold/25 text-gold" : "text-paper/55"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rooms" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows
            .filter((r) => str(r.data.status) !== "ended")
            .map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <StatusBadge value={r.data.status} />
                  <span className="text-xs text-paper/45">{str(r.data.kind)}</span>
                </div>
                <div className="font-display text-lg">{str(r.data.title)}</div>
                <div className="text-xs text-paper/50">
                  {str(r.data.client)} {str(r.data.scheduled_at)} {str(r.data.scheduled_time)}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => nav(`/meetings/${r.id}/room`)}>
                    <Video className="h-3.5 w-3.5" />
                    Join
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(meetingShareUrl(r));
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </Button>
                </div>
              </Card>
            ))}
          {!rows.filter((r) => str(r.data.status) !== "ended").length ? (
            <Card className="p-6 text-sm text-paper/50">No open meetings. Schedule or start a call.</Card>
          ) : null}
        </div>
      ) : null}

      {tab === "log" ? (
        <div className="grid gap-3">
          {past.map((r) => (
            <Card key={r.id} className="p-4">
              <button type="button" className="w-full text-left" onClick={() => setLog(log?.id === r.id ? null : r)}>
                <div className="font-display text-lg">{str(r.data.title)}</div>
                <div className="text-xs text-paper/50">
                  {Math.round(Number(r.data.duration_sec || 0) / 60)} min · {str(r.data.provider)} · {(Array.isArray(r.data.chat) ? r.data.chat.length : 0)} chat
                </div>
              </button>
              {log?.id === r.id ? (
                <div className="mt-3 grid gap-2 text-sm">
                  {str(r.data.recording_url) ? (
                    <video src={String(r.data.recording_url)} controls className="w-full rounded-xl" />
                  ) : (
                    <p className="text-paper/45">No CRM recording (admin auto-save, or local download).</p>
                  )}
                  <div className="font-medium">Chat & files</div>
                  {(Array.isArray(r.data.chat) ? r.data.chat : []).map((c: { id: string; from: string; text: string; file?: { url: string; name: string } }) => (
                    <div key={c.id} className="rounded-lg bg-gold/8 px-2 py-1">
                      <span className="text-gold/70">{c.from}: </span>
                      {c.text}
                      {c.file?.url ? (
                        <a className="ml-2 text-gold underline" href={c.file.url}>
                          {c.file.name}
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
          {!past.length ? <Card className="p-6 text-sm text-paper/50">Closed meetings will list chat, files, and recording here.</Card> : null}
        </div>
      ) : null}

      {tab === "apis" ? (
        session?.role === "admin" ? (
          <ModuleCrud module={moduleById("meeting_providers")!} hideHeader />
        ) : (
          <Card className="p-4 text-sm text-paper/55">Only admin can add Agora / Daily / LiveKit / ZEGOCLOUD keys. If one hits limit, join automatically tries the next, then built-in 1-to-1.</Card>
        )
      ) : null}

      <Modal open={open} onOpenChange={setOpen} title="Schedule or start">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(false);
          }}
        >
          <div className="grid gap-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Type</Label>
            <select className="h-11 rounded-xl border border-gold/20 bg-ink/70 px-3" value={kind} onChange={(e) => setKind(e.target.value as "meeting" | "call")}>
              <option value="meeting">Meeting (shareable link)</option>
              <option value="call">1-to-1 call</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>Client / person</Label>
            <Input list="meet-clients" value={client} onChange={(e) => setClient(e.target.value)} />
            <datalist id="meet-clients">
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={str(c.data.name)} />
              ))}
            </datalist>
          </div>
          {kind === "call" ? (
            <div className="grid gap-1">
              <Label>Staff email to ring</Label>
              <Input value={callee} onChange={(e) => setCallee(e.target.value)} placeholder="colleague@…" />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Date</Label>
              <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoRec} onChange={(e) => setAutoRec(e.target.checked)} />
            Auto record (admin CRM save; others can save on device)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={create.isPending}>
              Schedule
            </Button>
            <Button type="button" disabled={create.isPending} onClick={() => create.mutate(true)}>
              Start now
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

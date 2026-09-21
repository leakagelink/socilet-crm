import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MonitorSpeaker,
  Circle,
  Download,
  Send,
  Paperclip,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listRecords, type RecordRow } from "@/lib/db";
import { uid } from "@/lib/utils";
import {
  hangupMeet,
  loadScript,
  meetChat,
  meetFail,
  meetJoin,
  meetRoom,
  saveMeetRecording,
  sendMeetChat,
  sendMeetFile,
  type ChatLine,
  type MeetJoin,
} from "@/lib/meet";
import { startMesh } from "@/lib/meetMesh";

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

async function attachProvider(join: MeetJoin, local: MediaStream, remoteEl: HTMLVideoElement | null, box: HTMLElement | null) {
  const w = window as unknown as Record<string, unknown>;
  if (join.provider === "daily" && join.url && box) {
    box.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = join.url;
    iframe.allow = "camera; microphone; fullscreen; display-capture; autoplay";
    iframe.className = "h-full w-full rounded-2xl border-0";
    box.appendChild(iframe);
    return () => {
      iframe.remove();
    };
  }
  if (join.provider === "agora") {
    await loadScript("https://download.agora.io/sdk/release/AgoraRTC_N-4.23.1.js");
    const AgoraRTC = w.AgoraRTC as {
      createClient: (o: { mode: string; codec: string }) => {
        join: (app: string, ch: string, tok: string, uid: number) => Promise<void>;
        publish: (t: unknown[]) => Promise<void>;
        leave: () => Promise<void>;
        on: (ev: string, fn: (u: unknown, m: { play: (el: string) => void }) => void) => void;
      };
      createMicrophoneAndCameraTracks: () => Promise<[{ setEnabled: (v: boolean) => void }, { setEnabled: (v: boolean) => void }]>;
    };
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    client.on("user-published", async (_u, media) => {
      media.play("meet-remote");
    });
    await client.join(String(join.appId), join.room, String(join.token), Number(join.uid || 0));
    return () => {
      void client.leave();
    };
  }
  if (join.provider === "livekit" && join.url && join.token) {
    await loadScript("https://cdn.jsdelivr.net/npm/livekit-client@2.15.7/dist/livekit-client.umd.js");
    const LK = w.LivekitClient as {
      Room: new () => {
        connect: (url: string, token: string) => Promise<void>;
        disconnect: () => Promise<void>;
        localParticipant: { videoTrackPublications: Map<string, { track?: { attach: (el: HTMLElement) => void } }> };
        on: (ev: string, fn: (t: { attach: (el: HTMLMediaElement) => void }) => void) => void;
      };
      createLocalTracks: () => Promise<unknown[]>;
      RoomEvent: { TrackSubscribed: string };
    };
    const room = new LK.Room();
    room.on("TrackSubscribed", (track) => {
      if (remoteEl) track.attach(remoteEl);
    });
    await room.connect(join.url, join.token);
    return () => {
      void room.disconnect();
    };
  }
  if (join.provider === "zegocloud" && box) {
    await loadScript("https://unpkg.com/@zegocloud/zego-uikit-prebuilt@2.14.1/zego-uikit-prebuilt.js");
    const Z = w.ZegoUIKitPrebuilt as {
      create: (app: number, token: string, room: string, user: string, name: string) => { joinRoom: (o: { container: HTMLElement }) => void; destroy: () => void };
    };
    const kit = Z.create(Number(join.appId), String(join.token), join.room, String(join.userId), String(join.userId));
    kit.joinRoom({ container: box });
    return () => kit.destroy();
  }
  void local;
  return null;
}

export function MeetingStage({ token, guestName }: { token: string; guestName?: string }) {
  const auth = useAuth();
  const nav = useNavigate();
  const session = auth.session;
  const isAdmin = session?.role === "admin";
  const me = guestName || session?.fullName || session?.email || "Guest";
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const mixRef = useRef<HTMLCanvasElement>(null);
  const vendorRef = useRef<HTMLDivElement>(null);
  const [join, setJoin] = useState<MeetJoin | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sec, setSec] = useState(0);
  const [recOn, setRecOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [msg, setMsg] = useState("");
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [sink, setSink] = useState("");
  const [note, setNote] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const lastBlob = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopMesh = useRef<(() => void) | null>(null);
  const stopVendor = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setSec((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      void meetChat(token).then((r) => setChat(r.data ?? []));
    }, 2500);
    return () => window.clearInterval(t);
  }, [token]);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const meta = await meetRoom(token);
        setRecOn(meta.data.recording_enabled !== false);
        setChat(meta.chat ?? []);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
        if (gone) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        const devices = await navigator.mediaDevices.enumerateDevices();
        setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
        const peerId = uid();
        const creds = await meetJoin(token, me);
        if (gone) return;
        setJoin(creds.data);
        setNote(creds.data.note || "");
        setRecOn(meta.data.auto_record !== false && meta.data.recording_enabled !== false);
        try {
          const stop = await attachProvider(creds.data, stream, remoteRef.current, vendorRef.current);
          stopVendor.current = stop;
          if (!stop || creds.data.provider === "mesh") {
            stopMesh.current = await startMesh({
              room: creds.data.room,
              peerId,
              stream,
              onRemote: (s) => {
                if (remoteRef.current) remoteRef.current.srcObject = s;
              },
            });
          }
        } catch (e) {
          if (creds.data.provider_id) await meetFail(creds.data.provider_id, e instanceof Error ? e.message : "join failed");
          const again = await meetJoin(token, me, creds.data.provider_id ? [creds.data.provider_id] : []);
          setJoin(again.data);
          stopMesh.current = await startMesh({
            room: again.data.room,
            peerId,
            stream,
            onRemote: (s) => {
              if (remoteRef.current) remoteRef.current.srcObject = s;
            },
          });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not join");
      }
    })();
    return () => {
      gone = true;
      stopMesh.current?.();
      stopVendor.current?.();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [token, me]);

  useEffect(() => {
    if (!recOn || !join) return;
    const id = window.setTimeout(() => {
      if (!recording) void toggleRec(true);
    }, 2500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join, recOn]);

  function setTrack(kind: "audio" | "video", enabled: boolean) {
    streamRef.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => {
      t.enabled = enabled;
    });
  }

  async function toggleRec(forceOn?: boolean) {
    const want = forceOn ?? !recording;
    if (want) {
      const canvas = mixRef.current;
      const local = localRef.current;
      const remote = remoteRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const draw = () => {
        if (!ctx) return;
        ctx.fillStyle = "#120c08";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (remote?.srcObject) ctx.drawImage(remote, 0, 0, canvas.width, canvas.height);
        if (local) ctx.drawImage(local, canvas.width - 220, canvas.height - 160, 200, 140);
        if (recRef.current) requestAnimationFrame(draw);
      };
      const mixed = canvas.captureStream(12);
      streamRef.current?.getAudioTracks().forEach((t) => mixed.addTrack(t));
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(mixed, { mimeType: "video/webm;codecs=vp8,opus" });
      } catch {
        rec = new MediaRecorder(mixed);
      }
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.start(1000);
      recRef.current = rec;
      setRecording(true);
      draw();
    } else {
      const rec = recRef.current;
      recRef.current = null;
      setRecording(false);
      if (!rec) return;
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop();
      });
      const blob = new Blob(chunks.current, { type: "video/webm" });
      lastBlob.current = blob;
      if (isAdmin) {
        try {
          await saveMeetRecording(token, blob);
        } catch {
          downloadBlob(blob);
        }
      } else {
        downloadBlob(blob);
      }
    }
  }

  function downloadBlob(blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meeting-${token.slice(0, 8)}.webm`;
    a.click();
  }

  async function leave() {
    try {
      if (recording) await toggleRec(false);
    } catch {
      /* ignore */
    }
    await hangupMeet(token);
    if (session) nav("/meetings");
    else nav("/login");
  }

  return (
    <div className="grid min-h-[70vh] gap-3 lg:grid-cols-[1fr_20rem]">
      <Card className="relative overflow-hidden p-2">
        {err ? <p className="p-3 text-sm text-rose-400">{err}</p> : null}
        {note ? <p className="px-3 pt-2 text-xs text-gold/80">{note}</p> : null}
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink">
          <div ref={vendorRef} className="absolute inset-0" />
          <video id="meet-remote" ref={remoteRef} autoPlay playsInline className="h-full w-full object-cover" />
          <video ref={localRef} autoPlay muted playsInline className="absolute bottom-3 right-3 h-28 w-40 rounded-xl border border-gold/30 object-cover" />
          <canvas ref={mixRef} width={1280} height={720} className="hidden" />
          <div className="absolute left-3 top-3 rounded-full bg-ink/70 px-3 py-1 text-xs">
            {fmt(sec)} · {join?.provider || "connecting"} {recording ? " · REC" : ""}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMuted((v) => {
                setTrack("audio", v);
                return !v;
              });
            }}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCamOff((v) => {
                setTrack("video", v);
                return !v;
              });
            }}
          >
            {camOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            {camOff ? "Camera on" : "Camera off"}
          </Button>
          {speakers.length ? (
            <label className="flex items-center gap-1 text-xs text-paper/60">
              <MonitorSpeaker className="h-4 w-4" />
              <select
                className="rounded-lg border border-gold/20 bg-ink/70 px-2 py-1"
                value={sink}
                onChange={async (e) => {
                  setSink(e.target.value);
                  const el = remoteRef.current as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
                  await el?.setSinkId?.(e.target.value);
                }}
              >
                {speakers.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Speaker"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            variant={recording ? "default" : "outline"}
            size="sm"
            disabled={!recOn && !recording}
            onClick={() => void toggleRec()}
          >
            <Circle className="h-4 w-4" />
            {recording ? "Stop rec" : "Record"}
          </Button>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={recOn} onChange={(e) => setRecOn(e.target.checked)} />
            Auto record
          </label>
          {!isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (lastBlob.current) downloadBlob(lastBlob.current);
                else if (recording) void toggleRec(false);
              }}
            >
              <Download className="h-4 w-4" />
              Save on device
            </Button>
          ) : (
            <span className="text-[11px] text-paper/45">Admin: CRM save on stop</span>
          )}
          <Button variant="outline" size="sm" className="text-rose-400" onClick={() => void leave()}>
            <PhoneOff className="h-4 w-4" />
            End
          </Button>
        </div>
      </Card>
      <Card className="flex max-h-[70vh] flex-col p-3">
        <div className="mb-2 text-sm font-medium">Meeting chat</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
          {chat.map((c) => (
            <div key={c.id} className="rounded-xl bg-gold/8 px-2 py-1.5">
              <div className="text-[10px] text-gold/70">
                {c.from} · {c.at.slice(11, 16)}
              </div>
              <div>{c.text}</div>
              {c.file?.url ? (
                <a className="text-xs text-gold underline" href={c.file.url} target="_blank" rel="noreferrer">
                  {c.file.name}
                </a>
              ) : null}
            </div>
          ))}
        </div>
        <form
          className="mt-2 flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!msg.trim()) return;
            await sendMeetChat(token, me, msg.trim());
            setMsg("");
            const r = await meetChat(token);
            setChat(r.data ?? []);
          }}
        >
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" />
          <Button type="submit" size="icon" aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <label className="mt-2 flex cursor-pointer items-center gap-1 text-xs text-paper/55">
          <Paperclip className="h-3.5 w-3.5" />
          Photo / PDF / docs
          <input
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              await sendMeetFile(token, me, f);
              const r = await meetChat(token);
              setChat(r.data ?? []);
            }}
          />
        </label>
      </Card>
    </div>
  );
}

export function MeetingRoomPage() {
  const { id } = useParams();
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!id) return;
    void listRecords("meetings").then((rows) => {
      const row = rows.find((r) => r.id === id);
      setToken(String(row?.data.share_token || ""));
    });
  }, [id]);
  if (!token) return <Card className="p-4">Opening room…</Card>;
  return (
    <div className="grid gap-3">
      <Link to="/meetings" className="text-sm text-gold">
        ← Meetings
      </Link>
      <MeetingStage token={token} />
    </div>
  );
}

export function MeetingJoinPage() {
  const { token = "" } = useParams();
  const [name, setName] = useState("");
  const [go, setGo] = useState(false);
  if (!go) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <Card className="grid w-full max-w-md gap-3 p-5">
          <h1 className="font-display text-2xl">Join meeting</h1>
          <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={name.trim().length < 2} onClick={() => setGo(true)}>
            Join video
          </Button>
        </Card>
      </div>
    );
  }
  return (
    <div className="p-3 sm:p-6">
      <MeetingStage token={token} guestName={name.trim()} />
    </div>
  );
}

export function meetingShareUrl(row: RecordRow) {
  const t = String(row.data.share_token || "");
  return `${window.location.origin}/join/${t}`;
}

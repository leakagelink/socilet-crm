import { getSignal, postSignal } from "@/lib/meet";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export async function startMesh(opts: {
  room: string;
  peerId: string;
  stream: MediaStream;
  onRemote: (s: MediaStream) => void;
}) {
  const pc = new RTCPeerConnection(ICE);
  for (const t of opts.stream.getTracks()) pc.addTrack(t, opts.stream);
  pc.ontrack = (e) => {
    const s = e.streams[0];
    if (s) opts.onRemote(s);
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) void postSignal({ room: opts.room, peer: opts.peerId, ice: e.candidate.toJSON() });
  };

  let offered = false;
  let answeredFor = "";
  const timer = window.setInterval(async () => {
    try {
      const res = await getSignal(opts.room, opts.peerId);
      const others = res.data ?? [];
      const other = others[0];
      if (!other) {
        if (!offered) {
          offered = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await postSignal({ room: opts.room, peer: opts.peerId, offer });
        }
        return;
      }
      if (other.offer && pc.signalingState === "stable" && answeredFor !== JSON.stringify(other.offer)) {
        if (opts.peerId < other.id && offered) return;
        answeredFor = JSON.stringify(other.offer);
        await pc.setRemoteDescription(other.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal({ room: opts.room, peer: opts.peerId, answer });
      }
      if (other.answer && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(other.answer);
      }
      for (const c of other.ice ?? []) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* poll retry */
    }
  }, 1000);

  return () => {
    window.clearInterval(timer);
    pc.close();
  };
}

import { apiJson, apiUrl, getToken } from "@/lib/apiBase";

export type MeetJoin = {
  provider: "daily" | "livekit" | "agora" | "zegocloud" | "mesh";
  room: string;
  url?: string;
  token?: string;
  appId?: string;
  uid?: number;
  userId?: string;
  meetingId: string;
  share_token: string;
  meshFallback?: boolean;
  note?: string;
  provider_id?: string;
};

export type ChatLine = {
  id: string;
  at: string;
  from: string;
  text: string;
  file?: { name: string; url: string; mime?: string } | null;
};

export async function meetJoin(token: string, identity: string, skip: string[] = []) {
  return apiJson<{ data: MeetJoin }>("/api/meet/join", {
    method: "POST",
    body: JSON.stringify({ token, identity, skip }),
  });
}

export async function meetFail(provider_id: string, error: string) {
  await apiJson("/api/meet/fail", { method: "POST", body: JSON.stringify({ provider_id, error }) });
}

export async function meetRoom(token: string) {
  return apiJson<{ data: Record<string, unknown>; chat: ChatLine[] }>(`/api/meet/room?token=${encodeURIComponent(token)}`);
}

export async function meetChat(token: string) {
  return apiJson<{ data: ChatLine[] }>(`/api/meet/chat?token=${encodeURIComponent(token)}`);
}

export async function sendMeetChat(token: string, from: string, text: string, file?: ChatLine["file"]) {
  return apiJson<{ data: ChatLine }>("/api/meet/chat", {
    method: "POST",
    body: JSON.stringify({ token, from, text, file }),
  });
}

export async function sendMeetFile(token: string, from: string, file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  return apiJson<{ data: { name: string; url: string; mime: string } }>("/api/meet/file", {
    method: "POST",
    body: JSON.stringify({ token, from, name: file.name, mime: file.type, data }),
  });
}

export async function hangupMeet(token: string) {
  await apiJson("/api/meet/hangup", { method: "POST", body: JSON.stringify({ token }) });
}

export async function saveMeetRecording(token: string, blob: Blob) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
  return apiJson<{ data: { url: string } }>("/api/meet/recording", {
    method: "POST",
    body: JSON.stringify({ token, data }),
  });
}

export async function postSignal(body: Record<string, unknown>) {
  await apiJson("/api/meet/signal", { method: "POST", body: JSON.stringify(body) });
}

export async function getSignal(room: string, peer: string) {
  return apiJson<{ data: { id: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit[] }[] }>(
    `/api/meet/signal?room=${encodeURIComponent(room)}&peer=${encodeURIComponent(peer)}`,
  );
}

export function recordingSrc(meetingId: string) {
  const token = getToken();
  const u = apiUrl(`/api/meet/recording/${meetingId}`);
  return token ? u : u;
}

export function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const found = [...document.getElementsByTagName("script")].some((s) => s.src === src);
    if (found) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
}

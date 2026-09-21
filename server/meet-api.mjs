import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { json, readBody } from "./http-util.mjs";
import { corsAndOptions, guardOrigin } from "./security.mjs";
import { requireApiUser } from "./auth-api.mjs";
import { loadCrmState, saveCrmState } from "./crm-api.mjs";
import { persistFiles } from "./persist.mjs";
import { agoraRtcToken, livekitJwt, zegoToken04 } from "./meet-tokens.mjs";

const signals = new Map();
const SKIP_MS = 10 * 60 * 1000;

function pathOf(req) {
  return (req.url || "/").split("?")[0];
}
function qs(req) {
  try {
    return new URL(req.url || "/", "http://local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}
function nowIso() {
  return new Date().toISOString();
}
function str(v) {
  return String(v ?? "").trim();
}
function recDir() {
  const file = persistFiles("meet-recordings/.keep")[0];
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function providersOf(state) {
  return state.records
    .filter((r) => r.module === "meeting_providers" && r.data?.active !== false)
    .sort((a, b) => Number(a.data?.priority || 99) - Number(b.data?.priority || 99));
}

function exhausted(row) {
  const limit = Number(row.data?.minutes_limit || 0);
  const used = Number(row.data?.minutes_used || 0);
  if (limit > 0 && used >= limit) return true;
  const fail = Date.parse(String(row.data?.last_fail_at || "")) || 0;
  if (fail && Date.now() - fail < SKIP_MS) return true;
  return false;
}

function meetingByToken(state, token) {
  return state.records.find((r) => r.module === "meetings" && str(r.data?.share_token) === token);
}

function patchMeeting(state, id, data) {
  const row = state.records.find((r) => r.id === id && r.module === "meetings");
  if (!row) return null;
  row.data = { ...row.data, ...data };
  row.updated_at = nowIso();
  saveCrmState(state);
  return row;
}

async function dailyRoom(key, name, record, domain) {
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      privacy: "public",
      properties: {
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
        enable_chat: false,
        start_video_off: false,
        start_audio_off: false,
        ...(record ? { enable_recording: "cloud" } : {}),
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 && String(body?.info || body?.error || "").toLowerCase().includes("already")) {
      return { url: domain ? `${String(domain).replace(/\/$/, "")}/${name}` : "", name };
    }
    throw new Error(body?.error || body?.info || `Daily ${res.status}`);
  }
  return { url: body.url, name: body.name || name };
}

async function joinProvider(row, room, identity, record) {
  const kind = str(row.data?.provider).toLowerCase();
  const appId = str(row.data?.app_id);
  const secret = str(row.data?.app_secret || row.data?.app_certificate || row.data?.api_secret);
  const key = str(row.data?.api_key || row.data?.app_key);
  const extra = str(row.data?.server_url);
  if (kind === "daily") {
    const made = await dailyRoom(key || secret, room, record, extra);
    if (!made.url) throw new Error("Daily room URL missing");
    return { provider: "daily", room, url: made.url, token: key || secret };
  }
  if (kind === "livekit") {
    if (!key || !secret || !extra) throw new Error("LiveKit needs api key, secret, and WebSocket URL");
    return { provider: "livekit", room, url: extra, token: livekitJwt(key, secret, identity, room), appId: key };
  }
  if (kind === "agora") {
    if (!appId || !secret) throw new Error("Agora needs app id and certificate");
    const uid = Math.floor(Math.random() * 1000000) + 1;
    return { provider: "agora", room, appId, uid, token: agoraRtcToken(appId, secret, room, uid) };
  }
  if (kind === "zegocloud" || kind === "zego") {
    if (!appId || !secret) throw new Error("ZEGOCLOUD needs app id and server secret");
    return { provider: "zegocloud", room, appId, token: zegoToken04(appId, secret, identity), userId: identity };
  }
  throw new Error("Unknown provider");
}

function publicMeeting(row) {
  const d = row.data || {};
  return {
    id: row.id,
    title: d.title || "Meeting",
    status: d.status || "scheduled",
    scheduled_at: d.scheduled_at || "",
    recording_enabled: d.recording_enabled !== false,
    auto_record: d.auto_record !== false,
    share_token: d.share_token,
    kind: d.kind || "meeting",
    duration_sec: Number(d.duration_sec || 0),
  };
}

export async function handleMeetRequest(req, res, env = process.env) {
  if (corsAndOptions(req, res, env)) return true;
  if (!guardOrigin(req, res, env)) return true;
  const path = pathOf(req);
  const q = qs(req);

  try {
    if (req.method === "GET" && path.startsWith("/api/meet/recording/")) {
      const id = path.slice("/api/meet/recording/".length);
      const file = join(recDir(), `${id}.webm`);
      if (!existsSync(file)) {
        json(res, 404, { error: "Recording not found" });
        return true;
      }
      const buf = readFileSync(file);
      res.statusCode = 200;
      res.setHeader("Content-Type", "video/webm");
      res.setHeader("Content-Disposition", `inline; filename="${id}.webm"`);
      res.end(buf);
      return true;
    }

    if (req.method === "GET" && path.startsWith("/api/meet/file/")) {
      const name = decodeURIComponent(path.slice("/api/meet/file/".length));
      const file = join(recDir(), "files", name);
      if (!existsSync(file) || !file.startsWith(join(recDir(), "files"))) {
        json(res, 404, { error: "File not found" });
        return true;
      }
      const buf = readFileSync(file);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${name.split("-").slice(1).join("-") || name}"`);
      res.end(buf);
      return true;
    }

    if (req.method === "GET" && path === "/api/meet/room") {
      const token = str(q.get("token"));
      const state = loadCrmState();
      const row = meetingByToken(state, token);
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      json(res, 200, { data: publicMeeting(row), chat: Array.isArray(row.data?.chat) ? row.data.chat : [] });
      return true;
    }

    if (req.method === "GET" && path === "/api/meet/chat") {
      const token = str(q.get("token"));
      const state = loadCrmState();
      const row = meetingByToken(state, token);
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      json(res, 200, { data: Array.isArray(row.data?.chat) ? row.data.chat : [] });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/chat") {
      const input = JSON.parse((await readBody(req, 2 * 1024 * 1024)) || "{}");
      const token = str(input.token);
      const state = loadCrmState();
      const row = meetingByToken(state, token);
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      const chat = Array.isArray(row.data.chat) ? row.data.chat : [];
      const line = {
        id: randomUUID(),
        at: nowIso(),
        from: str(input.from || "Guest").slice(0, 80),
        text: str(input.text).slice(0, 4000),
        file: input.file && typeof input.file === "object" ? input.file : null,
      };
      chat.push(line);
      patchMeeting(state, row.id, { chat });
      json(res, 200, { data: line });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/file") {
      const raw = await readBody(req, 8 * 1024 * 1024);
      if (raw == null) {
        json(res, 413, { error: "File too large (8MB)" });
        return true;
      }
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return true;
      }
      const token = str(input.token);
      const state = loadCrmState();
      const row = meetingByToken(state, token);
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      const name = str(input.name || "file").replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const data = str(input.data);
      if (!data.startsWith("data:")) {
        json(res, 400, { error: "Expected data URL" });
        return true;
      }
      const id = randomUUID();
      const disk = `${id}-${name}`;
      const dir = join(recDir(), "files");
      mkdirSync(dir, { recursive: true });
      const b64 = data.split(",")[1] || "";
      writeFileSync(join(dir, disk), Buffer.from(b64, "base64"));
      const file = { name, mime: str(input.mime || "application/octet-stream"), url: `/api/meet/file/${encodeURIComponent(disk)}` };
      const files = Array.isArray(row.data.files) ? row.data.files : [];
      files.push({ ...file, id, at: nowIso(), from: str(input.from || "Guest") });
      const chat = Array.isArray(row.data.chat) ? row.data.chat : [];
      chat.push({ id, at: nowIso(), from: str(input.from || "Guest"), text: `Shared ${name}`, file });
      patchMeeting(state, row.id, { files, chat });
      json(res, 200, { data: file });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/signal") {
      const input = JSON.parse((await readBody(req, 512 * 1024)) || "{}");
      const room = str(input.room);
      const peer = str(input.peer);
      if (!room || !peer) {
        json(res, 400, { error: "room and peer required" });
        return true;
      }
      const key = room;
      const bucket = signals.get(key) || { peers: {} };
      if (!bucket.peers[peer]) bucket.peers[peer] = { offer: null, answer: null, ice: [] };
      const slot = bucket.peers[peer];
      if (input.offer) slot.offer = input.offer;
      if (input.answer) slot.answer = input.answer;
      if (input.ice) slot.ice.push(input.ice);
      bucket.peers[peer] = slot;
      signals.set(key, bucket);
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && path === "/api/meet/signal") {
      const room = str(q.get("room"));
      const peer = str(q.get("peer"));
      const bucket = signals.get(room) || { peers: {} };
      const others = Object.entries(bucket.peers)
        .filter(([id]) => id !== peer)
        .map(([id, v]) => ({ id, ...v }));
      json(res, 200, { data: others });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/join") {
      const input = JSON.parse((await readBody(req, 64 * 1024)) || "{}");
      const token = str(input.token);
      const state = loadCrmState();
      const row = meetingByToken(state, token);
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      const identity = str(input.identity || "guest").slice(0, 60) || "guest";
      const room = str(row.data.room_name) || `socilet-${row.id.slice(0, 8)}`;
      const record = row.data.recording_enabled !== false;
      const skip = new Set(Array.isArray(input.skip) ? input.skip.map(String) : []);
      const list = providersOf(state).filter((p) => !skip.has(p.id) && !exhausted(p));
      let lastErr = "";
      for (const p of list) {
        try {
          const creds = await joinProvider(p, room, identity, record);
          patchMeeting(state, row.id, {
            provider: creds.provider,
            provider_id: p.id,
            room_name: room,
            status: row.data.status === "ended" ? "live" : row.data.status || "live",
            started_at: row.data.started_at || nowIso(),
          });
          json(res, 200, { data: { ...creds, meetingId: row.id, share_token: token, provider_id: p.id, meshFallback: false } });
          return true;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          p.data = { ...p.data, last_error: lastErr, last_fail_at: nowIso() };
          saveCrmState(state);
        }
      }
      patchMeeting(state, row.id, { provider: "mesh", room_name: room, started_at: row.data.started_at || nowIso(), status: "live" });
      json(res, 200, {
        data: {
          provider: "mesh",
          room,
          meetingId: row.id,
          share_token: token,
          meshFallback: true,
          note: lastErr ? `APIs unavailable (${lastErr}). Using built-in 1-to-1.` : "Using built-in 1-to-1.",
        },
      });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/fail") {
      const input = JSON.parse((await readBody(req, 32 * 1024)) || "{}");
      const state = loadCrmState();
      const row = state.records.find((r) => r.id === str(input.provider_id) && r.module === "meeting_providers");
      if (row) {
        row.data = { ...row.data, last_error: str(input.error).slice(0, 240), last_fail_at: nowIso() };
        saveCrmState(state);
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/hangup") {
      const input = JSON.parse((await readBody(req, 32 * 1024)) || "{}");
      const state = loadCrmState();
      const row = meetingByToken(state, str(input.token));
      if (row) {
        const start = Date.parse(String(row.data.started_at || "")) || Date.now();
        const duration = Math.max(0, Math.round((Date.now() - start) / 1000));
        patchMeeting(state, row.id, { status: "ended", ended_at: nowIso(), duration_sec: duration });
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && path === "/api/meet/recording") {
      const user = await requireApiUser(req, res, env);
      if (!user) return true;
      const raw = await readBody(req, 40 * 1024 * 1024);
      if (raw == null) {
        json(res, 413, { error: "Recording too large" });
        return true;
      }
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return true;
      }
      const state = loadCrmState();
      const row = meetingByToken(state, str(input.token));
      if (!row) {
        json(res, 404, { error: "Meeting not found" });
        return true;
      }
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin CRM save only. Download locally instead." });
        return true;
      }
      const data = str(input.data);
      if (!data.startsWith("data:")) {
        json(res, 400, { error: "Expected data URL" });
        return true;
      }
      writeFileSync(join(recDir(), `${row.id}.webm`), Buffer.from(data.split(",")[1] || "", "base64"));
      patchMeeting(state, row.id, { recording_url: `/api/meet/recording/${row.id}`, recording_saved_at: nowIso() });
      json(res, 200, { data: { url: `/api/meet/recording/${row.id}` } });
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Meet request failed" });
    return true;
  }
}

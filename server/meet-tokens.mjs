import { createCipheriv, createHmac, createHash, randomBytes } from "node:crypto";

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function livekitJwt(apiKey, apiSecret, identity, room, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: apiKey,
      sub: identity,
      name: identity,
      nbf: now - 10,
      exp: now + ttl,
      video: {
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    }),
  );
  const sig = b64url(createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(str) {
  let c = 0xffffffff;
  const buf = Buffer.from(String(str), "utf8");
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function packStr(s) {
  const buf = Buffer.from(String(s), "utf8");
  return Buffer.concat([u16(buf.length), buf]);
}
function packMap(map) {
  const keys = Object.keys(map).map(Number);
  let out = u16(keys.length);
  for (const k of keys) out = Buffer.concat([out, u16(k), u32(map[k])]);
  return out;
}

/** Agora RTC token 006 */
export function agoraRtcToken(appId, appCertificate, channel, uid = 0, ttl = 3600) {
  const ts = Math.floor(Date.now() / 1000) + ttl;
  const salt = Math.floor(Math.random() * 0xffffffff);
  const uidStr = String(uid || 0);
  const msg = Buffer.concat([
    packStr(appId),
    u32(Math.floor(Date.now() / 1000)),
    u32(salt),
    packStr(channel),
    packStr(uidStr),
    packMap({ 1: ts, 2: ts, 3: ts, 4: ts }),
  ]);
  const sig = createHmac("sha256", appCertificate).update(msg).digest();
  const content = Buffer.concat([u16(sig.length), sig, u32(crc32(channel)), u32(crc32(uidStr)), u32(msg.length), msg]);
  return `006${appId}${content.toString("base64")}`;
}

/** ZEGOCLOUD token04 (AES-128-CBC + HMAC). */
export function zegoToken04(appId, serverSecret, userId, ttl = 3600) {
  const nonce = randomBytes(8).toString("hex");
  const ctime = Math.floor(Date.now() / 1000);
  const expire = ctime + ttl;
  const body = JSON.stringify({
    app_id: Number(appId),
    user_id: String(userId),
    nonce,
    ctime,
    expire,
    payload: "",
  });
  const key = Buffer.from(String(serverSecret).slice(0, 16).padEnd(16, "0"));
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, enc]);
  const hash = createHash("sha256").update(packed).digest();
  return `04${Buffer.concat([hash.subarray(0, 8), packed]).toString("base64")}`;
}

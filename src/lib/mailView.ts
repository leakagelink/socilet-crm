export type MailStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "scheduled"
  | "canceled";

export type MailAttachment = {
  id: string;
  filename: string;
  content_type: string;
  content_disposition?: string;
  content_id?: string;
  size?: number;
};

export type MailListItem = {
  id: string;
  from?: string;
  to?: string[] | string;
  cc?: string[] | string;
  subject?: string;
  created_at?: string;
  last_event?: string;
  status?: string;
  attachment_count?: number;
  snippet?: string;
  local?: boolean;
  error?: string;
};

export type MailDetail = MailListItem & {
  html?: string;
  text?: string;
  bcc?: string[] | string;
  reply_to?: string[] | string;
  attachments?: MailAttachment[];
};

const FAIL = new Set(["failed", "bounced", "complained", "canceled"]);
const OK = new Set(["delivered", "opened", "clicked", "sent"]);

export function mailStatusKey(row: { last_event?: string; status?: string } | null | undefined): MailStatus {
  const raw = String(row?.last_event || row?.status || "").toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "queued";
  if (raw === "inbound" || raw === "received") return "received";
  if (FAIL.has(raw) || raw.includes("fail") || raw.includes("bounce")) return raw === "bounced" ? "bounced" : raw === "complained" ? "complained" : "failed";
  if (OK.has(raw) || raw === "queued" || raw === "scheduled" || raw === "delivery_delayed") return raw as MailStatus;
  return "queued";
}

export function mailStatusLabel(row: { last_event?: string; status?: string } | null | undefined) {
  const k = mailStatusKey(row);
  return (
    {
      received: "Received",
      queued: "Queued",
      sent: "Sent",
      delivered: "Delivered",
      opened: "Opened",
      clicked: "Clicked",
      delivery_delayed: "Delayed",
      bounced: "Bounced",
      complained: "Spam complaint",
      failed: "Failed",
      scheduled: "Scheduled",
      canceled: "Canceled",
    }[k] || k
  );
}

export function mailStatusTone(row: { last_event?: string; status?: string } | null | undefined) {
  const k = mailStatusKey(row);
  if (k === "failed" || k === "bounced" || k === "complained" || k === "canceled") return "bg-red-600/15 text-red-700 border-red-500/30";
  if (k === "delivery_delayed") return "bg-amber-500/15 text-amber-800 border-amber-500/30";
  if (k === "delivered" || k === "opened" || k === "clicked") return "bg-emerald-600/15 text-emerald-800 border-emerald-500/30";
  if (k === "received") return "bg-sky-600/15 text-sky-800 border-sky-500/30";
  return "bg-gold/15 text-gold border-gold/30";
}

export function isMailFailed(row: { last_event?: string; status?: string } | null | undefined) {
  const k = mailStatusKey(row);
  return k === "failed" || k === "bounced" || k === "complained" || k === "canceled";
}

export function addrLine(v: string[] | string | undefined) {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return String(v || "").trim();
}

export function sanitizeMailHtml(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "data:text/plain");
}

export function textToMailHtml(text: string) {
  const esc = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;word-break:break-word">${esc.replace(/\n/g, "<br/>")}</div>`;
}

export function rewriteCid(html: string, cidToUrl: Record<string, string>) {
  return html.replace(/(?:cid:)([^"'\s>]+)/gi, (full, raw) => {
    const key = String(raw || "")
      .replace(/^<|>$/g, "")
      .trim()
      .toLowerCase();
    return cidToUrl[key] || full;
  });
}

export function isImageMime(mime: string, name = "") {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

export function formatBytes(n?: number) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 102.4) / 10} KB`;
  return `${Math.round(v / 104857.6) / 10} MB`;
}

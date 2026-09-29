import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailFile } from "@/lib/emailClient";
import {
  addrLine,
  formatBytes,
  isImageMime,
  mailStatusLabel,
  mailStatusTone,
  rewriteCid,
  sanitizeMailHtml,
  textToMailHtml,
  type MailAttachment,
  type MailDetail,
} from "@/lib/mailView";
import { cn } from "@/lib/utils";

function cidKey(att: MailAttachment) {
  return String(att.content_id || "")
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

export function StatusChip({ row }: { row: { last_event?: string; status?: string } }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", mailStatusTone(row))}>
      {mailStatusLabel(row)}
    </span>
  );
}

export function MailBody({
  mail,
  mailboxId,
  folder,
}: {
  mail: MailDetail;
  mailboxId: string;
  folder: "inbox" | "sent";
}) {
  const atts = mail.attachments || [];
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    async function load() {
      const next: Record<string, string> = {};
      for (const att of atts) {
        try {
          const file = await emailFile(
            `/api/email/attachments/${folder === "inbox" ? "receiving" : "sent"}/${encodeURIComponent(mail.id)}/${encodeURIComponent(att.id)}?mailbox=${encodeURIComponent(mailboxId)}`,
          );
          if (!live) {
            URL.revokeObjectURL(file.url);
            continue;
          }
          made.push(file.url);
          next[att.id] = file.url;
        } catch {
          /* skip one file */
        }
      }
      if (live) setUrls(next);
    }
    if (atts.length) void load();
    else setUrls({});
    return () => {
      live = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [mail.id, mailboxId, folder, atts.map((a) => a.id).join(",")]);

  const html = useMemo(() => {
    const cid: Record<string, string> = {};
    for (const att of atts) {
      const url = urls[att.id];
      const key = cidKey(att);
      if (url && key) cid[key] = url;
    }
    const raw = mail.html?.trim() ? mail.html : textToMailHtml(mail.text || "");
    return rewriteCid(sanitizeMailHtml(raw), cid);
  }, [mail.html, mail.text, urls, atts]);

  const srcdoc = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    html,body{margin:0;padding:12px;background:#fff;color:#1a1a1a;font:16px/1.55 Georgia,ui-serif,serif;word-break:break-word}
    img{max-width:100%;height:auto}
    a{color:#8a6a12}
    table{max-width:100%}
  </style></head><body>${html || "<p style='color:#888'>No body.</p>"}</body></html>`;

  const files = atts.filter((a) => String(a.content_disposition || "attachment") !== "inline" || !isImageMime(a.content_type, a.filename));
  const inlineImgs = atts.filter((a) => isImageMime(a.content_type, a.filename));

  return (
    <article className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug sm:text-xl">{mail.subject || "(no subject)"}</h2>
        <StatusChip row={mail} />
      </div>
      <div className="grid gap-1 break-all text-xs text-paper/55">
        <div>
          <span className="text-paper/35">From </span>
          {mail.from || "—"}
        </div>
        <div>
          <span className="text-paper/35">To </span>
          {addrLine(mail.to) || "—"}
        </div>
        {addrLine(mail.cc) ? (
          <div>
            <span className="text-paper/35">Cc </span>
            {addrLine(mail.cc)}
          </div>
        ) : null}
        {mail.created_at ? <div className="text-paper/40">{new Date(mail.created_at).toLocaleString("en-IN")}</div> : null}
        {mail.error ? <p className="text-sm text-red-600">{mail.error}</p> : null}
      </div>

      <iframe
        title="Email body"
        sandbox="allow-same-origin allow-popups"
        srcDoc={srcdoc}
        className="min-h-[min(52vh,28rem)] w-full rounded-xl border border-line bg-white"
      />

      {inlineImgs.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {inlineImgs.map((att) =>
            urls[att.id] ? (
              <a key={att.id} href={urls[att.id]} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-line bg-white">
                <img src={urls[att.id]} alt={att.filename} className="h-36 w-full object-cover" />
              </a>
            ) : (
              <div key={att.id} className="grid h-36 place-items-center rounded-xl border border-dashed border-line text-xs text-paper/40">
                <ImageIcon className="h-5 w-5" />
              </div>
            ),
          )}
        </div>
      ) : null}

      {atts.length ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-gold/80">
            <Paperclip className="h-3.5 w-3.5" />
            Attachments ({atts.length})
          </div>
          {files.map((att) => (
            <div key={att.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-gold/20 bg-panel px-3 py-2">
              {isImageMime(att.content_type, att.filename) ? <ImageIcon className="h-4 w-4 shrink-0 text-gold" /> : <FileText className="h-4 w-4 shrink-0 text-gold" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{att.filename || "file"}</div>
                <div className="text-[11px] text-paper/45">
                  {att.content_type || "file"} {formatBytes(att.size) ? `· ${formatBytes(att.size)}` : ""}
                </div>
              </div>
              {urls[att.id] ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={urls[att.id]} download={att.filename}>
                    <Download className="h-3.5 w-3.5" />
                    Save
                  </a>
                </Button>
              ) : (
                <span className="text-[11px] text-paper/40">Loading…</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

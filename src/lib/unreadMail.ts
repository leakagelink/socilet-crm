import { apiFetch } from "@/lib/apiBase";

const SEEN_KEY = "socilet.mail.seen";

function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function saveSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-4000)));
  } catch {
    /* ignore */
  }
}

export function mailIsUnseen(id: string) {
  return !loadSeen().has(id);
}

export function markMailSeen(id: string) {
  const seen = loadSeen();
  seen.add(id);
  saveSeen(seen);
}

export async function countUnseenMail() {
  try {
    const boxesRes = await apiFetch("/api/email/mailboxes");
    const type = boxesRes.headers.get("content-type") || "";
    if (!type.includes("json") || !boxesRes.ok) return 0;
    const boxes = (await boxesRes.json()) as { data?: { id: string }[] };
    const seen = loadSeen();
    let n = 0;
    for (const box of boxes.data ?? []) {
      const inboxRes = await apiFetch(`/api/email/inbox?mailbox=${encodeURIComponent(box.id)}`);
      if (!inboxRes.ok) continue;
      const inbox = (await inboxRes.json()) as { data?: { id?: string }[] };
      for (const mail of inbox.data ?? []) {
        if (mail.id && !seen.has(mail.id)) n += 1;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

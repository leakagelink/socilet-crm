import { db, type MailAccount } from "@/lib/db";
import { apiJson } from "@/lib/apiBase";
import { nowIso } from "@/lib/utils";

type PublicMailbox = { id: string; from?: string };

export async function rememberMailbox(row: Omit<MailAccount, "saved_at">) {
  await db.mail_accounts.put({ ...row, saved_at: nowIso() });
}

export async function forgetMailbox(id: string) {
  await db.mail_accounts.delete(id);
}

/** After a Hostinger deploy the server file is empty; put remembered boxes back with the same ids. */
export async function restoreMailboxesToServer() {
  const local = await db.mail_accounts.toArray();
  if (!local.length) return 0;
  let remote: PublicMailbox[] = [];
  try {
    const res = await apiJson<{ data?: PublicMailbox[] }>("/api/email/mailboxes");
    remote = res.data ?? [];
  } catch {
    return 0;
  }
  const haveId = new Set(remote.map((m) => m.id));
  const haveFrom = new Set(remote.map((m) => String(m.from || "").toLowerCase()));
  let restored = 0;
  for (const row of local) {
    if (!row.apiKey?.startsWith("re_")) continue;
    if (haveId.has(row.id)) continue;
    if (haveFrom.has(row.from.toLowerCase())) continue;
    try {
      await apiJson("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          label: row.label,
          from: row.from,
          apiKey: row.apiKey,
        }),
      });
      haveId.add(row.id);
      haveFrom.add(row.from.toLowerCase());
      restored += 1;
    } catch {
      /* key revoked or API down — keep local copy for the next boot */
    }
  }
  return restored;
}

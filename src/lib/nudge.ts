import { apiJson } from "@/lib/apiBase";
import type { FollowItem } from "@/lib/followups";

const AUTO_KEY = "socilet.autoNudge";

export function autoNudgeOn() {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    if (v == null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setAutoNudge(on: boolean) {
  localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  void apiJson("/api/crm/payment-nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: on }),
  }).catch(() => undefined);
}

export function alreadyNudgedToday(_id: string) {
  return false;
}

export async function sendOverdueNudges(_items?: FollowItem[], force = false) {
  const data = await apiJson<{
    data: { sent?: number; skipped?: string; errors?: string[]; pending?: number };
  }>("/api/crm/payment-nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  const r = data.data || {};
  return {
    sent: r.sent || 0,
    skipped: r.skipped ? 1 : 0,
    errors: r.errors || [],
  };
}

export async function pingPaymentNudges() {
  try {
    await apiJson("/api/crm/payment-nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    /* mailbox or auth optional on first paint */
  }
}

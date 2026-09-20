import { apiJson } from "@/lib/apiBase";
import type { FollowItem } from "@/lib/followups";

const DAY_KEY = "socilet.nudge.day";
const IDS_KEY = "socilet.nudge.ids";
const AUTO_KEY = "socilet.autoNudge";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readIds(): string[] {
  try {
    if (localStorage.getItem(DAY_KEY) !== today()) return [];
    return JSON.parse(localStorage.getItem(IDS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  localStorage.setItem(DAY_KEY, today());
  localStorage.setItem(IDS_KEY, JSON.stringify([...new Set(ids)].slice(-400)));
}

export function autoNudgeOn() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoNudge(on: boolean) {
  localStorage.setItem(AUTO_KEY, on ? "1" : "0");
}

export function alreadyNudgedToday(id: string) {
  return readIds().includes(id);
}

export async function sendOverdueNudges(items: FollowItem[]) {
  const due = items.filter((i) => i.tone === "overdue" && i.email && i.email.includes("@") && !alreadyNudgedToday(i.id));
  const sent: string[] = [];
  const errors: string[] = [];
  for (const item of due) {
    try {
      await apiJson("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: item.email,
          subject: `Payment follow-up: ${item.title}`,
          text: `${item.detail}\n\nPlease share an update when you can.\n\n— Socilet`,
        }),
      });
      sent.push(item.id);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "send failed");
    }
  }
  writeIds([...readIds(), ...sent]);
  return { sent: sent.length, skipped: items.filter((i) => i.tone === "overdue").length - due.length, errors };
}

import { sha256 } from "@/lib/utils";
import type { RecordRow } from "@/lib/db";

const HASH_KEY = "socilet.taskLock.hash";
const ON_KEY = "socilet.taskLock.on";
const UNLOCK_KEY = "socilet.taskLock.unlocked";
const EVENT = "socilet-task-lock";

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTaskLock(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function taskLockConfigured() {
  return Boolean(localStorage.getItem(HASH_KEY));
}

export function taskLockEnabled() {
  return localStorage.getItem(ON_KEY) === "1" && taskLockConfigured();
}

export function tasksUnlocked() {
  if (!taskLockEnabled()) return true;
  return sessionStorage.getItem(UNLOCK_KEY) === "1";
}

export function tasksAreLocked() {
  return taskLockEnabled() && !tasksUnlocked();
}

export function lockTasksNow() {
  sessionStorage.removeItem(UNLOCK_KEY);
  emit();
}

export function unlockTasksSession() {
  sessionStorage.setItem(UNLOCK_KEY, "1");
  emit();
}

async function pinHash(pin: string) {
  return sha256(`socilet-task-pin:${pin.trim()}`);
}

export function validTaskPin(pin: string) {
  return /^\d{4,8}$/.test(pin.trim());
}

export async function setupTaskLock(pin: string) {
  if (!validTaskPin(pin)) throw new Error("PIN must be 4–8 digits.");
  localStorage.setItem(HASH_KEY, await pinHash(pin));
  localStorage.setItem(ON_KEY, "1");
  sessionStorage.setItem(UNLOCK_KEY, "1");
  emit();
}

export async function changeTaskPin(current: string, next: string) {
  if (!(await verifyTaskPin(current))) throw new Error("Current PIN is wrong.");
  if (!validTaskPin(next)) throw new Error("New PIN must be 4–8 digits.");
  localStorage.setItem(HASH_KEY, await pinHash(next));
  emit();
}

export function disableTaskLock(pin: string) {
  return verifyTaskPin(pin).then((ok) => {
    if (!ok) throw new Error("PIN is wrong.");
    localStorage.removeItem(ON_KEY);
    sessionStorage.removeItem(UNLOCK_KEY);
    emit();
  });
}

export function enableTaskLock() {
  if (!taskLockConfigured()) throw new Error("Set a PIN first.");
  localStorage.setItem(ON_KEY, "1");
  sessionStorage.removeItem(UNLOCK_KEY);
  emit();
}

export async function verifyTaskPin(pin: string) {
  const stored = localStorage.getItem(HASH_KEY);
  if (!stored) return false;
  return (await pinHash(pin)) === stored;
}

export async function tryUnlockTasks(pin: string) {
  if (!(await verifyTaskPin(pin))) return false;
  unlockTasksSession();
  return true;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function taskDueAt(data: Record<string, unknown>) {
  const day = str(data.due_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const timeRaw = str(data.due_time);
  const hm = /^\d{1,2}:\d{2}/.test(timeRaw) ? timeRaw.slice(0, 5).padStart(5, "0") : "23:59";
  const d = new Date(`${day}T${hm}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTaskWhen(data: Record<string, unknown>) {
  const due = taskDueAt(data);
  if (!due) return { date: "No date", time: "—" };
  return {
    date: due.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    time: due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

export function isOpenTask(row: RecordRow) {
  return str(row.data.status).toLowerCase() !== "done";
}

export function isUrgentTask(row: RecordRow) {
  if (!isOpenTask(row)) return false;
  if (str(row.data.priority).toLowerCase() === "urgent") return true;
  const due = taskDueAt(row.data);
  return Boolean(due && due.getTime() < Date.now());
}

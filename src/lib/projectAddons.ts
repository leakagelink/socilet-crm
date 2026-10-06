import type { RecordRow } from "@/lib/db";

function str(v: unknown) {
  return String(v ?? "").trim();
}

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function addonMatchesProject(addon: RecordRow, project: RecordRow) {
  const pid = str(addon.data.project_id);
  if (pid && pid === project.id) return true;
  const name = str(addon.data.project_name).toLowerCase();
  return Boolean(name && name === str(project.data.name).toLowerCase());
}

export function addonsForProject(addons: RecordRow[], project: RecordRow) {
  return addons
    .filter((a) => addonMatchesProject(a, project))
    .sort((a, b) => `${str(b.data.date)} ${str(b.data.time)}`.localeCompare(`${str(a.data.date)} ${str(a.data.time)}`));
}

export function addonPendingAmount(row: RecordRow) {
  const st = str(row.data.status).toLowerCase();
  const amount = money(row.data.amount);
  if (st === "paid") return 0;
  if (st === "partial") return Math.max(0, amount - money(row.data.paid_amount));
  return amount;
}

export function addonWhen(row: RecordRow) {
  const d = str(row.data.date);
  const t = str(row.data.time);
  if (d && t) return `${d} · ${t}`;
  return d || t || str(row.created_at).slice(0, 10);
}

export function nowAddonStamp() {
  const n = new Date();
  const date = n.toISOString().slice(0, 10);
  const time = n.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time };
}

export function addonSeedFromProject(project: RecordRow) {
  const stamp = nowAddonStamp();
  return {
    project_id: project.id,
    project_name: str(project.data.name),
    client: str(project.data.client),
    client_id: str(project.data.client_id),
    client_email: str(project.data.client_email),
    client_phone: str(project.data.client_phone),
    date: stamp.date,
    time: stamp.time,
    status: "unpaid",
    amount: 0,
  };
}

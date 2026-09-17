import Dexie, { type EntityTable } from "dexie";
import { apiJson, getToken } from "@/lib/apiBase";
import { nowIso, uid } from "@/lib/utils";

export type RoleName = "admin" | "user";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  created_at: string;
};

export type UserRole = {
  id: string;
  user_id: string;
  role: RoleName;
};

export type SettingsRow = {
  id: string;
  base_balance: number;
  updated_at: string;
};

export type RecordRow = {
  id: string;
  module: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MailAccount = {
  id: string;
  label: string;
  from: string;
  apiKey: string;
  saved_at: string;
};

export class SociletDB extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  user_roles!: EntityTable<UserRole, "id">;
  settings!: EntityTable<SettingsRow, "id">;
  records!: EntityTable<RecordRow, "id">;
  mail_accounts!: EntityTable<MailAccount, "id">;

  constructor() {
    super("socilet-crm-idb");
    this.version(1).stores({
      profiles: "id, &email",
      user_roles: "id, user_id, role",
      settings: "id",
      records: "id, module, created_at",
    });
    this.version(2).stores({
      mail_accounts: "id, from",
    });
  }
}

export const db = new SociletDB();

let cloud: "unknown" | "yes" | "no" = "unknown";
let cloudChecked = 0;

export async function cloudLive() {
  if (!getToken()) return false;
  if (cloud === "yes") return true;
  if (cloud === "no" && Date.now() - cloudChecked < 20_000) return false;
  try {
    const data = await apiJson<{ ok?: boolean }>("/api/crm/health");
    cloud = data.ok ? "yes" : "no";
  } catch {
    cloud = "no";
  }
  cloudChecked = Date.now();
  return cloud === "yes";
}

const EMPTY_START = "empty-start-2026-09-17";

async function wipeToEmptyOnce() {
  const marker = await db.settings.get("wipe");
  if (marker?.updated_at === EMPTY_START) return;
  await db.records.clear();
  await db.settings.put({ id: "finance", base_balance: 0, updated_at: nowIso() });
  await db.settings.put({ id: "wipe", base_balance: 0, updated_at: EMPTY_START });
}

export async function ensureSeed() {
  await wipeToEmptyOnce();
  const settings = await db.settings.get("finance");
  if (!settings) {
    await db.settings.put({ id: "finance", base_balance: 0, updated_at: nowIso() });
  }
  await hydrateCloud();
  await importLegacyOnce();
  await hydrateCloud();
}

async function hydrateCloud() {
  try {
    if (!(await cloudLive())) return;
    const local = await db.records.toArray();
    if (local.length) {
      await apiJson("/api/crm/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: local }),
      });
    }
    const remote = await apiJson<{ data: RecordRow[] }>("/api/crm/records");
    await db.records.clear();
    if (remote.data?.length) await db.records.bulkPut(remote.data);
    try {
      const fin = await apiJson<{ data: SettingsRow }>("/api/crm/settings/finance");
      if (fin.data) await db.settings.put(fin.data);
    } catch {
      /* keep local finance */
    }
  } catch {
    cloud = "no";
  }
}

const LEGACY_MARK = "socilet-admin-export-v1";

async function importLegacyOnce() {
  const marker = await db.settings.get("legacy-import");
  if (marker?.updated_at === LEGACY_MARK) return;
  let payload: { finance?: SettingsRow | null; records?: RecordRow[] };
  try {
    const res = await fetch("/legacy-import.json");
    if (!res.ok) return;
    payload = (await res.json()) as { finance?: SettingsRow | null; records?: RecordRow[] };
  } catch {
    return;
  }
  const rows = payload.records ?? [];
  if (rows.length && (await cloudLive())) {
    try {
      await apiJson("/api/crm/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: rows, finance: payload.finance }),
      });
      if (payload.finance) {
        await apiJson("/api/crm/settings/finance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_balance: payload.finance.base_balance }),
        });
      }
    } catch {
      /* local import still applies */
    }
  }
  if (rows.length) await db.records.bulkPut(rows);
  if (payload.finance) await db.settings.put({ ...payload.finance, id: "finance" });
  await db.settings.put({
    id: "legacy-import",
    base_balance: payload.finance?.base_balance ?? 0,
    updated_at: LEGACY_MARK,
  });
}

export async function listRecords(module: string) {
  if (await cloudLive()) {
    const res = await apiJson<{ data: RecordRow[] }>(`/api/crm/records?module=${encodeURIComponent(module)}`);
    return [...(res.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return db.records.where("module").equals(module).reverse().sortBy("created_at");
}

export async function getRecord(id: string) {
  if (await cloudLive()) {
    const res = await apiJson<{ data: RecordRow[] }>("/api/crm/records");
    return (res.data ?? []).find((r) => r.id === id);
  }
  return db.records.get(id);
}

export async function insertRecord(module: string, data: Record<string, unknown>) {
  const t = nowIso();
  const row: RecordRow = { id: uid(), module, data, created_at: t, updated_at: t };
  if (await cloudLive()) {
    const res = await apiJson<{ data: RecordRow }>("/api/crm/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const saved = res.data ?? row;
    await db.records.put(saved);
    return saved;
  }
  await db.records.add(row);
  return row;
}

export async function updateRecord(id: string, data: Record<string, unknown>) {
  if (await cloudLive()) {
    const res = await apiJson<{ data: RecordRow }>(`/api/crm/records/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.data) throw new Error("Not found");
    await db.records.put(res.data);
    return res.data;
  }
  const existing = await db.records.get(id);
  if (!existing) throw new Error("Not found");
  const next = { ...existing, data, updated_at: nowIso() };
  await db.records.put(next);
  return next;
}

export async function mergeRecords(rows: RecordRow[]) {
  if (!rows.length) return;
  if (await cloudLive()) {
    await apiJson("/api/crm/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: rows }),
    });
  }
  await db.records.bulkPut(rows);
}

export async function listAllRecords() {
  if (await cloudLive()) {
    const res = await apiJson<{ data: RecordRow[] }>("/api/crm/records");
    return res.data ?? [];
  }
  return db.records.toArray();
}

export async function deleteRecord(id: string) {
  if (await cloudLive()) {
    await apiJson(`/api/crm/records/${id}`, { method: "DELETE" });
  }
  await db.records.delete(id);
}

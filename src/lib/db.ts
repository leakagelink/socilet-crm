import Dexie, { type EntityTable } from "dexie";
import { hashPassword, nowIso, uid } from "@/lib/utils";

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

export class SociletDB extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  user_roles!: EntityTable<UserRole, "id">;
  settings!: EntityTable<SettingsRow, "id">;
  records!: EntityTable<RecordRow, "id">;

  constructor() {
    super("socilet-crm-idb");
    this.version(1).stores({
      profiles: "id, &email",
      user_roles: "id, user_id, role",
      settings: "id",
      records: "id, module, created_at",
    });
  }
}

export const db = new SociletDB();

const SEED = [
  {
    email: "admin@socilet.local",
    password: "Admin@Socilet1!",
    full_name: "Socilet Admin",
    role: "admin" as const,
  },
  {
    email: "user@socilet.local",
    password: "UserPass1234!",
    full_name: "Socilet User",
    role: "user" as const,
  },
];

async function seedDemoRecords() {
  const n = await db.records.count();
  if (n > 0) return;
  const rows: RecordRow[] = [
    rec("projects", { name: "Brand site", client: "Northwind", status: "active", budget: 180000, start_date: "2026-08-01", notes: "Homepage + CRM" }),
    rec("tasks", { title: "Wire dashboard", status: "in_progress", priority: "high", assignee: "Admin", due_date: "2026-09-20" }),
    rec("tasks", { title: "Invoice PDF", status: "todo", priority: "medium", assignee: "Admin", due_date: "2026-09-22" }),
    rec("tasks", { title: "Kanban polish", status: "review", priority: "low", assignee: "Admin", due_date: "2026-09-18" }),
    rec("tasks", { title: "Seed finance", status: "done", priority: "high", assignee: "Admin", due_date: "2026-09-10" }),
    rec("quotations", { quote_no: "Q-1042", client: "Northwind", amount: 95000, status: "sent", valid_until: "2026-10-01" }),
    rec("invoices", { invoice_no: "INV-2201", client: "Northwind", amount: 72000, status: "paid", due_date: "2026-09-05" }),
    rec("invoices", { invoice_no: "INV-2202", client: "Blue Oak", amount: 41000, status: "due", due_date: "2026-09-30" }),
    rec("digital_products", { name: "Pitch kit", sku: "DP-01", price: 2499, stock: 120, status: "live" }),
    rec("recurring_earnings", { name: "Retainer", amount: 35000, cadence: "monthly", next_date: "2026-10-01", active: true }),
    rec("other_income", { source: "Workshop", amount: 18000, date: "2026-09-02", notes: "Half-day" }),
    rec("cosmofeed", { product: "Mini course", amount: 8900, date: "2026-09-08", status: "settled", link: "https://cosmofeed.com" }),
    rec("spends", { category: "Tools", vendor: "Figma", amount: 2400, date: "2026-09-01", method: "UPI", notes: "" }),
    rec("spends", { category: "Ads", vendor: "Meta", amount: 12000, date: "2026-09-12", method: "Card", notes: "" }),
    rec("investments", { name: "Liquid fund", type: "mutual_fund", amount: 50000, current_value: 51200, date: "2026-07-01" }),
    rec("payment_methods", { name: "HDFC Current", type: "bank", last4: "4412", provider: "HDFC", active: true }),
    rec("emails", { to_addr: "northwind@example.com", subject: "Quote Q-1042", body: "Please find the quote attached.", status: "sent", sent_at: "2026-09-04T10:00:00.000Z" }),
    rec("notifications", { title: "Invoice paid", message: "INV-2201 marked paid", level: "success", read: false }),
    rec("reminders", { title: "Follow up Blue Oak", due_at: "2026-09-21T09:00:00.000Z", status: "open", notes: "Call after 11" }),
    rec("service_credentials", { service: "Hostinger FTP", username: "deploy", secret_ref: "GitHub secret FTP_PASSWORD", notes: "Never store live passwords here" }),
    rec("blocked_messages", { sender: "spam@list.invalid", channel: "email", reason: "phishing", blocked_at: "2026-09-03T08:00:00.000Z" }),
    rec("ai_analyzer", { title: "Q3 spend mix", source: "spends", prompt: "Where is cash leaking?", result: "Ads 83% of sampled spends this month.", score: 78 }),
    rec("analytics", { period: "2026-09", metric: "gross_in", value: 98900, notes: "Invoices paid + Cosmofeed + other" }),
  ];
  await db.records.bulkAdd(rows);
}

function rec(module: string, data: Record<string, unknown>): RecordRow {
  const t = nowIso();
  return { id: uid(), module, data, created_at: t, updated_at: t };
}

export async function ensureSeed() {
  for (const s of SEED) {
    const existing = await db.profiles.where("email").equals(s.email).first();
    const password_hash = await hashPassword(s.email, s.password);
    if (existing) {
      await db.profiles.update(existing.id, { password_hash, full_name: s.full_name });
      const roleRow = await db.user_roles.where("user_id").equals(existing.id).first();
      if (!roleRow) await db.user_roles.add({ id: uid(), user_id: existing.id, role: s.role });
      else await db.user_roles.update(roleRow.id, { role: s.role });
    } else {
      const id = uid();
      await db.profiles.add({
        id,
        email: s.email,
        full_name: s.full_name,
        password_hash,
        created_at: nowIso(),
      });
      await db.user_roles.add({ id: uid(), user_id: id, role: s.role });
    }
  }
  const settings = await db.settings.get("finance");
  if (!settings) {
    await db.settings.put({ id: "finance", base_balance: 250000, updated_at: nowIso() });
  }
  await seedDemoRecords();
}

export async function listRecords(module: string) {
  return db.records.where("module").equals(module).reverse().sortBy("created_at");
}

export async function getRecord(id: string) {
  return db.records.get(id);
}

export async function insertRecord(module: string, data: Record<string, unknown>) {
  const t = nowIso();
  const row: RecordRow = { id: uid(), module, data, created_at: t, updated_at: t };
  await db.records.add(row);
  return row;
}

export async function updateRecord(id: string, data: Record<string, unknown>) {
  const existing = await db.records.get(id);
  if (!existing) throw new Error("Not found");
  const next = { ...existing, data, updated_at: nowIso() };
  await db.records.put(next);
  return next;
}

export async function deleteRecord(id: string) {
  await db.records.delete(id);
}

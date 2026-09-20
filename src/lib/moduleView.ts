import type { ModuleDef } from "@/lib/modules";
import type { RecordRow } from "@/lib/db";
import { DATE_FIELDS } from "@/lib/highlights";

export function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const TITLE_KEYS = [
  "name",
  "title",
  "product",
  "client",
  "quote_no",
  "invoice_no",
  "source",
  "note",
  "service",
  "subject",
  "sender",
  "code",
  "room_name",
];

export function rowTitle(row: RecordRow, module: ModuleDef) {
  for (const key of TITLE_KEYS) {
    const v = String(row.data[key] ?? "").trim();
    if (v) return v;
  }
  const firstText = module.fields.find((f) => f.kind === "text" || f.kind === "textarea");
  const v = firstText ? String(row.data[firstText.name] ?? "").trim() : "";
  return v || module.title;
}

export function rowSubtitle(row: RecordRow) {
  const bits = [row.data.client, row.data.company, row.data.category, row.data.project_name, row.data.platform, row.data.type, row.data.assignee]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  return [...new Set(bits)].slice(0, 2).join(" · ");
}

export function rowMoney(row: RecordRow, moduleId: string) {
  if (moduleId === "investments") {
    const current = money(row.data.current_value);
    const principal = money(row.data.amount);
    return { label: "Current", value: current || principal };
  }
  if (moduleId === "projects") return { label: "Total", value: money(row.data.total_amount) };
  if (moduleId === "digital_products") return { label: "Sale", value: money(row.data.resell_price) || money(row.data.amount) };
  if (moduleId === "invoices" || moduleId === "quotations") return { label: "Amount", value: money(row.data.amount) };
  for (const key of ["amount", "total_amount", "price", "gst_amount"]) {
    if (row.data[key] != null && money(row.data[key])) return { label: "Amount", value: money(row.data[key]) };
  }
  return null;
}

export function chipFields(module: ModuleDef) {
  const skip = new Set(["name", "title", "notes", "message", "description", "file_url", "client_id", "project_id"]);
  return module.fields.filter((f) => {
    if (skip.has(f.name)) return false;
    if (f.name === "status") return false;
    return f.kind === "date" || DATE_FIELDS.has(f.name) || ["client", "category", "payment_method", "priority", "type", "platform", "project_name"].includes(f.name);
  }).slice(0, 5);
}

export type InsightTile = { label: string; hint: string; value: number; tone: string };

const TONES = [
  "from-violet-600/90 to-fuchsia-600/70",
  "from-teal-500/90 to-cyan-600/70",
  "from-indigo-600/90 to-sky-600/70",
  "from-rose-500/90 to-orange-500/70",
];

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export function insightTiles(module: ModuleDef, rows: RecordRow[]): InsightTile[] {
  const id = module.id;
  const n = rows.length;
  if (id === "investments") {
    const principal = rows.reduce((a, r) => a + money(r.data.amount), 0);
    const current = rows.reduce((a, r) => a + (money(r.data.current_value) || money(r.data.amount)), 0);
    const pl = rows.reduce((a, r) => a + (money(r.data.profit_loss) || money(r.data.current_value) - money(r.data.amount)), 0);
    const active = rows.filter((r) => String(r.data.status || "active") !== "closed").length;
    return [
      { label: "Portfolio", hint: "Current value", value: current, tone: TONES[2] },
      { label: "Principal", hint: "Amount parked", value: principal, tone: TONES[0] },
      { label: "P/L", hint: "Profit or loss", value: pl, tone: pl >= 0 ? TONES[1] : TONES[3] },
      { label: "Active", hint: "Open holdings", value: active, tone: TONES[0] },
    ];
  }
  if (id === "spends") {
    const total = rows.reduce((a, r) => a + money(r.data.amount), 0);
    const month = rows.filter((r) => String(r.data.date || "").startsWith(monthNow())).reduce((a, r) => a + money(r.data.amount), 0);
    return [
      { label: "Total spends", hint: "All expenses", value: total, tone: TONES[3] },
      { label: "This month", hint: monthNow(), value: month, tone: TONES[0] },
      { label: "Entries", hint: "Spend rows", value: n, tone: TONES[1] },
    ];
  }
  if (id === "projects") {
    const total = rows.reduce((a, r) => a + money(r.data.total_amount), 0);
    const received = rows.reduce((a, r) => a + money(r.data.advance_amount), 0);
    const pending = rows.reduce((a, r) => {
      const st = String(r.data.status || "").toLowerCase();
      if (st === "completed" || st === "done") return a;
      return a + money(r.data.remaining_amount);
    }, 0);
    const running = rows.filter((r) => ["running", "active"].includes(String(r.data.status || "").toLowerCase())).length;
    return [
      { label: "Project value", hint: "All totals", value: total, tone: TONES[0] },
      { label: "Received", hint: "Payments in", value: received, tone: TONES[1] },
      { label: "Pending", hint: "Yet to collect", value: pending, tone: TONES[3] },
      { label: "Running", hint: "Live jobs", value: running, tone: TONES[2] },
    ];
  }
  if (id === "digital_products") {
    const sales = rows.reduce((a, r) => a + (money(r.data.resell_price) || money(r.data.amount)), 0);
    const profit = rows.reduce((a, r) => a + (money(r.data.profit) || Math.max(0, money(r.data.resell_price) - money(r.data.amount))), 0);
    return [
      { label: "Digital sales", hint: "Sold value", value: sales, tone: TONES[0] },
      { label: "Profit", hint: "Net", value: profit, tone: TONES[1] },
      { label: "Products", hint: "Rows", value: n, tone: TONES[2] },
    ];
  }
  if (id === "other_income") {
    const got = rows.reduce((a, r) => a + (money(r.data.paid_amount) || money(r.data.amount)), 0);
    return [
      { label: "Other income", hint: "Received", value: got, tone: TONES[0] },
      { label: "Entries", hint: "Rows", value: n, tone: TONES[1] },
    ];
  }
  if (id === "recurring_earnings") {
    const monthly = rows.filter((r) => r.data.active !== false).reduce((a, r) => a + money(r.data.amount), 0);
    return [
      { label: "Monthly", hint: "Active recurring", value: monthly, tone: TONES[1] },
      { label: "Plans", hint: "Rows", value: n, tone: TONES[2] },
    ];
  }
  const amountField = module.fields.find((f) => f.kind === "number" && /amount|price|total|value/.test(f.name));
  const sum = amountField ? rows.reduce((a, r) => a + money(r.data[amountField.name]), 0) : 0;
  const tiles: InsightTile[] = [{ label: "Records", hint: module.title, value: n, tone: TONES[0] }];
  if (amountField) tiles.push({ label: amountField.label, hint: "Sum", value: sum, tone: TONES[1] });
  return tiles;
}

export function moduleKicker(id: string) {
  if (["projects", "tasks", "clients", "follow_ups", "quotations", "project_addons", "workspaces", "meetings"].includes(id)) return "Work";
  if (["spends", "investments", "other_income", "digital_products", "recurring_earnings", "cosmofeed", "invoices", "gst", "balance_tracker"].includes(id)) {
    return "Finance";
  }
  return "Ops";
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = "C:/Users/Dell/Downloads/socilet-admin-export.json";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "legacy-import.json");

function n(v) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function s(v) {
  return v == null ? "" : String(v);
}
function d(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}
function pay(v) {
  const p = s(v).trim();
  if (!p || /^\d{4}-/.test(p)) return "UPI";
  const u = p.toLowerCase();
  if (u === "upi") return "UPI";
  if (u.includes("card") || u.includes("credit")) return "Card";
  if (u.includes("bank")) return "Bank";
  if (u === "other") return "Other";
  return "Other";
}
function freq(v) {
  const f = s(v).toLowerCase();
  if (f === "weekly" || f === "monthly" || f === "yearly") return f;
  return "monthly";
}
function rec(mod, id, data, created, updated) {
  return {
    id,
    module: mod,
    data,
    created_at: created || new Date().toISOString(),
    updated_at: updated || created || new Date().toISOString(),
  };
}

const j = JSON.parse(readFileSync(src, "utf8"));
const records = [];
const projectsById = new Map((j.projects || []).map((p) => [p.id, p]));

for (const p of j.projects || []) {
  records.push(
    rec(
      "projects",
      p.id,
      {
        name: s(p.project_name) || "Project",
        client: s(p.client_name),
        client_email: s(p.client_email),
        client_phone: s(p.client_phone),
        status: s(p.project_status) || "completed",
        advance_amount: n(p.advance_amount),
        total_amount: n(p.total_amount),
        remaining_amount: n(p.remaining_amount),
        payment_method: pay(p.payment_method),
        start_date: d(p.start_date),
        end_date: d(p.end_date),
        deadline: d(p.deadline),
        file_url: s(p.project_file_url),
        notes: s(p.project_description),
      },
      p.created_at,
      p.updated_at,
    ),
  );
}

for (const a of j.project_addons || []) {
  const proj = projectsById.get(a.project_id);
  records.push(
    rec(
      "project_addons",
      a.id,
      {
        project_name: s(proj?.project_name) || a.project_id,
        project_id: s(a.project_id),
        description: s(a.description),
        amount: n(a.amount),
        status: s(a.status) || "paid",
      },
      a.created_at,
      a.updated_at,
    ),
  );
}

for (const p of j.digital_products || []) {
  const sale = n(p.resell_price);
  records.push(
    rec(
      "digital_products",
      p.id,
      {
        name: s(p.service_name),
        original_price: n(p.original_price),
        resell_price: sale,
        profit: n(p.profit),
        amount: sale,
        sale_date: d(p.sale_date),
        payment_method: pay(p.payment_method),
        customer_name: s(p.customer_name),
        customer_phone: s(p.customer_phone),
        customer_email: s(p.customer_email),
        notes: s(p.notes),
      },
      p.created_at,
      p.updated_at,
    ),
  );
}

for (const r of j.recurring_earnings || []) {
  records.push(
    rec(
      "recurring_earnings",
      r.id,
      {
        name: s(r.project_name) || s(r.client_name),
        client: s(r.client_name),
        client_email: s(r.client_email),
        client_phone: s(r.client_phone),
        amount: n(r.amount),
        cadence: freq(r.frequency),
        billing_date: n(r.billing_date) || 1,
        start_date: d(r.start_date),
        next_date: d(r.next_billing_date),
        payment_method: pay(r.payment_method),
        last_paid_date: d(r.last_paid_date),
        last_paid_amount: n(r.last_paid_amount),
        active: Boolean(r.is_active),
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.other_income || []) {
  records.push(
    rec(
      "other_income",
      r.id,
      {
        client: s(r.client_name),
        source: s(r.work_description) || "Other income",
        amount: n(r.amount),
        paid_amount: n(r.paid_amount) || (s(r.status) === "paid" ? n(r.amount) : 0),
        status: s(r.status) || "paid",
        date: d(r.payment_date),
        due_date: d(r.due_date),
        payment_method: pay(r.payment_method),
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.cosmofeed_sales || []) {
  const net = n(r.net_amount) || n(r.price);
  records.push(
    rec(
      "cosmofeed",
      r.id,
      {
        product: s(r.product_title),
        amount: net,
        price: n(r.price),
        gst_amount: n(r.gst_amount),
        quantity: n(r.quantity) || 1,
        date: d(r.sale_date),
        payment_method: pay(r.payment_method),
        status: "settled",
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.cosmofeed_products || []) {
  records.push(
    rec(
      "cosmofeed_products",
      r.id,
      {
        product: s(r.product_title),
        price: n(r.price),
        gst_amount: n(r.gst_amount),
        active: r.is_active !== false,
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.spends || []) {
  const cat = s(r.category) || "other";
  records.push(
    rec(
      "spends",
      r.id,
      {
        title: s(r.title),
        category: cat,
        ad_for: s(r.ad_for) || s(r.ad_spend_for) || s(r.product_title),
        amount: n(r.amount),
        date: d(r.spend_date),
        payment_method: pay(r.payment_method),
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.investments || []) {
  const type = s(r.investment_type).toLowerCase() || "other";
  records.push(
    rec(
      "investments",
      r.id,
      {
        name: s(r.investment_name),
        platform: s(r.platform),
        type: ["crypto", "equity", "mutual_fund", "fd", "other"].includes(type) ? type : "other",
        amount: n(r.invested_amount),
        current_value: n(r.current_value),
        profit_loss: n(r.profit_loss),
        date: d(r.investment_date),
        status: s(r.status) || "active",
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.reminders || []) {
  records.push(
    rec(
      "reminders",
      r.id,
      {
        title: s(r.title),
        due_at: d(r.reminder_date),
        due_time: s(r.reminder_time),
        priority: s(r.priority) || "medium",
        status: s(r.status) || "pending",
        category: s(r.category),
        client: s(r.related_client_name),
        recurring: Boolean(r.is_recurring),
        cadence: s(r.recurring_frequency) || "none",
        notes: s(r.description || r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.service_credentials || []) {
  records.push(
    rec(
      "service_credentials",
      r.id,
      {
        service: s(r.service_name),
        company: s(r.company_name),
        username: s(r.email),
        secret_ref: "imported-from-old-crm",
        auto_login: Boolean(r.is_auto_login),
        notes: s(r.notes),
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.contact_messages || []) {
  records.push(
    rec(
      "contact_messages",
      r.id,
      {
        sender: s(r.sender_name),
        email: s(r.sender_email),
        phone: s(r.sender_phone),
        subject: s(r.subject),
        message: s(r.message),
        read: Boolean(r.is_read),
        replied: Boolean(r.is_replied),
      },
      r.created_at,
      r.created_at,
    ),
  );
}

for (const r of j.project_workspaces || []) {
  records.push(
    rec(
      "project_workspaces",
      r.id,
      {
        code: s(r.project_code),
        title: s(r.title),
        description: s(r.description),
        created_by: s(r.created_by),
        active: r.is_active !== false,
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

for (const r of j.meetings || []) {
  records.push(
    rec(
      "meetings",
      r.id,
      {
        title: s(r.title),
        room_name: s(r.room_name),
        room_url: s(r.room_url),
        description: s(r.description),
        created_by: s(r.created_by),
        active: r.is_active !== false,
      },
      r.created_at,
      r.updated_at,
    ),
  );
}

const finance = j.bank_balance_settings?.[0];
const payload = {
  finance: finance
    ? { id: "finance", base_balance: n(finance.base_balance), updated_at: finance.last_updated_at || new Date().toISOString() }
    : null,
  records,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload));
console.log("wrote", out, "records", records.length, "base", payload.finance?.base_balance);

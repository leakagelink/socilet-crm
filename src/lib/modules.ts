import { z } from "zod";

export type FieldKind = "text" | "number" | "date" | "textarea" | "select" | "checkbox";

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  optional?: boolean;
};

export type ModuleDef = {
  id: string;
  title: string;
  path: string;
  description: string;
  fields: FieldDef[];
  schema: ReturnType<typeof z.object>;
  kanban?: boolean;
};

const str = (min = 1) => z.string().trim().min(min, "Required");

function objectFrom(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    if (f.kind === "number") shape[f.name] = z.coerce.number().finite();
    else if (f.kind === "checkbox") shape[f.name] = z.coerce.boolean();
    else if (f.kind === "select" && f.options?.length) shape[f.name] = z.enum(f.options as [string, ...string[]]);
    else if (f.optional) shape[f.name] = z.string().trim();
    else shape[f.name] = str();
  }
  const schema = z.object(shape);
  if (fields.some((f) => f.name === "start_date") && fields.some((f) => f.name === "end_date")) {
    return schema.refine(
      (v) => {
        const s = String((v as { start_date?: string }).start_date || "");
        const e = String((v as { end_date?: string }).end_date || "");
        return !s || !e || e >= s;
      },
      { message: "End cannot be before start", path: ["end_date"] },
    );
  }
  return schema;
}

function def(partial: Omit<ModuleDef, "schema">): ModuleDef {
  return { ...partial, schema: objectFrom(partial.fields) };
}

export const MODULES: ModuleDef[] = [
  def({
    id: "projects",
    title: "Projects",
    path: "/projects",
    description: "Client work and retainers",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "client", label: "Client", kind: "text" },
      { name: "status", label: "Status", kind: "select", options: ["planned", "active", "paused", "done"] },
      { name: "budget", label: "Budget (INR)", kind: "number" },
      { name: "start_date", label: "Start", kind: "date" },
      { name: "end_date", label: "End", kind: "date", optional: true },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
  def({
    id: "tasks",
    title: "Tasks",
    path: "/tasks",
    description: "Kanban board",
    kanban: true,
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "status", label: "Status", kind: "select", options: ["todo", "in_progress", "review", "done"] },
      { name: "priority", label: "Priority", kind: "select", options: ["low", "medium", "high"] },
      { name: "assignee", label: "Assignee", kind: "text" },
      { name: "due_date", label: "Due", kind: "date" },
    ],
  }),
  def({
    id: "quotations",
    title: "Quotations",
    path: "/quotations",
    description: "Proposals and quotes",
    fields: [
      { name: "quote_no", label: "Quote no", kind: "text" },
      { name: "client", label: "Client", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "sent", "accepted", "lost"] },
      { name: "valid_until", label: "Valid until", kind: "date" },
    ],
  }),
  def({
    id: "ai_analyzer",
    title: "AI Analyzer",
    path: "/ai-analyzer",
    description: "Saved analyses (runs locally, no API key)",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "source", label: "Source", kind: "text" },
      { name: "prompt", label: "Prompt", kind: "textarea" },
      { name: "result", label: "Result", kind: "textarea" },
      { name: "score", label: "Score", kind: "number" },
    ],
  }),
  def({
    id: "invoices",
    title: "Invoices",
    path: "/invoices",
    description: "Receivables",
    fields: [
      { name: "invoice_no", label: "Invoice no", kind: "text" },
      { name: "client", label: "Client", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "due", "paid", "void"] },
      { name: "due_date", label: "Due date", kind: "date" },
    ],
  }),
  def({
    id: "digital_products",
    title: "Digital Products",
    path: "/digital-products",
    description: "SKU catalog",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "sku", label: "SKU", kind: "text" },
      { name: "price", label: "Price (INR)", kind: "number" },
      { name: "stock", label: "Stock", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "live", "archived"] },
    ],
  }),
  def({
    id: "recurring_earnings",
    title: "Recurring Earnings",
    path: "/recurring-earnings",
    description: "Retainers and subscriptions",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "cadence", label: "Cadence", kind: "select", options: ["weekly", "monthly", "yearly"] },
      { name: "next_date", label: "Next date", kind: "date" },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "other_income",
    title: "Other Income",
    path: "/other-income",
    description: "One-off inflows",
    fields: [
      { name: "source", label: "Source", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
  def({
    id: "cosmofeed",
    title: "Cosmofeed",
    path: "/cosmofeed",
    description: "Storefront settlements",
    fields: [
      { name: "product", label: "Product", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
      { name: "status", label: "Status", kind: "select", options: ["pending", "settled", "failed"] },
      { name: "link", label: "Link", kind: "text" },
    ],
  }),
  def({
    id: "spends",
    title: "Spends",
    path: "/spends",
    description: "Outflows",
    fields: [
      { name: "category", label: "Category", kind: "text" },
      { name: "vendor", label: "Vendor", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
      { name: "method", label: "Method", kind: "text" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
  def({
    id: "investments",
    title: "Investments",
    path: "/investments",
    description: "Parked capital",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "type", label: "Type", kind: "select", options: ["equity", "mutual_fund", "fd", "other"] },
      { name: "amount", label: "Principal (INR)", kind: "number" },
      { name: "current_value", label: "Current (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
    ],
  }),
  def({
    id: "balance_tracker",
    title: "Balance Tracker",
    path: "/balance-tracker",
    description: "Base, income, spends, reverse desired cash",
    fields: [
      { name: "note", label: "Note", kind: "text" },
      { name: "amount", label: "Adjustment (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
    ],
  }),
  def({
    id: "payment_methods",
    title: "Payment Methods",
    path: "/payment-methods",
    description: "Banks and wallets",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "type", label: "Type", kind: "select", options: ["bank", "upi", "card", "wallet"] },
      { name: "last4", label: "Last 4", kind: "text" },
      { name: "provider", label: "Provider", kind: "text" },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "emails",
    title: "Email setup",
    path: "/emails",
    description: "Multiple Resend mailboxes — separate inbox/sent per domain",
    fields: [
      { name: "to_addr", label: "To", kind: "text" },
      { name: "subject", label: "Subject", kind: "text" },
      { name: "body", label: "Body", kind: "textarea" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "sent", "failed"] },
      { name: "sent_at", label: "Sent at", kind: "text" },
    ],
  }),
  def({
    id: "notifications",
    title: "Notifications",
    path: "/notifications",
    description: "Alerts from email, tasks, projects, reminders, and due invoices",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "message", label: "Message", kind: "textarea" },
      { name: "level", label: "Level", kind: "select", options: ["info", "success", "warning", "error"] },
      { name: "read", label: "Read", kind: "checkbox" },
    ],
  }),
  def({
    id: "reminders",
    title: "Reminders",
    path: "/reminders",
    description: "Follow-ups",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "due_at", label: "Due at", kind: "text" },
      { name: "status", label: "Status", kind: "select", options: ["open", "done", "skipped"] },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
  def({
    id: "service_credentials",
    title: "Service Credentials",
    path: "/service-credentials",
    description: "References only — no live secrets",
    fields: [
      { name: "service", label: "Service", kind: "text" },
      { name: "username", label: "Username", kind: "text" },
      { name: "secret_ref", label: "Secret ref", kind: "text" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
  def({
    id: "blocked_messages",
    title: "Blocked Messages",
    path: "/blocked-messages",
    description: "Quarantine",
    fields: [
      { name: "sender", label: "Sender", kind: "text" },
      { name: "channel", label: "Channel", kind: "select", options: ["email", "sms", "whatsapp", "other"] },
      { name: "reason", label: "Reason", kind: "text" },
      { name: "blocked_at", label: "Blocked at", kind: "text" },
    ],
  }),
  def({
    id: "analytics",
    title: "Analytics",
    path: "/analytics",
    description: "Saved metrics plus live finance mix",
    fields: [
      { name: "period", label: "Period", kind: "text" },
      { name: "metric", label: "Metric", kind: "text" },
      { name: "value", label: "Value", kind: "number" },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
  }),
];

export function moduleByPath(path: string) {
  return MODULES.find((m) => m.path === path);
}

export function moduleById(id: string) {
  return MODULES.find((m) => m.id === id);
}

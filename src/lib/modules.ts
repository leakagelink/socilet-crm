import { z } from "zod";

export type FieldKind = "text" | "number" | "date" | "textarea" | "select" | "checkbox" | "lookup";

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  optional?: boolean;
  lookupModule?: string;
  lookupLabel?: string;
  fillFrom?: Record<string, string>;
  showWhen?: { field: string; equals: string };
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
    else if (f.kind === "lookup" && f.optional) shape[f.name] = z.string().trim();
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
    id: "clients",
    title: "Clients",
    path: "/clients",
    description: "People and companies — projects, quotes, invoices, pending",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "company", label: "Company", kind: "text", optional: true },
      { name: "email", label: "Email", kind: "text", optional: true },
      { name: "phone", label: "Phone", kind: "text", optional: true },
      { name: "gstin", label: "GSTIN", kind: "text", optional: true },
      { name: "upi", label: "UPI id", kind: "text", optional: true },
      { name: "address", label: "Address", kind: "textarea", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "projects",
    title: "Projects",
    path: "/projects",
    description: "Client work — dated advances, partials, and final payments",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "client", label: "Client", kind: "text" },
      { name: "client_id", label: "Client id", kind: "text", optional: true },
      { name: "client_email", label: "Client email", kind: "text", optional: true },
      { name: "client_phone", label: "Client phone", kind: "text", optional: true },
      { name: "status", label: "Status", kind: "select", options: ["planned", "running", "active", "paused", "completed", "done"] },
      { name: "total_amount", label: "Total (INR)", kind: "number" },
      { name: "advance_amount", label: "Received (INR)", kind: "number" },
      { name: "remaining_amount", label: "Remaining (INR)", kind: "number" },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "start_date", label: "Start", kind: "date", optional: true },
      { name: "end_date", label: "End", kind: "date", optional: true },
      { name: "deadline", label: "Deadline", kind: "date", optional: true },
      { name: "file_url", label: "File URL", kind: "text", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
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
      { name: "due_date", label: "Due", kind: "date", optional: true },
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
      { name: "client_id", label: "Client id", kind: "text", optional: true },
      { name: "client_email", label: "Client email", kind: "text", optional: true },
      { name: "client_phone", label: "Client phone", kind: "text", optional: true },
      { name: "client_gstin", label: "Client GSTIN", kind: "text", optional: true },
      { name: "client_address", label: "Client address", kind: "textarea", optional: true },
      { name: "project_id", label: "Project id", kind: "text", optional: true },
      { name: "project_name", label: "Project", kind: "text", optional: true },
      { name: "item", label: "Line item", kind: "text", optional: true },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "gst_amount", label: "GST (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "sent", "accepted", "lost"] },
      { name: "valid_until", label: "Valid until", kind: "date", optional: true },
      { name: "payment_method", label: "Payment method", kind: "text", optional: true },
      { name: "payment_details", label: "Payment details", kind: "textarea", optional: true },
      { name: "template", label: "Template", kind: "text", optional: true },
      { name: "invoice_id", label: "Invoice id", kind: "text", optional: true },
      { name: "campaign_id", label: "Ads campaign id", kind: "text", optional: true },
      { name: "campaign_name", label: "Ads campaign", kind: "text", optional: true },
      { name: "share_token", label: "Share token", kind: "text", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "project_addons",
    title: "Project add-ons",
    path: "/project-addons",
    description: "Extra work billed on a project",
    fields: [
      { name: "project_name", label: "Project", kind: "text" },
      { name: "project_id", label: "Project id", kind: "text", optional: true },
      { name: "description", label: "Description", kind: "textarea" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["unpaid", "partial", "paid"] },
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
      { name: "client_id", label: "Client id", kind: "text", optional: true },
      { name: "client_email", label: "Client email", kind: "text", optional: true },
      { name: "client_phone", label: "Client phone", kind: "text", optional: true },
      { name: "client_gstin", label: "Client GSTIN", kind: "text", optional: true },
      { name: "client_address", label: "Client address", kind: "textarea", optional: true },
      { name: "project_id", label: "Project id", kind: "text", optional: true },
      { name: "project_name", label: "Project", kind: "text", optional: true },
      { name: "item", label: "Line item", kind: "text", optional: true },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "gst_amount", label: "GST (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["draft", "due", "paid", "void"] },
      { name: "due_date", label: "Due date", kind: "date" },
      { name: "paid_at", label: "Paid on", kind: "date", optional: true },
      { name: "payment_method", label: "Payment method", kind: "text", optional: true },
      { name: "payment_details", label: "Payment details", kind: "textarea", optional: true },
      { name: "template", label: "Template", kind: "text", optional: true },
      { name: "quote_id", label: "Quote id", kind: "text", optional: true },
      { name: "campaign_id", label: "Ads campaign id", kind: "text", optional: true },
      { name: "campaign_name", label: "Ads campaign", kind: "text", optional: true },
      { name: "share_token", label: "Share token", kind: "text", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "digital_products",
    title: "Digital Products",
    path: "/digital-products",
    description: "SKU catalog",
    fields: [
      { name: "name", label: "Service / product", kind: "text" },
      { name: "original_price", label: "Cost (INR)", kind: "number" },
      { name: "resell_price", label: "Sale (INR)", kind: "number" },
      { name: "profit", label: "Profit (INR)", kind: "number" },
      { name: "amount", label: "Income amount (INR)", kind: "number" },
      { name: "sale_date", label: "Sale date", kind: "date" },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "customer_name", label: "Customer", kind: "text", optional: true },
      { name: "customer_phone", label: "Phone", kind: "text", optional: true },
      { name: "customer_email", label: "Email", kind: "text", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "recurring_earnings",
    title: "Recurring Earnings",
    path: "/recurring-earnings",
    description: "Retainers and subscriptions",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "client", label: "Client", kind: "text", optional: true },
      { name: "client_email", label: "Client email", kind: "text", optional: true },
      { name: "client_phone", label: "Client phone", kind: "text", optional: true },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "cadence", label: "Cadence", kind: "select", options: ["weekly", "monthly", "yearly"] },
      { name: "billing_date", label: "Billing day", kind: "number" },
      { name: "start_date", label: "Start", kind: "date", optional: true },
      { name: "next_date", label: "Next billing", kind: "date" },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "last_paid_date", label: "Last paid", kind: "date", optional: true },
      { name: "last_paid_amount", label: "Last paid (INR)", kind: "number" },
      { name: "active", label: "Active", kind: "checkbox" },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "other_income",
    title: "Other Income",
    path: "/other-income",
    description: "One-off inflows",
    fields: [
      { name: "client", label: "Client", kind: "text", optional: true },
      { name: "source", label: "Work / source", kind: "text" },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "paid_amount", label: "Paid (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["unpaid", "partial", "paid"] },
      { name: "date", label: "Payment date", kind: "date", optional: true },
      { name: "due_date", label: "Due date", kind: "date", optional: true },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "cosmofeed",
    title: "Cosmofeed",
    path: "/cosmofeed",
    description: "Storefront settlements",
    fields: [
      {
        name: "product",
        label: "Product",
        kind: "lookup",
        lookupModule: "cosmofeed_products",
        lookupLabel: "product",
        fillFrom: { price: "price", gst_amount: "gst_amount" },
      },
      { name: "amount", label: "Net (INR)", kind: "number" },
      { name: "price", label: "Price (INR)", kind: "number" },
      { name: "gst_amount", label: "GST (INR)", kind: "number" },
      { name: "quantity", label: "Qty", kind: "number" },
      { name: "date", label: "Sale date", kind: "date" },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "status", label: "Status", kind: "select", options: ["pending", "settled", "failed"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "cosmofeed_products",
    title: "Cosmofeed products",
    path: "/cosmofeed-products",
    description: "Cosmofeed catalog",
    fields: [
      { name: "product", label: "Product", kind: "text" },
      { name: "price", label: "Price (INR)", kind: "number" },
      { name: "gst_amount", label: "GST (INR)", kind: "number" },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "spends",
    title: "Spends",
    path: "/spends",
    description: "Outflows",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "category", label: "Category", kind: "select", options: ["other", "tools", "food", "ad spend", "general", "software", "home", "domain", "petrol"] },
      {
        name: "ad_for",
        label: "Ad spend for",
        kind: "lookup",
        lookupModule: "cosmofeed_products",
        lookupLabel: "product",
        optional: true,
        showWhen: { field: "category", equals: "ad spend" },
      },
      {
        name: "project_name",
        label: "Project",
        kind: "lookup",
        lookupModule: "projects",
        lookupLabel: "name",
        optional: true,
        fillFrom: { project_id: "id" },
      },
      { name: "project_id", label: "Project id", kind: "text", optional: true },
      { name: "campaign_name", label: "Ads campaign", kind: "text", optional: true },
      { name: "amount", label: "Amount (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Other"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "lend_borrow",
    title: "Lend / Borrow",
    path: "/lend-borrow",
    description: "Kis ko kitna diya, kis se kitna liya, ROI, aur kab wapas",
    fields: [
      { name: "party", label: "Person / name", kind: "text" },
      { name: "phone", label: "Phone", kind: "text", optional: true },
      { name: "direction", label: "Type", kind: "select", options: ["lend", "borrow"] },
      { name: "amount", label: "Principal (INR)", kind: "number" },
      { name: "roi_percent", label: "ROI %", kind: "number" },
      { name: "expected_return", label: "Principal + ROI (INR)", kind: "number" },
      { name: "payout", label: "Kab milega / dena hai", kind: "select", options: ["monthly", "yearly", "one_time", "ongoing"] },
      { name: "installment_amount", label: "EMI / installment (INR)", kind: "number" },
      { name: "start_date", label: "Given / taken on", kind: "date" },
      { name: "due_date", label: "Wapas date", kind: "date", optional: true },
      { name: "received_amount", label: "Settled so far (INR)", kind: "number" },
      { name: "remaining_amount", label: "Remaining (INR)", kind: "number" },
      { name: "status", label: "Status", kind: "select", options: ["open", "receiving", "overdue", "settled"] },
      { name: "payment_method", label: "Payment method", kind: "select", options: ["UPI", "Card", "Bank", "Cash", "Other"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "investments",
    title: "Investments",
    path: "/investments",
    description: "Parked capital",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "platform", label: "Platform", kind: "text", optional: true },
      { name: "type", label: "Type", kind: "select", options: ["crypto", "equity", "mutual_fund", "fd", "other"] },
      { name: "amount", label: "Principal (INR)", kind: "number" },
      { name: "current_value", label: "Current (INR)", kind: "number" },
      { name: "profit_loss", label: "P/L (INR)", kind: "number" },
      { name: "date", label: "Date", kind: "date" },
      { name: "status", label: "Status", kind: "select", options: ["active", "closed"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "balance_tracker",
    title: "Balance Tracker",
    path: "/balance-tracker",
    description: "Filtered cash: projects, recurring, digital, other, cosmofeed, spends, transactions",
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
      { name: "name", label: "Label", kind: "text" },
      { name: "type", label: "Type", kind: "select", options: ["upi", "bank", "card", "wallet", "other"] },
      { name: "upi_id", label: "UPI id", kind: "text", optional: true },
      { name: "bank_name", label: "Bank", kind: "text", optional: true },
      { name: "account_name", label: "Account name", kind: "text", optional: true },
      { name: "account_number", label: "Account no", kind: "text", optional: true },
      { name: "ifsc", label: "IFSC", kind: "text", optional: true },
      { name: "provider", label: "Provider", kind: "text", optional: true },
      { name: "last4", label: "Last 4", kind: "text", optional: true },
      { name: "wallet_id", label: "Wallet id", kind: "text", optional: true },
      { name: "details", label: "Details", kind: "textarea", optional: true },
      { name: "is_default", label: "Default", kind: "checkbox" },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "emails",
    title: "Emails",
    path: "/emails",
    description: "Inbox and sent for connected mailboxes",
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
      { name: "due_at", label: "Due date", kind: "date" },
      { name: "due_time", label: "Due time", kind: "text", optional: true },
      { name: "priority", label: "Priority", kind: "select", options: ["low", "medium", "high", "urgent"] },
      { name: "status", label: "Status", kind: "select", options: ["pending", "open", "done", "skipped"] },
      { name: "category", label: "Category", kind: "text", optional: true },
      { name: "client", label: "Client", kind: "text", optional: true },
      { name: "recurring", label: "Recurring", kind: "checkbox" },
      { name: "cadence", label: "Repeat", kind: "select", options: ["none", "daily", "weekly", "monthly"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "service_credentials",
    title: "Service Credentials",
    path: "/service-credentials",
    description: "Locked box — password + 2FA to open",
    fields: [
      { name: "service", label: "Service", kind: "text" },
      { name: "company", label: "Company", kind: "text", optional: true },
      { name: "username", label: "Username / email", kind: "text", optional: true },
      { name: "secret_ref", label: "Secret ref", kind: "text", optional: true },
      { name: "auto_login", label: "Auto login", kind: "checkbox" },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "contact_messages",
    title: "Contact messages",
    path: "/contact-messages",
    description: "Inbound contact form",
    fields: [
      { name: "sender", label: "Sender", kind: "text" },
      { name: "email", label: "Email", kind: "text", optional: true },
      { name: "phone", label: "Phone", kind: "text", optional: true },
      { name: "subject", label: "Subject", kind: "text", optional: true },
      { name: "message", label: "Message", kind: "textarea" },
      { name: "read", label: "Read", kind: "checkbox" },
      { name: "replied", label: "Replied", kind: "checkbox" },
    ],
  }),
  def({
    id: "project_workspaces",
    title: "Workspaces",
    path: "/workspaces",
    description: "Client project rooms",
    fields: [
      { name: "code", label: "Code", kind: "text" },
      { name: "title", label: "Title", kind: "text" },
      { name: "description", label: "Description", kind: "textarea", optional: true },
      { name: "created_by", label: "Created by", kind: "text", optional: true },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "meetings",
    title: "Meetings",
    path: "/meetings",
    description: "Meeting rooms",
    fields: [
      { name: "title", label: "Title", kind: "text" },
      { name: "kind", label: "Kind", kind: "select", options: ["meeting", "call"] },
      { name: "direction", label: "Direction", kind: "select", options: ["outgoing", "incoming"] },
      { name: "client", label: "Client / person", kind: "text", optional: true },
      { name: "callee_email", label: "Callee email", kind: "text", optional: true },
      { name: "scheduled_at", label: "Schedule", kind: "date", optional: true },
      { name: "scheduled_time", label: "Time (HH:MM)", kind: "text", optional: true },
      { name: "status", label: "Status", kind: "select", options: ["scheduled", "ringing", "live", "ended"] },
      { name: "recording_enabled", label: "Recording allowed", kind: "checkbox" },
      { name: "auto_record", label: "Auto record (admin CRM)", kind: "checkbox" },
      { name: "share_token", label: "Share token", kind: "text", optional: true },
      { name: "room_name", label: "Room", kind: "text", optional: true },
      { name: "room_url", label: "URL", kind: "text", optional: true },
      { name: "provider", label: "Provider", kind: "text", optional: true },
      { name: "duration_sec", label: "Duration (sec)", kind: "number" },
      { name: "description", label: "Notes", kind: "textarea", optional: true },
      { name: "created_by", label: "Created by", kind: "text", optional: true },
      { name: "active", label: "Active", kind: "checkbox" },
    ],
  }),
  def({
    id: "meeting_providers",
    title: "Meeting APIs",
    path: "/meeting-providers",
    description: "Agora, Daily, ZEGOCLOUD, LiveKit — rotate when a quota fails",
    fields: [
      { name: "name", label: "Label", kind: "text" },
      { name: "provider", label: "Provider", kind: "select", options: ["daily", "livekit", "agora", "zegocloud"] },
      { name: "app_id", label: "App ID", kind: "text", optional: true },
      { name: "api_key", label: "API key", kind: "text", optional: true },
      { name: "app_secret", label: "Secret / certificate", kind: "text", optional: true },
      { name: "server_url", label: "Server / WS / Daily domain URL", kind: "text", optional: true },
      { name: "priority", label: "Priority (1 first)", kind: "number" },
      { name: "minutes_limit", label: "Minute cap (0 = none)", kind: "number" },
      { name: "minutes_used", label: "Minutes used", kind: "number" },
      { name: "active", label: "Active", kind: "checkbox" },
      { name: "last_error", label: "Last error", kind: "textarea", optional: true },
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
    id: "ad_accounts",
    title: "Ad accounts",
    path: "/ads",
    description: "Meta / Google ads accounts (keys on Ads → Accounts)",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "platform", label: "Platform", kind: "select", options: ["meta", "google", "other"] },
      { name: "account_id", label: "Account id", kind: "text", optional: true },
      { name: "status", label: "Status", kind: "select", options: ["live", "paused", "cooling"] },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "ad_campaigns",
    title: "Ad campaigns",
    path: "/ads-campaigns",
    description: "Spend, attributed revenue, ROAS",
    fields: [
      { name: "name", label: "Campaign", kind: "text" },
      { name: "platform", label: "Platform", kind: "select", options: ["meta", "google", "other"] },
      { name: "account", label: "Account name", kind: "text", optional: true },
      { name: "account_id", label: "Account record id", kind: "text", optional: true },
      { name: "objective", label: "Objective", kind: "select", options: ["leads", "sales", "traffic", "awareness"] },
      { name: "status", label: "Status", kind: "select", options: ["live", "paused", "ended"] },
      { name: "spend", label: "Spend (INR)", kind: "number" },
      { name: "revenue", label: "Attributed revenue (INR)", kind: "number" },
      { name: "leads_count", label: "Leads", kind: "number" },
      { name: "clicks", label: "Clicks", kind: "number" },
      { name: "impressions", label: "Impressions", kind: "number" },
      { name: "daily_budget", label: "Daily budget (INR)", kind: "number" },
      { name: "offer", label: "Offer / hook", kind: "text", optional: true },
      { name: "offer_amount", label: "Offer amount (INR)", kind: "number" },
      { name: "start_date", label: "Start", kind: "date", optional: true },
      { name: "end_date", label: "End", kind: "date", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "ad_leads",
    title: "Ad leads",
    path: "/ads-leads",
    description: "Leads from ads — convert to CRM clients",
    fields: [
      { name: "name", label: "Name", kind: "text" },
      { name: "phone", label: "Phone", kind: "text", optional: true },
      { name: "email", label: "Email", kind: "text", optional: true },
      { name: "source_account", label: "Ads account", kind: "text", optional: true },
      { name: "campaign", label: "Campaign", kind: "text", optional: true },
      { name: "campaign_id", label: "Campaign id", kind: "text", optional: true },
      { name: "status", label: "Status", kind: "select", options: ["new", "contacted", "converted", "junk"] },
      { name: "client", label: "Client", kind: "text", optional: true },
      { name: "client_id", label: "Client id", kind: "text", optional: true },
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
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
      { name: "notes", label: "Notes", kind: "textarea", optional: true },
    ],
  }),
  def({
    id: "activity",
    title: "Activity",
    path: "/activity",
    description: "Who changed what",
    fields: [
      { name: "actor", label: "Staff", kind: "text" },
      { name: "action", label: "Action", kind: "text" },
      { name: "target", label: "Module", kind: "text" },
      { name: "summary", label: "Summary", kind: "text" },
    ],
  }),
];

export function moduleByPath(path: string) {
  return MODULES.find((m) => m.path === path);
}

export function moduleById(id: string) {
  return MODULES.find((m) => m.id === id);
}

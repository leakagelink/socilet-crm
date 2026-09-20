import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { uid } from "@/lib/utils";

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const n = digits.length === 10 ? `91${digits}` : digits;
  if (n.length < 10) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export async function convertQuoteToInvoice(quote: RecordRow) {
  if (str(quote.data.invoice_id)) {
    const all = await listRecords("invoices");
    const existing = all.find((r) => r.id === str(quote.data.invoice_id));
    if (existing) return existing;
  }
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const token = uid();
  const invoice = await insertRecord("invoices", {
    invoice_no: `INV-${Date.now().toString(36).toUpperCase()}`,
    client: quote.data.client,
    client_id: quote.data.client_id,
    client_email: quote.data.client_email,
    client_phone: quote.data.client_phone,
    client_gstin: quote.data.client_gstin,
    client_address: quote.data.client_address,
    project_id: quote.data.project_id,
    project_name: quote.data.project_name,
    item: quote.data.item,
    amount: num(quote.data.amount),
    gst_amount: num(quote.data.gst_amount),
    status: "due",
    due_date: due.toISOString().slice(0, 10),
    quote_id: quote.id,
    payment_method: quote.data.payment_method,
    payment_details: quote.data.payment_details,
    template: quote.data.template,
    share_token: token,
    notes: `From quote ${str(quote.data.quote_no)}`,
  });
  await updateRecord(quote.id, {
    ...quote.data,
    status: "accepted",
    invoice_id: invoice.id,
    share_token: str(quote.data.share_token) || token,
  });
  return invoice;
}

export async function markInvoicePaid(invoice: RecordRow) {
  return updateRecord(invoice.id, {
    ...invoice.data,
    status: "paid",
    paid_at: new Date().toISOString().slice(0, 10),
  });
}

export async function ensureShareToken(row: RecordRow) {
  const token = str(row.data.share_token);
  if (token) return token;
  const next = uid();
  await updateRecord(row.id, { ...row.data, share_token: next });
  return next;
}

export function clientMatch(row: RecordRow, client: RecordRow) {
  const id = client.id;
  const name = str(client.data.name).toLowerCase();
  const email = str(client.data.email).toLowerCase();
  if (str(row.data.client_id) === id) return true;
  if (name && str(row.data.client).toLowerCase() === name) return true;
  if (email && str(row.data.client_email).toLowerCase() === email) return true;
  if (email && str(row.data.email).toLowerCase() === email) return true;
  return false;
}

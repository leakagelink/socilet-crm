import { insertRecord, listRecords, mergeRecords, updateRecord, type RecordRow } from "@/lib/db";
import { nowIso, uid } from "@/lib/utils";

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

function first(...vals: unknown[]) {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

function findClient(clients: RecordRow[], hint: { id?: string; name?: string; email?: string }) {
  const id = str(hint.id);
  const email = str(hint.email).toLowerCase();
  const name = str(hint.name).toLowerCase();
  if (id) {
    const byId = clients.find((c) => c.id === id);
    if (byId) return byId;
  }
  if (email) {
    const byEmail = clients.find((c) => str(c.data.email).toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (name) {
    const byName = clients.find((c) => str(c.data.name).toLowerCase() === name);
    if (byName) return byName;
  }
  return undefined;
}

function clientPayload(src: Record<string, unknown>) {
  return {
    name: first(src.client),
    company: first(src.company),
    email: first(src.client_email, src.email),
    phone: first(src.client_phone, src.phone),
    gstin: first(src.client_gstin, src.gstin),
    upi: first(src.upi),
    address: first(src.client_address, src.address),
    notes: "",
  };
}

/** Create or reuse a Clients row from a project/invoice name so the Clients list is complete. */
export async function ensureClientRecord(src: Record<string, unknown>) {
  const data = clientPayload(src);
  if (!data.name && !data.email) return undefined;
  const clients = await listRecords("clients");
  const existing = findClient(clients, { id: str(src.client_id), name: data.name, email: data.email });
  if (existing) {
    const next = {
      ...existing.data,
      name: first(existing.data.name, data.name),
      email: first(existing.data.email, data.email),
      phone: first(existing.data.phone, data.phone),
      gstin: first(existing.data.gstin, data.gstin),
      address: first(existing.data.address, data.address),
      company: first(existing.data.company, data.company),
    };
    const changed = JSON.stringify(next) !== JSON.stringify(existing.data);
    if (changed) {
      const row = { ...existing, data: next, updated_at: nowIso() };
      await mergeRecords([row]);
      return row;
    }
    return existing;
  }
  const t = nowIso();
  const row: RecordRow = {
    id: uid(),
    module: "clients",
    data,
    created_at: t,
    updated_at: t,
  };
  await mergeRecords([row]);
  return row;
}

/** Pull unique names from projects, invoices, quotes, retainers into Clients. */
export async function syncClientsFromWork() {
  const [clients, projects, invoices, quotes, recurring] = await Promise.all([
    listRecords("clients"),
    listRecords("projects"),
    listRecords("invoices"),
    listRecords("quotations"),
    listRecords("recurring_earnings"),
  ]);
  const all = [...clients];
  const toSave: RecordRow[] = [];
  const work = [...projects, ...invoices, ...quotes, ...recurring];

  for (const row of work) {
    const payload = clientPayload(row.data);
    if (!payload.name && !payload.email) continue;
    let client: RecordRow | undefined = findClient(all, { id: str(row.data.client_id), name: payload.name, email: payload.email });
    if (!client) {
      const t = row.created_at || nowIso();
      client = {
        id: uid(),
        module: "clients",
        data: payload,
        created_at: t,
        updated_at: t,
      };
      all.push(client);
      toSave.push(client);
    } else {
      const next = {
        ...client.data,
        name: first(client.data.name, payload.name),
        email: first(client.data.email, payload.email),
        phone: first(client.data.phone, payload.phone),
        gstin: first(client.data.gstin, payload.gstin),
        address: first(client.data.address, payload.address),
        company: first(client.data.company, payload.company),
      };
      if (JSON.stringify(next) !== JSON.stringify(client.data)) {
        const updated = { ...client, data: next, updated_at: nowIso() };
        const i = all.findIndex((c) => c.id === updated.id);
        if (i >= 0) all[i] = updated;
        toSave.push(updated);
        client = updated;
      }
    }
    if (str(row.data.client_id) !== client.id) {
      toSave.push({
        ...row,
        data: { ...row.data, client_id: client.id, client: first(row.data.client, client.data.name) },
        updated_at: nowIso(),
      });
    }
  }

  if (toSave.length) await mergeRecords(toSave);
  return { created: toSave.filter((r) => r.module === "clients").length, linked: toSave.length };
}

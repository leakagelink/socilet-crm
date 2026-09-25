import { uid } from "@/lib/utils";
import { apiJson } from "@/lib/apiBase";
import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";

export type AdsAccountKey = {
  id: string;
  label: string;
  platform: "meta" | "google" | "other" | string;
  account_id: string;
  has_key: boolean;
  key_hint: string;
  connected: boolean;
  last_error?: string | null;
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

export function campaignRoas(row: RecordRow) {
  const spend = num(row.data.spend);
  const revenue = num(row.data.revenue);
  return spend > 0 ? revenue / spend : 0;
}

export function adsSnapshot(accounts: RecordRow[], campaigns: RecordRow[], leads: RecordRow[]) {
  const spend = campaigns.reduce((s, r) => s + num(r.data.spend), 0);
  const revenue = campaigns.reduce((s, r) => s + num(r.data.revenue), 0);
  const ranked = [...campaigns].sort((a, b) => campaignRoas(b) - campaignRoas(a));
  const winning = ranked.find((r) => num(r.data.spend) > 0) || null;
  const openLeads = leads.filter((r) => !["converted", "junk"].includes(str(r.data.status)));
  return {
    accounts: accounts.length,
    spend,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    leads: leads.length,
    openLeads: openLeads.length,
    converted: leads.filter((r) => str(r.data.status) === "converted").length,
    winning,
    losing: ranked.filter((r) => num(r.data.spend) > 0 && campaignRoas(r) < 1).slice(0, 6),
    ranked,
  };
}

export async function listAdsKeys() {
  return apiJson<{ data: AdsAccountKey[] }>("/api/ads/accounts");
}

export async function saveAdsKey(body: {
  id?: string;
  label: string;
  platform: string;
  account_id?: string;
  token?: string;
}) {
  return apiJson<{ data: AdsAccountKey }>("/api/ads/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchAdsKey(id: string, body: Record<string, unknown>) {
  return apiJson<{ data: AdsAccountKey }>(`/api/ads/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAdsKey(id: string) {
  return apiJson<{ ok: boolean }>(`/api/ads/accounts/${id}`, { method: "DELETE" });
}

export async function testAdsKey(id: string) {
  return apiJson<{ data: AdsAccountKey }>(`/api/ads/accounts/${id}/test`, { method: "POST", body: "{}" });
}

export async function convertAdLead(lead: RecordRow) {
  const name = str(lead.data.name) || "Ads lead";
  const email = str(lead.data.email).toLowerCase();
  const phone = str(lead.data.phone);
  const clients = await listRecords("clients");
  let client =
    clients.find((c) => email && str(c.data.email).toLowerCase() === email) ||
    clients.find((c) => phone && str(c.data.phone).replace(/\D/g, "") === phone.replace(/\D/g, "") && phone.replace(/\D/g, "").length >= 10) ||
    clients.find((c) => str(c.data.name).toLowerCase() === name.toLowerCase()) ||
    null;
  if (!client) {
    client = await insertRecord("clients", {
      name,
      email: str(lead.data.email),
      phone,
      notes: `From ads · ${str(lead.data.campaign) || str(lead.data.source_account)}`,
    });
  }
  await updateRecord(lead.id, {
    ...lead.data,
    status: "converted",
    client: str(client.data.name) || name,
    client_id: client.id,
  });
  return client;
}

export async function quoteFromCampaign(campaign: RecordRow, client: RecordRow) {
  const amount = num(campaign.data.offer_amount);
  const quote = await insertRecord("quotations", {
    quote_no: `QTE-${Date.now().toString(36).toUpperCase()}`,
    client: str(client.data.name),
    client_id: client.id,
    client_email: str(client.data.email),
    client_phone: str(client.data.phone),
    client_gstin: str(client.data.gstin),
    client_address: str(client.data.address),
    item: str(campaign.data.offer) || str(campaign.data.name),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
    gst_amount: 0,
    status: "draft",
    campaign_id: campaign.id,
    campaign_name: str(campaign.data.name),
    notes: `Winning/selected ad: ${str(campaign.data.name)} · ${str(campaign.data.platform)}`,
    share_token: uid(),
  });
  return quote;
}

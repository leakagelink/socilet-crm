import { db, cloudLive } from "@/lib/db";
import { apiJson } from "@/lib/apiBase";

export type FirmProfile = {
  legal_name: string;
  gstin: string;
  upi_id: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
};

const EMPTY: FirmProfile = {
  legal_name: "Socilet",
  gstin: "",
  upi_id: "",
  address: "",
  phone: "",
  email: "",
  logo_url: "/socilet-logo.svg",
};

export async function loadFirm(): Promise<FirmProfile> {
  if (await cloudLive()) {
    try {
      const res = await apiJson<{ data: FirmProfile }>("/api/crm/settings/firm");
      if (res.data) return { ...EMPTY, ...res.data };
    } catch {
      /* local */
    }
  }
  const row = await db.settings.get("firm");
  return {
    ...EMPTY,
    legal_name: String(row?.legal_name || EMPTY.legal_name),
    gstin: String(row?.gstin || ""),
    upi_id: String(row?.upi_id || ""),
    address: String(row?.address || ""),
    phone: String(row?.phone || ""),
    email: String(row?.email || ""),
    logo_url: String(row?.logo_url || EMPTY.logo_url),
  };
}

export async function saveFirm(firm: FirmProfile) {
  const row = {
    id: "firm",
    base_balance: 0,
    updated_at: new Date().toISOString(),
    ...firm,
  };
  if (await cloudLive()) {
    await apiJson("/api/crm/settings/firm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(firm),
    });
  }
  await db.settings.put(row);
}

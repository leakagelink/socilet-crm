import { listRecords, updateRecord, type RecordRow } from "@/lib/db";

export const PAY_TYPES = ["upi", "bank", "card", "wallet", "other"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export function str(v: unknown) {
  return String(v ?? "").trim();
}

export function payLabel(row: RecordRow) {
  return str(row.data.name) || str(row.data.label) || "Payment method";
}

export function paySnapshot(row: RecordRow) {
  const t = str(row.data.type).toLowerCase();
  const lines: string[] = [payLabel(row)];
  if (t === "bank") {
    if (str(row.data.bank_name)) lines.push(str(row.data.bank_name));
    if (str(row.data.account_name)) lines.push(`A/c name ${str(row.data.account_name)}`);
    if (str(row.data.account_number)) lines.push(`A/c ${str(row.data.account_number)}`);
    if (str(row.data.ifsc)) lines.push(`IFSC ${str(row.data.ifsc)}`);
  } else if (t === "upi") {
    if (str(row.data.upi_id)) lines.push(`UPI ${str(row.data.upi_id)}`);
  } else if (t === "card") {
    if (str(row.data.provider) || str(row.data.card_network)) lines.push(str(row.data.provider) || str(row.data.card_network));
    if (str(row.data.last4)) lines.push(`**** ${str(row.data.last4)}`);
  } else if (t === "wallet") {
    if (str(row.data.provider)) lines.push(str(row.data.provider));
    if (str(row.data.wallet_id)) lines.push(str(row.data.wallet_id));
  }
  if (str(row.data.details)) lines.push(str(row.data.details));
  return lines.filter(Boolean).join("\n");
}

export function isDefaultPay(row: RecordRow) {
  return row.data.is_default === true || row.data.is_default === "true";
}

export async function unsetOtherDefaults(keepId: string) {
  const rows = await listRecords("payment_methods");
  await Promise.all(
    rows
      .filter((r) => r.id !== keepId && isDefaultPay(r))
      .map((r) => updateRecord(r.id, { ...r.data, is_default: false })),
  );
}

export function defaultPay(rows: RecordRow[]) {
  return rows.find(isDefaultPay) || rows.find((r) => r.data.active !== false) || rows[0];
}

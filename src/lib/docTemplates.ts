export const DOC_TEMPLATES = [
  { id: "classic", label: "Classic", vibe: "Professional serif" },
  { id: "modern", label: "Modern", vibe: "Bold split header" },
  { id: "minimal", label: "Minimal", vibe: "Quiet type, lots of air" },
  { id: "midnight", label: "Midnight", vibe: "Dark gold studio" },
] as const;

export type DocTemplateId = (typeof DOC_TEMPLATES)[number]["id"];

export function asTemplate(v: unknown): DocTemplateId {
  const s = String(v || "classic");
  return DOC_TEMPLATES.some((t) => t.id === s) ? (s as DocTemplateId) : "classic";
}

export type DocView = {
  kind: "invoice" | "quote";
  title: string;
  number: string;
  date: string;
  due?: string;
  validUntil?: string;
  client: string;
  clientEmail: string;
  clientPhone: string;
  clientGstin: string;
  clientAddress: string;
  project: string;
  item: string;
  amount: number;
  gst: number;
  notes: string;
  paymentMethod: string;
  paymentDetails: string;
  status: string;
  template: DocTemplateId;
};

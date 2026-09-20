import { uid } from "@/lib/utils";

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  data: string;
};

const MAX_BYTES = 700_000;
const MAX_FILES = 4;

export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const data = String(o.data || "");
      const name = String(o.name || "file").trim();
      if (!data.startsWith("data:") || !name) return null;
      return { id: String(o.id || uid()), name, mime: String(o.mime || "application/octet-stream"), data };
    })
    .filter((a): a is Attachment => Boolean(a));
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is over 700KB`);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return { id: uid(), name: file.name, mime: file.type || "application/octet-stream", data };
}

export function canAddAttachment(current: Attachment[]) {
  return current.length < MAX_FILES;
}

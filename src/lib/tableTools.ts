import type { FieldDef, ModuleDef } from "@/lib/modules";
import type { RecordRow } from "@/lib/db";
import { nowIso, uid } from "@/lib/utils";

export function cellText(v: unknown) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v == null) return "";
  return String(v);
}

export function dateField(module: ModuleDef) {
  const prefer = ["date", "sale_date", "due_date", "due_at", "start_date", "paid_date", "billing_date"];
  return (
    module.fields.find((f) => f.kind === "date" && prefer.includes(f.name)) ??
    module.fields.find((f) => f.kind === "date")
  );
}

export function matchRow(
  row: RecordRow,
  module: ModuleDef,
  search: string,
  selects: Record<string, string>,
  from: string,
  to: string,
) {
  const q = search.trim().toLowerCase();
  if (q) {
    const blob = [
      row.id,
      ...module.fields.map((f) => cellText(row.data[f.name])),
      JSON.stringify(row.data.payments ?? ""),
      row.created_at,
    ]
      .join(" ")
      .toLowerCase();
    if (!blob.includes(q)) return false;
  }
  for (const [name, value] of Object.entries(selects)) {
    if (!value) continue;
    if (cellText(row.data[name]) !== value) return false;
  }
  const df = dateField(module);
  if (df && (from || to)) {
    const raw = cellText(row.data[df.name]).slice(0, 10);
    if (from && raw && raw < from) return false;
    if (to && raw && raw > to) return false;
    if ((from || to) && !raw) return false;
  }
  return true;
}

function csvEscape(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function recordsToCsv(module: ModuleDef, rows: RecordRow[]) {
  const headers = ["id", ...module.fields.map((f) => f.name), "created_at"];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    const cells = [
      row.id,
      ...module.fields.map((f) => cellText(row.data[f.name])),
      row.created_at,
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [] as Record<string, string>[];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function labelToName(module: ModuleDef, key: string) {
  const k = key.trim().toLowerCase();
  const byName = module.fields.find((f) => f.name.toLowerCase() === k);
  if (byName) return byName.name;
  const byLabel = module.fields.find((f) => f.label.toLowerCase() === k);
  return byLabel?.name;
}

function coerce(field: FieldDef | undefined, raw: string) {
  if (!field) return raw;
  if (field.kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (field.kind === "checkbox") {
    const v = raw.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1";
  }
  return raw;
}

export function rowsFromCsv(module: ModuleDef, text: string): RecordRow[] {
  return parseCsv(text).map((raw) => {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "id" || key === "created_at" || key === "updated_at" || key === "module") continue;
      const name = labelToName(module, key);
      if (!name) continue;
      const field = module.fields.find((f) => f.name === name);
      data[name] = coerce(field, value);
    }
    return {
      id: raw.id?.trim() || uid(),
      module: module.id,
      data,
      created_at: raw.created_at || nowIso(),
      updated_at: nowIso(),
    };
  });
}

export function rowsFromJson(module: ModuleDef, text: string): RecordRow[] {
  const parsed = JSON.parse(text) as unknown;
  const list: RecordRow[] = [];
  const push = (row: RecordRow) => {
    if (!row?.module || row.module === module.id) {
      list.push({
        id: row.id || uid(),
        module: module.id,
        data: row.data && typeof row.data === "object" ? row.data : {},
        created_at: row.created_at || nowIso(),
        updated_at: nowIso(),
      });
    }
  };
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (row && typeof row === "object" && "data" in row) push(row as RecordRow);
    }
    return list;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: RecordRow[] }).records)) {
    for (const row of (parsed as { records: RecordRow[] }).records) push(row);
  }
  return list;
}

export function parseImportFile(module: ModuleDef, filename: string, text: string) {
  const trim = text.trim();
  if (filename.toLowerCase().endsWith(".json") || trim.startsWith("{") || trim.startsWith("[")) {
    return rowsFromJson(module, text);
  }
  return rowsFromCsv(module, text);
}

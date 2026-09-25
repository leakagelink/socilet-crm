import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { persistFiles } from "./persist.mjs";
import { completeImage } from "./ai-providers.mjs";

const MAX_FILES = 80;
const MAX_BODY = 80_000;

function rootDir() {
  return persistFiles("ai-files")[0];
}

function indexPath(userId) {
  return join(rootDir(), safeId(userId), "index.json");
}

function safeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "anon";
}

function safeName(name, ext) {
  const base = String(name || "socilet-file")
    .replace(/[^\w.\- ()[\]]+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 60) || "socilet-file";
  const e = String(ext || "bin").replace(/[^\w]/g, "").slice(0, 8);
  return base.toLowerCase().endsWith(`.${e}`) ? base : `${base}.${e}`;
}

function loadIndex(userId) {
  const file = indexPath(userId);
  try {
    if (!existsSync(file)) return [];
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveIndex(userId, list) {
  const file = indexPath(userId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(list.slice(0, MAX_FILES), null, 0));
}

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n >>> 0, 0);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.concat([
      Buffer.from("PK\u0003\u0004"),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      Buffer.from("PK\u0001\u0002"),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.concat([
    Buffer.from("PK\u0005\u0006"),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralBuf, end]);
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function winAnsi(s) {
  return [...String(s)].map((ch) => (ch.charCodeAt(0) < 256 ? ch : "?")).join("");
}

function wrapLines(text, width = 92) {
  const out = [];
  for (const para of String(text || "").replace(/\r/g, "").split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    let rest = para;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < width * 0.4) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    out.push(rest);
  }
  return out.slice(0, 1200);
}

export function buildPdf(title, body) {
  const header = winAnsi(title || "Socilet document");
  const lines = wrapLines(winAnsi(body || ""), 92);
  const perPage = 46;
  const pages = [];
  if (!lines.length) pages.push([""]);
  else {
    for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  }
  const n = pages.length;
  const pageId = (i) => 3 + i;
  const fontId = 3 + n;
  const contentId = (i) => fontId + 1 + i;
  const maxId = fontId + n;
  const store = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`,
    [fontId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  pages.forEach((pageLines, i) => {
    store[pageId(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId(i)} 0 R >>`;
    const cmds = ["BT", "/F1 16 Tf", "50 742 Td", `(${pdfEscape(header.slice(0, 80))}) Tj`, "/F1 10 Tf", "0 -28 Td"];
    pageLines.forEach((line, li) => {
      if (li) cmds.push("0 -15 Td");
      cmds.push(`(${pdfEscape(line)}) Tj`);
    });
    cmds.push("ET");
    const stream = cmds.join("\n");
    store[contentId(i)] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const xref = [0];
  for (let i = 1; i <= maxId; i += 1) {
    xref.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i} 0 obj\n${store[i]}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i += 1) pdf += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export function buildDocx(title, body) {
  const paras = [title, "", ...String(body || "").split("\n")].map((line) => {
    const t = xmlEscape(line || " ");
    return `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  });
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}<w:sectPr/></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStore([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: document },
  ]);
}

export function buildHtml(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${xmlEscape(title)}</title>
<style>
  body{font-family:Georgia,serif;max-width:44rem;margin:2rem auto;padding:0 1.25rem;color:#0b1624;background:#fffaf1}
  h1{font-size:1.8rem;border-bottom:2px solid #d4a017;padding-bottom:.4rem}
  pre{white-space:pre-wrap;font-family:Georgia,serif;line-height:1.55}
  .brand{color:#b8860b;letter-spacing:.2em;font-size:.7rem;text-transform:uppercase}
</style>
<p class="brand">Socilet OS</p>
<h1>${xmlEscape(title)}</h1>
<pre>${xmlEscape(body)}</pre>`;
}

export function buildSvgPoster({ title, body, kicker }) {
  const lines = wrapLines(body || "", 42).slice(0, 18);
  const text = lines
    .map((line, i) => `<text x="80" y="${420 + i * 36}" fill="#0b1624" font-size="22" font-family="Georgia,serif">${xmlEscape(line)}</text>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#fff6e8"/>
  <rect x="0" y="0" width="1080" height="18" fill="#d4a017"/>
  <rect x="0" y="1332" width="1080" height="18" fill="#d4a017"/>
  <text x="80" y="90" fill="#b8860b" font-size="18" letter-spacing="6" font-family="Outfit,Arial,sans-serif">${xmlEscape((kicker || "SOCILET OS").toUpperCase())}</text>
  <text x="80" y="180" fill="#0b1624" font-size="48" font-family="Georgia,serif">${xmlEscape((title || "Poster").slice(0, 48))}</text>
  ${text}
</svg>`;
}

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
};

export function saveGeneratedFile(userId, { name, ext, mime, kind, buffer }) {
  const id = randomUUID();
  const dir = join(rootDir(), safeId(userId));
  mkdirSync(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const path = join(dir, filename);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  writeFileSync(path, buf);
  const meta = {
    id,
    name: safeName(name, ext),
    ext,
    mime: mime || MIME[ext] || "application/octet-stream",
    kind: kind || ext,
    bytes: buf.length,
    created_at: new Date().toISOString(),
    file: filename,
  };
  let list = [meta, ...loadIndex(userId)].slice(0, MAX_FILES);
  const drop = list.slice(MAX_FILES);
  for (const old of drop) {
    try {
      unlinkSync(join(dir, old.file));
    } catch {
      /* ignore */
    }
  }
  list = list.slice(0, MAX_FILES);
  saveIndex(userId, list);
  return publicMeta(meta);
}

export function publicMeta(meta) {
  return {
    id: meta.id,
    name: meta.name,
    mime: meta.mime,
    kind: meta.kind,
    bytes: meta.bytes,
    created_at: meta.created_at,
  };
}

export function listGeneratedFiles(userId) {
  return loadIndex(userId).map(publicMeta);
}

export function readGeneratedFile(userId, id) {
  const row = loadIndex(userId).find((f) => f.id === id);
  if (!row) return null;
  const path = join(rootDir(), safeId(userId), row.file);
  if (!existsSync(path)) return null;
  return { ...row, buffer: readFileSync(path) };
}

export function documentBuffer(format, title, body) {
  const raw = String(format || "pdf").toLowerCase().replace(/^\./, "");
  const fmt = raw === "word" || raw === "doc" ? "docx" : raw === "markdown" ? "md" : raw === "xls" || raw === "xlsx" ? "csv" : raw;
  const t = String(title || "Socilet document").slice(0, 120);
  const b = String(body || "").slice(0, MAX_BODY);
  if (fmt === "pdf") return { ext: "pdf", mime: MIME.pdf, buffer: buildPdf(t, b), kind: "pdf" };
  if (fmt === "docx") return { ext: "docx", mime: MIME.docx, buffer: buildDocx(t, b), kind: "docx" };
  if (fmt === "html") return { ext: "html", mime: MIME.html, buffer: Buffer.from(buildHtml(t, b)), kind: "html" };
  if (fmt === "csv") return { ext: "csv", mime: MIME.csv, buffer: Buffer.from(b), kind: "csv" };
  if (fmt === "json") {
    let pretty = b;
    try {
      pretty = JSON.stringify(JSON.parse(b), null, 2);
    } catch {
      pretty = JSON.stringify({ title: t, body: b }, null, 2);
    }
    return { ext: "json", mime: MIME.json, buffer: Buffer.from(pretty), kind: "json" };
  }
  if (fmt === "md") {
    return { ext: "md", mime: MIME.md, buffer: Buffer.from(`# ${t}\n\n${b}`), kind: "md" };
  }
  if (fmt === "svg") {
    return { ext: "svg", mime: MIME.svg, buffer: Buffer.from(buildSvgPoster({ title: t, body: b })), kind: "image" };
  }
  return { ext: "txt", mime: MIME.txt, buffer: Buffer.from(`${t}\n\n${b}`), kind: "txt" };
}

export async function generateImageBuffer(env, { title, prompt, kind }) {
  const text = String(prompt || title || "Socilet cream and gold poster").slice(0, 3500);
  const painted = await completeImage(
    env,
    `${kind === "logo" ? "Minimal logo, no text clutter. " : ""}Cream, gold, premium brand. ${text}`,
  );
  if (painted?.buffer) {
    return { ext: "png", mime: MIME.png, buffer: painted.buffer, kind: "image", source: painted.source };
  }
  return {
    ext: "svg",
    mime: MIME.svg,
    buffer: Buffer.from(buildSvgPoster({ title: title || "Image", body: text, kicker: kind || "image" })),
    kind: "image",
    source: "svg",
  };
}

export function inferGenerate(text) {
  const t = String(text || "");
  if (!/\b(pdf|docx?|xlsx|csv|spreadsheet|html|markdown|json|txt|text file|image|poster|logo|svg|png|jpg|photo|generate|banao|bana do|download|report|invoice template|proposal)\b/i.test(t)) {
    return null;
  }
  if (/\b(image|poster|logo|png|jpg|svg|photo|illustration)\b/i.test(t)) return { type: "image" };
  if (/\bpdf\b/i.test(t)) return { type: "document", format: "pdf" };
  if (/\bdocx?|word\b/i.test(t)) return { type: "document", format: "docx" };
  if (/\bcsv|excel|xlsx|spreadsheet\b/i.test(t)) return { type: "document", format: "csv" };
  if (/\bhtml\b/i.test(t)) return { type: "document", format: "html" };
  if (/\bjson\b/i.test(t)) return { type: "document", format: "json" };
  if (/\bmd|markdown\b/i.test(t)) return { type: "document", format: "md" };
  return { type: "document", format: "pdf" };
}

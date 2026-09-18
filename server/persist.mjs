import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Files outside the git app folder first, so Hostinger deploys do not wipe logins. */
export function persistFiles(name, extra = []) {
  const out = [];
  const push = (p) => {
    const file = String(p || "").trim();
    if (file && !out.includes(file)) out.push(file);
  };
  for (const item of extra) push(item);
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) push(join(dataDir, name));
  try {
    push(join(homedir(), ".socilet-crm", name));
  } catch {
    /* no home */
  }
  push(join(process.cwd(), "..", ".socilet-persist", name));
  push(join(process.cwd(), "..", "..", ".socilet-persist", name));
  push(join(process.cwd(), "data", name));
  return out;
}

export function persistCopyCount(name, extra = []) {
  return persistFiles(name, extra).filter((file) => existsSync(file)).length;
}

export function readJsonCopies(name, extra = []) {
  const copies = [];
  for (const file of persistFiles(name, extra)) {
    try {
      if (!existsSync(file)) continue;
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (raw == null) continue;
      copies.push({ file, raw, mtime: statSync(file).mtimeMs });
    } catch {
      /* skip bad copy */
    }
  }
  return copies;
}

export function writeJsonCopies(name, value, extra = []) {
  const body = JSON.stringify(value, null, 2);
  let wrote = 0;
  const errors = [];
  for (const file of persistFiles(name, extra)) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body, "utf8");
      wrote += 1;
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!wrote) throw new Error(`Could not persist ${name}. ${errors.join("; ")}`);
  return wrote;
}

export function pickBestCopy(copies, scoreOf) {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const copy of copies) {
    const score = scoreOf(copy);
    if (score > bestScore) {
      bestScore = score;
      best = copy;
    }
  }
  return best;
}

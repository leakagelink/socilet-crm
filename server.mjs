import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { handleEmailRequest } from "./server/email-api.mjs";
import { handleCrmRequest, runDailyBackup } from "./server/crm-api.mjs";
import { handleAuthRequest } from "./server/auth-api.mjs";
import { handleMeetRequest } from "./server/meet-api.mjs";
import { handleAiRequest } from "./server/ai-api.mjs";

const dist = join(import.meta.dirname, "dist");
const port = Number(process.env.PORT || 43721);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path.startsWith("/api/auth")) {
    await handleAuthRequest(req, res, process.env);
    return;
  }
  if (path.startsWith("/api/email")) {
    await handleEmailRequest(req, res, process.env);
    return;
  }
  if (path.startsWith("/api/meet")) {
    await handleMeetRequest(req, res, process.env);
    return;
  }
  if (path.startsWith("/api/ai")) {
    await handleAiRequest(req, res, process.env);
    return;
  }
  if (path.startsWith("/api/crm")) {
    await handleCrmRequest(req, res, process.env);
    return;
  }
  let file = join(dist, path === "/" ? "index.html" : path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  try {
    const body = readFileSync(file);
    res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Socilet CRM + Resend API on 0.0.0.0:${port}`);
  void runDailyBackup(process.env);
  setInterval(() => {
    void runDailyBackup(process.env);
  }, 6 * 60 * 60 * 1000);
});

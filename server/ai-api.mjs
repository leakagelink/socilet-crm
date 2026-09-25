import { json, readBody } from "./http-util.mjs";
import { corsAndOptions, guardOrigin, readJson, rateLimit, clientIp } from "./security.mjs";
import { requireApiUser } from "./auth-api.mjs";
import { loadCrmState } from "./crm-api.mjs";
import { buildDailySnapshot, clipJson, crmDirectoryLite, snapshotLite, slimMemory, visibleRecords } from "./ai-context.mjs";
import { confirmPending, ensureAi, executeTool, selectTools } from "./ai-tools.mjs";
import {
  appendTurn,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  otherSessionIndex,
  patchSession,
  sessionHistory,
} from "./ai-sessions.mjs";
import { inferGenerate, listGeneratedFiles, readGeneratedFile } from "./ai-files.mjs";
import {
  addProvider,
  completeChat,
  deleteProvider,
  fetchRemoteModels,
  hasAnyProvider,
  listCatalog,
  listProvidersPublic,
  patchProvider,
  RELAY,
  syncEnvProviders,
  usageSummary,
} from "./ai-providers.mjs";
import { patchResearchKeys, researchPublic } from "./ai-research.mjs";
import { companyPackSync } from "./ai-company.mjs";

const SYSTEM = `You are Socilet OS for this CRM (founder ops). Not a yes-man chatbot.
Never invent clients, amounts, dates, products, or other chats. Missing → say unknown. Never dump the DB or secrets.
CRM facts only from CRM_CONTEXT, tools, or memory. Brand only from COMPANY_PACK if present.
Short replies: recommendation, 2–4 evidence points, one next action. Link records as [Name](/path).
Client → client_intelligence. Project → project_health. Search → crm_search. Files → generate_document/image. Email/quote/invoice → draft_* then wait for UI confirm.
Ads ROAS → ads_performance; do not scale ROAS below 1. Web/latest/legal → web_research with [title](url) cites.
Hinglish OK.`;

const CORE_TOOLS = ["daily_brief", "crm_search", "get_record"];
const INTEL_TOOLS = ["client_intelligence", "project_health"];
const WRITE_TOOLS = ["create_task", "update_task", "complete_task", "create_reminder", "add_client_note", "update_project", "remember"];
const DOC_TOOLS = ["generate_document", "generate_image"];
const MAIL_TOOLS = ["draft_email", "draft_invoice", "draft_quotation"];
const MEET_TOOLS = ["log_meeting", "followup_script"];
const WEB_TOOLS = ["web_research", "company_pack"];
const ADS_TOOLS = ["ads_performance", "log_ad_spend", "capture_ad_lead", "convert_ad_lead", "winning_ad_quote"];

function tokenBudget(text, attachments) {
  const t = String(text || "").toLowerCase();
  const files = attachments?.length > 0;
  const light =
    !files &&
    t.length < 140 &&
    /^(hi+|hello|hey|ok+|okay|thanks|thank you|tha?nks|cool|nice|haan( ji)?|theek|got it|ping|test|kya haal|how are you|who are you|tum kaun)[\s!.?]*$/i.test(
      String(text || "").trim(),
    );
  const research = /\b(research|competitor|market|news|latest|gst|legal|visa|web|socilet\.com|socilet\.in)\b/.test(t);
  const filesWant = files || /\b(pdf|docx?|image|poster|generate|report|proposal|csv)\b/.test(t);
  const ads = /\b(ads?|roas|campaign|meta|google ads)\b/.test(t);
  const mail = /\b(email|invoice|quotation|quote|draft)\b/.test(t);
  const meet = /\b(meeting|follow.?up|script|call script)\b/.test(t);
  const crm =
    /\b(client|project|task|invoice|quote|payment|due|overdue|lead|reminder|kal|today|aaj|brief|priority|kitna|status|balance)\b/.test(t) ||
    t.length > 140;
  const hard = research || filesWant || /\b(strategy|why|conflict|health|focus|kya karun)\b/.test(t);

  if (light) {
    return { mode: "light", hard: false, tools: [], history: 4, maxTokens: 280, loops: 1, context: false, brand: false, resultClip: 2000 };
  }

  const tools = [...CORE_TOOLS];
  if (crm || hard || ads || mail || meet) tools.push(...INTEL_TOOLS, ...WRITE_TOOLS);
  if (filesWant) tools.push(...DOC_TOOLS);
  if (mail) tools.push(...MAIL_TOOLS);
  if (meet) tools.push(...MEET_TOOLS);
  if (research) tools.push(...WEB_TOOLS);
  if (ads) tools.push(...ADS_TOOLS);
  if (hard) tools.push(...DOC_TOOLS, ...WEB_TOOLS);

  if (hard) {
    return { mode: "hard", hard: true, tools: [...new Set(tools)], history: 12, maxTokens: 1100, loops: 4, context: true, brand: research, resultClip: 4000 };
  }
  if (mail || meet || ads || filesWant) {
    return { mode: "work", hard: false, tools: [...new Set(tools)], history: 10, maxTokens: 800, loops: 4, context: true, brand: false, resultClip: 3200 };
  }
  if (crm) {
    return { mode: "crm", hard: false, tools: [...new Set([...CORE_TOOLS, ...INTEL_TOOLS, ...WRITE_TOOLS])], history: 8, maxTokens: 700, loops: 3, context: true, brand: false, resultClip: 2800 };
  }
  return { mode: "ask", hard: false, tools: CORE_TOOLS, history: 6, maxTokens: 400, loops: 2, context: true, brand: false, resultClip: 2200 };
}

function clipTurn(content, max = 1200) {
  if (typeof content === "string") return content.length <= max ? content : `${content.slice(0, max)}…`;
  return content;
}

function pathname(req) {
  return (req.url || "/").split("?")[0];
}

function sanitizeUserText(text) {
  return String(text || "").slice(0, 8000);
}

function stripInjection(text) {
  return String(text || "")
    .replace(/ignore (all )?(previous|prior) instructions/gi, "[redacted]")
    .replace(/system prompt/gi, "[redacted]");
}

function parseAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 4)) {
    const name = String(item?.name || "file").slice(0, 120);
    const mime = String(item?.mime || "application/octet-stream").slice(0, 80);
    const text = String(item?.text || "").slice(0, 6_000);
    const dataUrl = String(item?.dataUrl || "");
    const okImg = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(dataUrl) && dataUrl.length < 1_200_000;
    out.push({
      name,
      mime,
      text,
      dataUrl: okImg ? dataUrl : "",
    });
  }
  return out;
}

function packUserMessage(text, attachments) {
  const notes = [];
  if (text) notes.push(stripInjection(text));
  const images = [];
  for (const a of attachments) {
    if (a.dataUrl) images.push({ type: "image_url", image_url: { url: a.dataUrl } });
    else if (a.text) notes.push(`--- ${a.name} ---\n${stripInjection(a.text)}`);
    else notes.push(`[Attached file: ${a.name} (${a.mime})]`);
  }
  const body = notes.join("\n\n").slice(0, 12_000) || "See attached files.";
  if (!images.length) return { role: "user", content: body };
  return { role: "user", content: [{ type: "text", text: body }, ...images] };
}

export async function handleAiRequest(req, res, env = process.env) {
  if (corsAndOptions(req, res, env)) return true;
  if (!guardOrigin(req, res, env)) return true;
  const path = pathname(req);

  if (!path.startsWith("/api/ai")) return false;

  const user = await requireApiUser(req, res, env);
  if (!user) return true;

  const isChat = req.method === "POST" && (path === "/api/ai/chat" || path === "/api/ai/chat/stream");
  if (isChat) {
    const rl = rateLimit(`ai:${user.id}:${clientIp(req)}`, 40, 60 * 60 * 1000);
    if (!rl.ok) {
      json(res, 429, { error: "AI rate limit. Try later.", retryAfter: rl.retryAfter });
      return true;
    }
  }

  try {
    if (req.method === "GET" && path === "/api/ai/status") {
      syncEnvProviders(env);
      const list = listProvidersPublic();
      const live = list.find((p) => p.enabled && p.has_key && !p.cooling);
      json(res, 200, {
        data: {
          configured: hasAnyProvider(env),
          model: live?.model || RELAY.model,
          reason_model: live?.reason_model || RELAY.reason_model,
          provider: live?.name || null,
          providers: list.length,
          usage: usageSummary(),
        },
      });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/catalog") {
      json(res, 200, { data: await listCatalog(env), usage: usageSummary() });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/usage") {
      json(res, 200, { data: usageSummary() });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/providers") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      syncEnvProviders(env);
      json(res, 200, { data: listProvidersPublic(), preset: RELAY });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/research") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      json(res, 200, { data: researchPublic(env) });
      return true;
    }
    if (req.method === "PATCH" && path === "/api/ai/research") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      json(res, 200, { data: patchResearchKeys(input) });
      return true;
    }

    if (req.method === "POST" && path === "/api/ai/providers") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      try {
        json(res, 200, { data: addProvider(input) });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : "Could not add API" });
      }
      return true;
    }

    const provOne = path.match(/^\/api\/ai\/providers\/([^/]+)$/);
    if (provOne && req.method === "PATCH") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const input = await readJson(req, res);
      if (!input) return true;
      const row = patchProvider(provOne[1], input);
      json(res, row ? 200 : 404, row ? { data: row } : { error: "Not found" });
      return true;
    }
    if (provOne && req.method === "DELETE") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const ok = deleteProvider(provOne[1]);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: "Not found" });
      return true;
    }
    const provModels = path.match(/^\/api\/ai\/providers\/([^/]+)\/models$/);
    if (provModels && req.method === "GET") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      try {
        json(res, 200, { data: await fetchRemoteModels(provModels[1]) });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : "Models failed" });
      }
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/brief") {
      const state = loadCrmState();
      const ai = ensureAi(state);
      const snap = buildDailySnapshot(visibleRecords(state, user.role), state.settings.finance, ai.memory);
      json(res, 200, { data: snap, llm: hasAnyProvider(env) });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/memory") {
      const state = loadCrmState();
      json(res, 200, { data: ensureAi(state).memory });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/audit") {
      if (user.role !== "admin") {
        json(res, 403, { error: "Admin only" });
        return true;
      }
      const state = loadCrmState();
      json(res, 200, { data: ensureAi(state).audit.slice(-80).reverse() });
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/sessions") {
      json(res, 200, { data: listSessions(user.id) });
      return true;
    }

    if (req.method === "POST" && path === "/api/ai/sessions") {
      json(res, 200, { data: createSession(user.id) });
      return true;
    }

    const one = path.match(/^\/api\/ai\/sessions\/([^/]+)$/);
    if (one && req.method === "GET") {
      const row = getSession(user.id, one[1]);
      if (!row) {
        json(res, 404, { error: "Session not found" });
        return true;
      }
      json(res, 200, { data: row });
      return true;
    }
    if (one && req.method === "PATCH") {
      const input = await readJson(req, res);
      if (!input) return true;
      const row = patchSession(user.id, one[1], {
        title: input.title,
        pinned: typeof input.pinned === "boolean" ? input.pinned : undefined,
      });
      if (!row) {
        json(res, 404, { error: "Session not found" });
        return true;
      }
      json(res, 200, { data: row });
      return true;
    }
    if (one && req.method === "DELETE") {
      const ok = deleteSession(user.id, one[1]);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: "Session not found" });
      return true;
    }

    if (req.method === "POST" && path === "/api/ai/confirm") {
      const input = await readJson(req, res);
      if (!input) return true;
      const result = await confirmPending(String(input.token || ""), user, env);
      json(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (req.method === "GET" && path === "/api/ai/files") {
      json(res, 200, { data: listGeneratedFiles(user.id) });
      return true;
    }

    const fileOne = path.match(/^\/api\/ai\/files\/([^/]+)$/);
    if (fileOne && req.method === "GET") {
      const row = readGeneratedFile(user.id, fileOne[1]);
      if (!row) {
        json(res, 404, { error: "File not found" });
        return true;
      }
      const inline = /image|svg|pdf|html/i.test(row.mime) && String(req.url || "").includes("inline=1");
      res.statusCode = 200;
      res.setHeader("Content-Type", row.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${String(row.name).replace(/"/g, "")}"`,
      );
      res.end(row.buffer);
      return true;
    }

    if (req.method === "POST" && (path === "/api/ai/chat" || path === "/api/ai/chat/stream")) {
      const streaming = path.endsWith("/stream");
      const raw = await readBody(req, 6 * 1024 * 1024);
      if (raw == null) {
        json(res, 413, { error: "Request too large" });
        return true;
      }
      let input = {};
      try {
        input = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return true;
      }
      const attachments = parseAttachments(input.attachments);
      const text = sanitizeUserText(input.message);
      if (!text && !attachments.length) {
        json(res, 400, { error: "message or file required" });
        return true;
      }
      const preferModel = String(input.model || "").trim().slice(0, 80);
      const userStore = [text, ...attachments.map((a) => `[file: ${a.name}]`)].filter(Boolean).join("\n");
      let sessionId = String(input.sessionId || "").trim();
      if (!sessionId) sessionId = createSession(user.id).id;

      const emit = streaming
        ? (obj) => {
            if (!res.headersSent) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
              res.setHeader("Cache-Control", "no-cache");
            }
            res.write(`${JSON.stringify(obj)}\n`);
          }
        : null;

      const finish = (status, body) => {
        if (streaming) {
          if (status >= 400) emit({ type: "error", error: body.error || "AI failed" });
          else emit({ type: "done", data: body.data });
          res.end();
          return;
        }
        json(res, status, body);
      };

      const budget = tokenBudget(text, attachments);
      const state = loadCrmState();
      const ai = ensureAi(state);
      const records = visibleRecords(state, user.role);
      const snap = buildDailySnapshot(records, state.settings.finance, ai.memory);
      const history = sessionHistory(user.id, sessionId);

      const grounded = [{ role: "system", content: SYSTEM }];
      if (budget.brand) {
        const pack = companyPackSync();
        grounded.push({
          role: "system",
          content: `COMPANY_PACK:\n${clipJson({ brand: pack.brand, domains: pack.domains, product: pack.product, rules: pack.rules }, 1800)}`,
        });
      }
      if (budget.context) {
        grounded.push({
          role: "system",
          content: `CRM_CONTEXT (facts only; use tools for detail):\n${clipJson(
            {
              role: user.role,
              directory: crmDirectoryLite(records),
              other_chats: otherSessionIndex(user.id, sessionId)
                .slice(0, 5)
                .map((s) => s.title),
              snapshot: snapshotLite(snap),
              memory: slimMemory(ai.memory),
            },
            4500,
          )}`,
        });
      }
      grounded.push(
        ...history.slice(-budget.history).map((m) => ({ role: m.role, content: clipTurn(m.content) })),
        packUserMessage(text, attachments),
      );

      if (!hasAnyProvider(env)) {
        const files = [];
        const want = inferGenerate(text);
        let reply = fallbackReply(text, snap);
        if (want) {
          const result = await executeTool(
            want.type === "image" ? "generate_image" : "generate_document",
            want.type === "image"
              ? { title: text.slice(0, 60), prompt: text, kind: "poster" }
              : { format: want.format, title: text.slice(0, 60), body: `${text}\n\n---\nCRM brief\n${JSON.stringify(snap.attention?.slice(0, 8) || [], null, 2)}` },
            user,
            env,
          );
          if (result.file) {
            files.push(result.file);
            reply += `\n\nFile ready: ${result.file.name}. Chat me download karo.`;
          } else if (result.error) {
            reply += `\n\nFile nahi bani: ${result.error}`;
          }
        }
        appendTurn(user.id, sessionId, userStore, reply, files);
        finish(200, { data: { reply, mode: "deterministic", confirmations: [], files, links: [], sessionId } });
        return true;
      }

      const messages = grounded;
      const confirmations = [];
      const files = [];
      const links = [];
      let final = "";
      const toolset = selectTools(budget.tools);
      for (let i = 0; i < budget.loops; i += 1) {
        const out = await completeChat(env, {
          messages,
          tools: toolset,
          hard: budget.hard,
          model: preferModel,
          max_tokens: budget.maxTokens,
          onDelta: streaming ? (chunk) => emit({ type: "delta", text: chunk }) : undefined,
        });
        if (out.error) {
          finish(502, { error: out.error });
          return true;
        }
        const msg = out.message;
        messages.push(msg);
        const calls = msg.tool_calls || [];
        if (!calls.length) {
          final = String(msg.content || "").trim();
          break;
        }
        for (const call of calls) {
          let parsed = {};
          try {
            parsed = JSON.parse(call.function?.arguments || "{}");
          } catch {
            parsed = {};
          }
          const result = await executeTool(call.function?.name, parsed, user, env);
          if (result.needs_confirmation) confirmations.push(result);
          if (result.file) files.push(result.file);
          harvestLinks(result, links);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: clipJson(result, budget.resultClip),
          });
        }
      }
      if (!final) final = "I retrieved CRM context but could not finish a recommendation. Ask again with a client or project name.";
      if (files.length && !/download|file ready|pdf|docx|image/i.test(final)) {
        final += `\n\nFiles: ${files.map((f) => f.name).join(", ")} — chat me download.`;
      }
      harvestMarkdownLinks(final, links);
      appendTurn(user.id, sessionId, userStore, final, files);
      finish(200, { data: { reply: final, mode: "llm", confirmations, files, links: uniqLinks(links), sessionId } });
      return true;
    }

    json(res, 404, { error: "Unknown AI route" });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI failed";
    if (res.headersSent) {
      try {
        res.write(`${JSON.stringify({ type: "error", error: msg })}\n`);
        res.end();
      } catch {
        /* closed */
      }
      return true;
    }
    json(res, 500, { error: msg });
    return true;
  }
}

function harvestLinks(result, acc) {
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v.href && (v.label || v.title || v.name || v.invoice_no || v.quote_no || v.url)) {
      acc.push({
        href: String(v.href),
        title: String(v.label || v.title || v.name || v.invoice_no || v.quote_no),
        kind: String(v.module || "record"),
      });
    }
    for (const x of Object.values(v)) walk(x);
  };
  walk(result);
}

function harvestMarkdownLinks(text, acc) {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    acc.push({ href: m[2], title: m[1], kind: m[2].startsWith("http") ? "source" : "mention" });
  }
}

function uniqLinks(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const href = String(item.href || "");
    if ((!href.startsWith("/") && !/^https?:\/\//i.test(href)) || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, title: String(item.title || href), kind: String(item.kind || "record") });
  }
  return out.slice(0, 12);
}

function fallbackReply(text, snap) {
  const t = text.toLowerCase();
  const top = snap.attention.slice(0, 5);
  if (/client|project/.test(t) && !top.length) {
    return "CRM me matching client/project ke liye naam specifically do — main unka health pack nikalunga. Abhi koi live AI API nahi hai. Admin → AI Keys me Relay Models ya dusri key add karo.";
  }
  const lines = [];
  lines.push("Pehle yeh, impact ke hisaab se — raw task list nahi:");
  if (!top.length) lines.push("Koi overdue/high-impact item nahi dikha. Ya toh CRM empty hai, ya sab clear hai.");
  for (const item of top) {
    lines.push(`• ${item.title} — ${item.why} (impact ${item.impact}). Open ${item.href}`);
  }
  if (snap.do_not_spend_time_on?.length) {
    lines.push("Abhi skip karo: " + snap.do_not_spend_time_on.join("; "));
  }
  lines.push("Full founder reasoning ke liye AI Keys page pe Relay / OpenAI-compatible API add karo. Limit khatam ho to next key auto-switch hoti hai.");
  return lines.join("\n");
}

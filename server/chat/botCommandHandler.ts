import { getSessions, getSessionById, updateSession } from "../patient/sessionStorePg";
import { getMetrics } from "../monitoring/metricsStore";
import { checkSLO } from "../monitoring/slo";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getRecentEvents } from "../controlTower/eventBus";
import { getLoopStats } from "../system/autonomousLoop";
import { runLearningCycle } from "../engines/unifiedOutcomeLearning";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";
import { getSystemHealth } from "../monitoring/systemMonitor";
import { parseOperatorIntent } from "./intentRouter";

export type BotReply = { text: string; handled: boolean };

const operatorWindows: Map<string, { count: number; heavyCount: number; windowStart: number }> = new Map();
const WINDOW_MS = 60_000;
const MAX_COMMANDS = 30;
const MAX_HEAVY_COMMANDS = 5;
const HEAVY_CMDS = new Set(["learn", "simulate"]);

function checkRateLimit(chatId: string | number, cmd: string): boolean {
  const key = String(chatId);
  const now = Date.now();
  let entry = operatorWindows.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, heavyCount: 0, windowStart: now };
    operatorWindows.set(key, entry);
  }
  if (entry.count >= MAX_COMMANDS) return false;
  const isHeavy = HEAVY_CMDS.has(cmd.replace("/", ""));
  if (isHeavy && entry.heavyCount >= MAX_HEAVY_COMMANDS) return false;
  entry.count++;
  if (isHeavy) entry.heavyCount++;
  return true;
}

const commandAuditLog: Array<{ chatId: string; cmd: string; ts: string; source: "slash" | "intent" }> = [];
const MAX_AUDIT = 500;

function auditCommand(chatId: string | number, cmd: string, source: "slash" | "intent") {
  commandAuditLog.push({ chatId: String(chatId), cmd, ts: new Date().toISOString(), source });
  if (commandAuditLog.length > MAX_AUDIT) commandAuditLog.shift();
}

export function getCommandAuditLog(limit = 50) {
  return commandAuditLog.slice(-limit);
}

function getAllowedChatIds(): Set<string> {
  const raw = process.env.ALLOWED_TELEGRAM_CHAT_IDS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isChatAllowed(chatId: string | number): boolean {
  const allowed = getAllowedChatIds();
  if (allowed.size === 0) return false;
  return allowed.has(String(chatId));
}

function riskBadge(level: string): string {
  const l = level?.toUpperCase();
  if (l === "HIGH" || l === "CRITICAL") return "🔴";
  if (l === "MEDIUM") return "🟡";
  return "🟢";
}

function breakerIcon(state: string): string {
  return state === "OPEN" ? "🔴 OPEN" : state === "HALF_OPEN" ? "🟡 HALF" : "🟢 CLOSED";
}

async function handleQueue(): Promise<string> {
  const rows = await getSessions(10, 0);
  if (!rows.length) return "📋 <b>Patient Queue</b>\n\nNo pending patients.";
  const lines = rows.slice(0, 10).map((r: any) => {
    const badge = riskBadge(r.riskLevel ?? "LOW");
    const flags = (r.safetyFlags ?? []).slice(0, 2).join(", ") || "—";
    return `${badge} <b>${r.id}</b> · ${r.status} · ${flags}`;
  });
  return `📋 <b>Patient Queue</b> (${rows.length} shown)\n\n${lines.join("\n")}\n\n<i>Use /approve {id} or /override {id}</i>`;
}

async function handleApprove(sessionId: string): Promise<string> {
  const session = await getSessionById(sessionId);
  if (!session) return `❌ Session <code>${sessionId}</code> not found.`;
  await updateSession(sessionId, { status: "approved" });
  return `✅ <b>Approved</b>\nSession: <code>${sessionId}</code>\nStatus: approved`;
}

async function handleOverride(sessionId: string, note: string): Promise<string> {
  const session = await getSessionById(sessionId);
  if (!session) return `❌ Session <code>${sessionId}</code> not found.`;
  await updateSession(sessionId, { status: "physician_overridden" });
  return `⚙️ <b>Override Applied</b>\nSession: <code>${sessionId}</code>\nNote: ${note || "physician override"}\nStatus: physician_overridden`;
}

async function handleHealth(): Promise<string> {
  const [health, metrics] = await Promise.all([getSystemHealth(), Promise.resolve(getMetrics())]);
  const slo = checkSLO({
    p95Latency: (metrics as any).p95Latency,
    errorRate: (metrics as any).errorRate,
    totalRequests: (metrics as any).totalRequests,
  });

  const healthLines = Object.entries(health)
    .slice(0, 6)
    .map(([k, v]: [string, any]) => {
      const ok = v.error === 0;
      return `${ok ? "🟢" : "🔴"} ${k}: ${v.healthy} ok / ${v.error} err / ${Math.round(v.avgLatencyMs)}ms avg`;
    });

  const loop = getLoopStats();

  return [
    "🏥 <b>System Health</b>",
    "",
    ...healthLines,
    "",
    `📊 P95: ${(metrics as any).p95Latency}ms | Error rate: ${((metrics as any).errorRate * 100).toFixed(1)}%`,
    `SLO: ${slo.sloBreached ? "🔴 BREACHED" : "🟢 OK"}`,
    `Learning cycles: ${loop.cycles ?? 0}`,
  ].join("\n");
}

async function handleAlerts(): Promise<string> {
  const events = getRecentEvents(50);
  const alerts = events.filter((e) => e.type === "ALERT").slice(-10).reverse();
  if (!alerts.length) return "🔔 <b>Control Tower Alerts</b>\n\nNo active alerts.";
  const lines = alerts.map((e) => {
    const time = new Date(e.timestamp).toISOString().substring(11, 19);
    const src = e.payload?.source ?? "system";
    const msg = e.payload?.alerts?.join(", ") ?? e.payload?.message ?? "alert";
    return `⚠️ [${time}] <b>${src}</b>: ${msg}`;
  });
  return `🔔 <b>Control Tower Alerts</b>\n\n${lines.join("\n")}`;
}

async function handleSimulate(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const complaint = parts[0] || "cough";
  const daysRaw = parts.find((p) => /\d+d/.test(p));
  const days = daysRaw ? parseInt(daysRaw) : undefined;

  const answers: Record<string, any> = {};
  if (days) answers.daysSinceOnset = days;

  const result = await runFullClinicalFlow({ complaint, answers, channel: "web" });
  const disp = (result as any).disposition ?? "unknown";
  const dx = (result as any).diagnosis ?? (result as any).topDiagnosis ?? "—";
  const conf = (result as any).confidence;
  const confPct = conf !== undefined ? ` (${Math.round(conf * 100)}%)` : "";
  const latency = (result as any).latencyMs ?? "?";

  return [
    `🔬 <b>Simulation: ${complaint}</b>${days ? ` · ${days} days` : ""}`,
    "",
    `Disposition: <b>${disp}</b>`,
    `Diagnosis: <b>${dx}${confPct}</b>`,
    `Latency: ${latency}ms`,
    (result as any).guardrailsTriggered?.length
      ? `\n⚠️ Guardrails: ${(result as any).guardrailsTriggered.join(", ")}`
      : "",
  ].filter(Boolean).join("\n");
}

async function handleLearn(): Promise<string> {
  try {
    const result = await runLearningCycle();
    return `🧠 <b>Learning Cycle Complete</b>\n\nProcessed: ${result.processed} outcomes\nUpdated weights: ${result.updated.length}\n${result.updated.slice(0, 5).join(", ")}`;
  } catch (e: any) {
    return `❌ Learning cycle failed: ${e.message}`;
  }
}

async function handleCircuits(): Promise<string> {
  const states = getAllBreakerStates();
  const lines = Object.entries(states).map(([name, state]) =>
    `${breakerIcon(String(state))} <b>${name}</b>`
  );
  return `⚡ <b>Circuit Breakers</b>\n\n${lines.join("\n")}`;
}

function helpText(): string {
  return [
    "🤖 <b>Bot Command Reference</b>",
    "",
    "/queue — Patient queue (last 10)",
    "/approve {id} — Approve session",
    "/override {id} [note] — Physician override",
    "/health — System health + SLO",
    "/alerts — Control Tower alerts",
    "/simulate {complaint} [{n}d] — Run scenario",
    "/learn — Trigger learning cycle",
    "/circuits — Circuit breaker states",
    "",
    "<i>Admin commands require your chat ID in ALLOWED_TELEGRAM_CHAT_IDS</i>",
  ].join("\n");
}

export async function handleBotCommand(
  text: string,
  chatId: string | number
): Promise<BotReply> {
  const trimmed = text.trim();

  if (!trimmed.startsWith("/")) {
    if (!isChatAllowed(chatId)) return { text: "", handled: false };
    const intent = parseOperatorIntent(trimmed);
    if (intent.action === "unknown" || intent.confidence === "low") return { text: "", handled: false };

    auditCommand(chatId, `[intent:${intent.action}]`, "intent");

    if (!checkRateLimit(chatId, intent.action)) {
      return { text: "⏱️ Rate limit reached. Max 30 commands/minute (5 for heavy ops). Try again shortly.", handled: true };
    }

    let reply: string;
    try {
      switch (intent.action) {
        case "queue": reply = await handleQueue(); break;
        case "approve": reply = intent.target ? await handleApprove(intent.target) : "Could not extract session ID. Try: /approve {id}"; break;
        case "override": reply = intent.target ? await handleOverride(intent.target, intent.args ?? "") : "Could not extract session ID. Try: /override {id}"; break;
        case "health": reply = await handleHealth(); break;
        case "alerts": reply = await handleAlerts(); break;
        case "simulate": reply = await handleSimulate(intent.args ?? "cough"); break;
        case "learn": reply = await handleLearn(); break;
        case "circuits": reply = await handleCircuits(); break;
        case "help": reply = helpText(); break;
        default: return { text: "", handled: false };
      }
    } catch (e: any) {
      reply = `❌ Command failed: ${e.message}`;
    }
    return { text: reply, handled: true };
  }

  const [rawCmd, ...argParts] = trimmed.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const args = argParts.join(" ");

  const ALLOWED_CMDS = new Set(["/help", "/start", "/health", "/alerts", "/circuits", "/simulate", "/queue", "/approve", "/override", "/learn"]);
  if (!ALLOWED_CMDS.has(cmd)) return { text: "", handled: false };

  const ADMIN_CMDS = new Set(["/queue", "/approve", "/override", "/health", "/alerts", "/simulate", "/learn", "/circuits"]);
  if (ADMIN_CMDS.has(cmd) && !isChatAllowed(chatId)) {
    return {
      text: "🔒 Access denied. Your chat ID is not in the operator whitelist.\n\nAsk the admin to add your ID to <code>ALLOWED_TELEGRAM_CHAT_IDS</code>.",
      handled: true,
    };
  }

  if (!checkRateLimit(chatId, cmd)) {
    return { text: "⏱️ Rate limit reached. Max 30 commands/minute (5 for heavy ops: /learn, /simulate). Try again shortly.", handled: true };
  }

  auditCommand(chatId, cmd, "slash");

  let reply: string;

  try {
    switch (cmd) {
      case "/help":
        reply = helpText();
        break;
      case "/queue":
        reply = await handleQueue();
        break;
      case "/approve":
        if (!args) { reply = "Usage: /approve {sessionId}"; break; }
        reply = await handleApprove(args.trim());
        break;
      case "/override": {
        const [sessionId, ...noteParts] = argParts;
        if (!sessionId) { reply = "Usage: /override {sessionId} [note]"; break; }
        reply = await handleOverride(sessionId, noteParts.join(" "));
        break;
      }
      case "/health":
        reply = await handleHealth();
        break;
      case "/alerts":
        reply = await handleAlerts();
        break;
      case "/simulate":
        if (!args) { reply = "Usage: /simulate {complaint} [{n}d]\nExample: /simulate cough 3d"; break; }
        reply = await handleSimulate(args);
        break;
      case "/learn":
        reply = await handleLearn();
        break;
      case "/circuits":
        reply = await handleCircuits();
        break;
      default:
        return { text: "", handled: false };
    }
  } catch (e: any) {
    reply = `❌ Command failed: ${e.message}`;
  }

  return { text: reply, handled: true };
}

export function formatBotCommandsForSMS(text: string): string | null {
  const cmd = text.trim().toLowerCase();
  if (cmd === "/queue") return "queue";
  if (cmd === "/health") return "health";
  if (cmd === "/alerts") return "alerts";
  if (cmd === "/circuits") return "circuits";
  return null;
}

export async function handleSMSCommand(text: string): Promise<string | null> {
  const cmd = text.trim();
  if (!cmd.startsWith("/")) return null;

  const [rawCmd] = cmd.split(/\s+/);
  switch (rawCmd.toLowerCase()) {
    case "/queue": {
      const rows = await getSessions(5, 0);
      if (!rows.length) return "No pending patients.";
      return rows.slice(0, 5).map((r: any) =>
        `${r.id} | ${r.status} | ${r.riskLevel ?? "LOW"}`
      ).join("\n");
    }
    case "/health": {
      const metrics = getMetrics() as any;
      const slo = checkSLO({ p95Latency: metrics.p95Latency, errorRate: metrics.errorRate, totalRequests: metrics.totalRequests });
      return `SLO: ${slo.sloBreached ? "BREACHED" : "OK"} | P95: ${metrics.p95Latency}ms | Err: ${(metrics.errorRate * 100).toFixed(1)}%`;
    }
    case "/alerts": {
      const events = getRecentEvents(20).filter((e) => e.type === "ALERT").slice(-3);
      if (!events.length) return "No active alerts.";
      return events.map((e) => `${e.payload?.source}: ${(e.payload?.alerts ?? []).join(", ")}`).join("\n");
    }
    case "/circuits": {
      const states = getAllBreakerStates();
      return Object.entries(states).map(([k, v]) => `${k}: ${v}`).join(" | ");
    }
    default:
      return null;
  }
}

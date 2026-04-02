import { withRetry } from "../utils/withRetry";
import { logger } from "../utils/logger";

const TELEGRAM_API = "https://api.telegram.org/bot";

const PHI_REDACT_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  /\b(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g,
];

function sanitizeOutboundText(text: string): string {
  let out = text;
  for (const p of PHI_REDACT_PATTERNS) {
    out = out.replace(p, "[REDACTED]");
  }
  return out;
}

interface TelegramSendResult {
  ok: boolean;
  message_id?: number;
  error?: string;
  retries?: number;
}

const _sendAuditLog: Array<{
  ts: string;
  chatId: string | number;
  textLen: number;
  ok: boolean;
  retries: number;
  error?: string;
}> = [];

export function getTelegramSendAuditLog() {
  return [..._sendAuditLog];
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  opts?: { disablePHISanitize?: boolean }
): Promise<TelegramSendResult> {
  const sanitized = opts?.disablePHISanitize ? text : sanitizeOutboundText(text);
  const url = `${TELEGRAM_API}${botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: sanitized,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  let attempts = 0;

  try {
    const result = await withRetry(async () => {
      attempts++;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const json = (await res.json()) as any;

      if (!res.ok || !json.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const err = new Error(`Telegram API error ${res.status}: ${JSON.stringify(json)}`);
        if (!retryable) Object.assign(err, { __noRetry: true });
        throw err;
      }

      return json;
    }, 3, 500);

    _sendAuditLog.push({ ts: new Date().toISOString(), chatId, textLen: text.length, ok: true, retries: attempts - 1 });
    if (_sendAuditLog.length > 500) _sendAuditLog.shift();

    return { ok: true, message_id: result.result?.message_id, retries: attempts - 1 };
  } catch (err: any) {
    const error = err?.message ?? "unknown";
    _sendAuditLog.push({ ts: new Date().toISOString(), chatId, textLen: text.length, ok: false, retries: attempts - 1, error });
    if (_sendAuditLog.length > 500) _sendAuditLog.shift();

    logger.error("telegram_send_failed", { chatId, retries: attempts - 1, error });

    return { ok: false, error, retries: attempts - 1 };
  }
}

export function formatAssistantReplyForTelegram(result: any): string {
  const top = result.differential?.[0];
  const level = result.triage?.level?.toUpperCase() ?? "UNKNOWN";

  const levelIcon =
    level === "CRITICAL" ? "🔴"
    : level === "URGENT" ? "🟠"
    : level === "SEMI-URGENT" ? "🟡"
    : "🟢";

  const dx = result.differential
    ?.slice(0, 3)
    .map((d: any, i: number) => `${i + 1}. ${d.diagnosis} (${Math.round((d.confidence ?? d.score ?? 0) * 100)}%)`)
    .join("\n") ?? "—";

  const questions = result.nextQuestions?.slice(0, 3).map((q: string) => `• ${q}`).join("\n") ?? "—";

  const alerts = result.safetyAlerts
    ?.filter((a: any) => a.severity === "critical")
    .map((a: any) => `⚠️ ${a.message}`)
    .join("\n");

  return [
    `<b>Triage:</b> ${levelIcon} ${level}`,
    `\n<b>Top Differentials:</b>\n${dx}`,
    questions ? `\n<b>Suggested questions:</b>\n${questions}` : "",
    alerts ? `\n<b>⛔ Red flags:</b>\n${alerts}` : "",
    `\n<i>Note: AI triage is a clinical decision support tool only. Not a substitute for physician evaluation.</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

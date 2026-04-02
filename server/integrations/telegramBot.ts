import type { Request, Response } from "express";
import crypto from "crypto";
import { channelConfig } from "../channels/channelConfig";
import { logger } from "../utils/logger";

export type TelegramQuestion = {
  id: string;
  text: string;
  type: "yes_no" | "single_select" | "free_text";
  options?: string[];
};

export function buildTelegramMiniAppSchema(packId: string, title: string, questions: TelegramQuestion[]) {
  return {
    version: "1.0",
    packId,
    title,
    steps: questions.map((q) => ({
      id: q.id,
      label: q.text,
      input: q.type,
      options: q.options ?? [],
    })),
  };
}

const PHI_PATTERNS_TELEGRAM = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(dob|date of birth|born)[\s:]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i,
  /\b(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/,
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,
  /\b(mrn|patient[\s_-]?id)[\s:]+[A-Z0-9\-]+/i,
];

function detectTelegramPHI(text: string): boolean {
  return PHI_PATTERNS_TELEGRAM.some(p => p.test(text));
}

const _chatRateLimits = new Map<number, number[]>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(chatId: number): boolean {
  const now = Date.now();
  const hits = (_chatRateLimits.get(chatId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  _chatRateLimits.set(chatId, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function verifyTelegramWebhookSecret(req: Request): boolean {
  const secret = channelConfig.telegram.webhookSecret;
  if (!secret) return true;
  const token = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  if (!token) return false;
  const expected = crypto.createHmac("sha256", "WebAppData").update(secret).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

const _webhookAuditLog: Array<{
  ts: string;
  updateId: number;
  chatId: number | null;
  type: string;
  text?: string;
  phiDetected: boolean;
  rateLimited: boolean;
  outcome: "processed" | "rate_limited" | "rejected";
}> = [];

const MAX_WEBHOOK_AUDIT = 500;

export function getTelegramWebhookAuditLog() {
  return [..._webhookAuditLog];
}

function auditWebhook(entry: (typeof _webhookAuditLog)[number]) {
  _webhookAuditLog.push(entry);
  if (_webhookAuditLog.length > MAX_WEBHOOK_AUDIT) _webhookAuditLog.shift();
}

function buildAutoReply(text: string, firstName: string): string | null {
  const t = (text || "").trim().toLowerCase();
  if (t === "/start" || t === "/help") {
    return `Hello ${firstName}! I'm the Auralyn clinical triage assistant.\n\nAvailable commands:\n/triage — Start a triage session\n/status — Check system status\n/help — Show this message\n\n<i>This is not a substitute for emergency services. If you have a medical emergency, call 911.</i>`;
  }
  if (t === "/triage") {
    return `To begin triage, please describe your main symptom or concern in one sentence. For example: "I have a sore throat and fever."\n\n<b>Note:</b> Do not send personally identifying information (SSN, date of birth, insurance ID) in this chat.`;
  }
  if (t === "/status") {
    return `Auralyn Triage System — Status: <b>Online</b>\nAll clinical engines are operational.`;
  }
  return null;
}

export async function telegramWebhookHandler(req: Request, res: Response) {
  if (!verifyTelegramWebhookSecret(req)) {
    logger.warn("telegram_webhook_invalid_secret", { ip: req.ip });
    return res.status(403).json({ ok: false, error: "Invalid webhook secret" });
  }

  const update: TelegramUpdate = req.body || {};
  const updateId = update.update_id ?? 0;
  const msg = update.message;
  const chatId = msg?.chat?.id ?? null;
  const text = msg?.text ?? "";
  const firstName = msg?.from?.first_name ?? "there";

  const phiDetected = text ? detectTelegramPHI(text) : false;
  let rateLimited = false;
  let outcome: "processed" | "rate_limited" | "rejected" = "processed";

  if (chatId !== null) {
    rateLimited = isRateLimited(chatId);
    if (rateLimited) {
      outcome = "rate_limited";
      logger.warn("telegram_rate_limited", { chatId, updateId });
    }
  }

  if (phiDetected) {
    logger.warn("telegram_phi_detected_inbound", { updateId, chatId });
  }

  auditWebhook({
    ts: new Date().toISOString(),
    updateId,
    chatId,
    type: msg ? "message" : update.callback_query ? "callback_query" : "unknown",
    text: text.slice(0, 100),
    phiDetected,
    rateLimited,
    outcome,
  });

  if (!rateLimited && chatId !== null && text) {
    const autoReply = buildAutoReply(text, firstName);
    if (autoReply) {
      const { sendTelegramMessage } = await import("./telegramAdapter");
      const token = channelConfig.telegram.botToken;
      if (token) {
        sendTelegramMessage(token, chatId, autoReply).catch((e) =>
          logger.error("telegram_auto_reply_failed", { chatId, error: e?.message })
        );
      }
    }
  }

  return res.json({ ok: true, received: true, updateId });
}

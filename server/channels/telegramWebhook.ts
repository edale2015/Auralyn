import type { Router, Request, Response } from "express";
import { type MessageEvent } from "./messageEvent";
import { processMessage } from "./messageOrchestrator";
import { sendReply } from "./channelAdapter";
import { buildConversationId } from "./messageEvent";
import { getChannelFlags } from "./featureFlags";

function validateTelegramSecret(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = req.headers["x-telegram-bot-api-secret-token"];
  return header === secret;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const rateLimitWindow = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitWindow.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; last_name?: string; username?: string; is_bot: boolean };
    chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
    date: number;
    text?: string;
    caption?: string;
  };
}

function normalizeTelegramUpdate(update: TelegramUpdate): MessageEvent | null {
  const msg = update.message;
  if (!msg) return null;

  if (msg.chat.type !== "private") {
    return null;
  }

  const text = msg.text || msg.caption || "";
  if (!text.trim()) return null;

  return {
    channel: "telegram",
    externalUserId: String(msg.chat.id),
    chatId: String(msg.chat.id),
    text,
    timestamp: new Date(msg.date * 1000).toISOString(),
    messageId: String(msg.message_id),
    rawSignatureVerified: true,
    media: [],
  };
}

export function registerTelegramWebhook(router: Router) {
  router.post("/api/webhooks/telegram", async (req: Request, res: Response) => {
    const flags = getChannelFlags();
    if (!flags.telegramIntakeEnabled) {
      return res.status(200).json({ ok: true, skipped: "telegram_disabled" });
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      console.warn(`[Telegram] Rate limit exceeded for ${clientIp}`);
      return res.status(429).json({ error: "Too many requests" });
    }

    if (!validateTelegramSecret(req)) {
      console.warn("[Telegram] Invalid secret token header");
      return res.status(401).json({ error: "Invalid secret token" });
    }

    res.status(200).json({ ok: true });

    try {
      const update = req.body as TelegramUpdate;
      const event = normalizeTelegramUpdate(update);

      if (!event) {
        if (update.message?.chat?.type !== "private") {
          const chatId = update.message?.chat?.id;
          if (chatId) {
            try {
              const token = process.env.TELEGRAM_BOT_TOKEN;
              if (token) {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: "This bot only works in private (1:1) chats. Please message me directly.",
                  }),
                });
              }
            } catch { /* best effort */ }
          }
        }
        return;
      }

      const result = await processMessage(event);

      if (result.dedupSkipped) return;

      const convId = buildConversationId(event.channel, event.externalUserId);
      for (const reply of result.replies) {
        await sendReply(convId, reply);
      }
    } catch (err: any) {
      console.error("[Telegram] Webhook processing error:", err?.message || err);
    }
  });
}

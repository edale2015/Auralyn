import type { Router } from "express";
import { registerWhatsAppSender } from "./whatsappSender";
import { registerTelegramSender } from "./telegramSender";
import { registerTelegramWebhook } from "./telegramWebhook";
import { getChannelFlags } from "./featureFlags";

export function initChannels(router: Router) {
  const flags = getChannelFlags();

  registerWhatsAppSender();
  console.log(`[Channels] WhatsApp sender registered (intake ${flags.whatsappIntakeEnabled ? "enabled" : "disabled"})`);

  if (process.env.TELEGRAM_BOT_TOKEN) {
    registerTelegramSender();
    registerTelegramWebhook(router);
    console.log(`[Channels] Telegram sender registered (intake ${flags.telegramIntakeEnabled ? "enabled" : "disabled"})`);
  } else {
    console.log("[Channels] Telegram skipped (TELEGRAM_BOT_TOKEN not set)");
  }
}

export { processMessage } from "./messageOrchestrator";
export { sendReply } from "./channelAdapter";
export { getChannelFlags } from "./featureFlags";
export { buildConversationId, parseConversationId } from "./messageEvent";
export type { MessageEvent } from "./messageEvent";
export type { ConversationState } from "./conversationState";

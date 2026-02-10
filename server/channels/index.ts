import type { Router } from "express";
import { registerWhatsAppSender } from "./whatsappSender";
import { registerTelegramSender } from "./telegramSender";
import { registerTelegramWebhook } from "./telegramWebhook";
import { getChannelFlags } from "./featureFlags";
import { initConversationStateStore } from "./conversationState";

export function initChannels(router: Router) {
  const flags = getChannelFlags();

  initConversationStateStore();

  registerWhatsAppSender();
  console.log(`[Channels] WhatsApp sender registered (intake ${flags.whatsappIntakeEnabled ? "enabled" : "disabled"})`);

  if (process.env.TELEGRAM_BOT_TOKEN) {
    registerTelegramSender();
    registerTelegramWebhook(router);
    console.log(`[Channels] Telegram sender registered (intake ${flags.telegramIntakeEnabled ? "enabled" : "disabled"})`);
  } else {
    console.log("[Channels] Telegram skipped (TELEGRAM_BOT_TOKEN not set)");
  }

  if (flags.useOrchestratorWhatsApp) {
    console.log("[Channels] USE_ORCHESTRATOR_WHATSAPP=1: WhatsApp messages will route through unified orchestrator");
  }
}

export { processMessage } from "./messageOrchestrator";
export { sendReply } from "./channelAdapter";
export { getChannelFlags } from "./featureFlags";
export { buildConversationId, parseConversationId } from "./messageEvent";
export type { MessageEvent } from "./messageEvent";
export type { ConversationState } from "./conversationState";

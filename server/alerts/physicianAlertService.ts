import { channelConfig, hasTelegramConfig, hasWhatsAppConfig } from "../channels/channelConfig";
import { generateMobileLink } from "./deepLinks";
import { registerAlertCase } from "./alertResponseHandler";
import type { PhysicianAlertPayload } from "../channels/types";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

const PRIORITY_ICONS: Record<string, string> = {
  immediate: "🔴",
  urgent: "🟠",
  routine: "🟡",
};

export function formatAlert(payload: PhysicianAlertPayload): string {
  const icon = PRIORITY_ICONS[payload.priority ?? "urgent"] ?? "🟠";
  const link = payload.caseId ? generateMobileLink(payload.caseId) : null;
  const riskLine = payload.riskScore !== undefined ? `\nRisk Score: ${(payload.riskScore * 100).toFixed(0)}%` : "";

  let text = `${icon} CLINICAL ALERT\n\nType: ${payload.type}\n`;
  if (payload.caseId) text += `Case: ${payload.caseId}\n`;
  if (payload.channel) text += `Channel: ${payload.channel}\n`;
  text += riskLine;
  text += `\n\n${payload.summary}`;

  if (link) {
    text += `\n\n📱 Open Case:\n${link}`;
  }

  text += `\n\nQuick Actions:\nReply:\n1 = Approve\n2 = Override\n3 = Escalate`;

  return text;
}

async function sendTelegramAlert(chatId: string, text: string): Promise<void> {
  const token = channelConfig.telegram.botToken;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[PhysicianAlert] Telegram send failed: ${res.status} ${body}`);
  }
}

async function sendWhatsAppAlert(to: string, text: string): Promise<void> {
  const { phoneNumberId, accessToken } = channelConfig.whatsapp;
  if (!phoneNumberId || !accessToken || !to) return;

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[PhysicianAlert] WhatsApp send failed: ${res.status} ${body}`);
  }
}

export async function sendPhysicianAlert(payload: PhysicianAlertPayload): Promise<void> {
  auditLog({
    actor: "physician_alert_service",
    action: "alert_dispatched",
    entityType: "alert",
    entityId: payload.caseId ?? "no-case",
    details: { type: payload.type, priority: payload.priority, summary: payload.summary },
  });

  logMetric("physician_alert.sent", 1, "safety");

  if (payload.caseId) {
    registerAlertCase(payload.caseId);
  }

  const message = formatAlert(payload);
  const telegramTarget = channelConfig.physicianAlerts.telegramChatId;
  const whatsappTarget = channelConfig.physicianAlerts.whatsappTo;

  const sends: Promise<void>[] = [];

  if (hasTelegramConfig() && telegramTarget) {
    sends.push(sendTelegramAlert(telegramTarget, message));
  }

  if (hasWhatsAppConfig() && whatsappTarget) {
    sends.push(sendWhatsAppAlert(whatsappTarget, message));
  }

  if (sends.length === 0) {
    console.warn("[PhysicianAlert] No alert channels configured — alert logged only:", payload.summary);
  }

  await Promise.allSettled(sends);
}

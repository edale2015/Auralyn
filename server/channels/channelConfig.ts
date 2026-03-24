export const channelConfig = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    patientWebhookSecret: process.env.TELEGRAM_PATIENT_WEBHOOK_SECRET || "",
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  },
  physicianAlerts: {
    telegramChatId: process.env.PHYSICIAN_ALERT_TELEGRAM_CHAT_ID || "",
    whatsappTo: process.env.PHYSICIAN_ALERT_WHATSAPP_TO || "",
  },
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:5000",
};

export function hasTelegramConfig(): boolean {
  return Boolean(channelConfig.telegram.botToken);
}

export function hasWhatsAppConfig(): boolean {
  return Boolean(channelConfig.whatsapp.accessToken && channelConfig.whatsapp.phoneNumberId);
}

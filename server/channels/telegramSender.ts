import { registerChannelSender, type ChannelSender } from "./channelAdapter";

const TELEGRAM_API_BASE = "https://api.telegram.org";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return token;
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error(`[Telegram] sendMessage failed: ${resp.status} ${body}`);
    throw new Error(`Telegram API error: ${resp.status}`);
  }
}

const telegramSender: ChannelSender = {
  async send(externalUserId: string, text: string): Promise<void> {
    await sendTelegramMessage(externalUserId, text);
  },
};

export function registerTelegramSender() {
  registerChannelSender("telegram", telegramSender);
}

export { sendTelegramMessage };

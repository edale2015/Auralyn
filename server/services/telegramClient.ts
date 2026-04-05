export async function telegramSendMessage(params: {
  botToken: string;
  chatId: number | string;
  text: string;
}) {
  const url = `https://api.telegram.org/bot${params.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
  return res.json();
}

export type InlineButton = { text: string; callback_data: string };

export async function telegramSendKeyboard(params: {
  botToken: string;
  chatId: number | string;
  text: string;
  keyboard: InlineButton[][];
}) {
  const url = `https://api.telegram.org/bot${params.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: params.keyboard,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendKeyboard failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function telegramAnswerCallbackQuery(params: {
  botToken: string;
  callbackQueryId: string;
  text?: string;
}) {
  const url = `https://api.telegram.org/bot${params.botToken}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: params.callbackQueryId,
      text: params.text ?? "",
    }),
  });
}

export async function telegramEditMessageReplyMarkup(params: {
  botToken: string;
  chatId: number | string;
  messageId: number;
}) {
  const url = `https://api.telegram.org/bot${params.botToken}/editMessageReplyMarkup`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: params.chatId,
      message_id: params.messageId,
      reply_markup: { inline_keyboard: [] },
    }),
  }).catch(() => {});
}

export function buildBooleanKeyboard(qId: string): InlineButton[][] {
  return [[
    { text: "✅ Yes", callback_data: `q:${qId}:yes` },
    { text: "❌ No",  callback_data: `q:${qId}:no`  },
  ]];
}

export function buildNumberKeyboard(qId: string, min = 1, max = 10): InlineButton[][] {
  const total = max - min + 1;
  const half = Math.ceil(total / 2);
  const row1: InlineButton[] = [];
  const row2: InlineButton[] = [];
  for (let i = min; i <= min + half - 1; i++) {
    row1.push({ text: String(i), callback_data: `q:${qId}:${i}` });
  }
  for (let i = min + half; i <= max; i++) {
    row2.push({ text: String(i), callback_data: `q:${qId}:${i}` });
  }
  return row2.length ? [row1, row2] : [row1];
}

export function buildEnumKeyboard(qId: string, options: string[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < options.length; i += 2) {
    const row: InlineButton[] = [{ text: options[i], callback_data: `q:${qId}:${options[i]}` }];
    if (options[i + 1]) row.push({ text: options[i + 1], callback_data: `q:${qId}:${options[i + 1]}` });
    rows.push(row);
  }
  return rows;
}

export function buildComplaintKeyboard(complaints: { slug: string; label: string }[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < complaints.length; i += 2) {
    const row: InlineButton[] = [{ text: complaints[i].label, callback_data: `cc:${complaints[i].slug}` }];
    if (complaints[i + 1]) row.push({ text: complaints[i + 1].label, callback_data: `cc:${complaints[i + 1].slug}` });
    rows.push(row);
  }
  return rows;
}

export function buildQuestionKeyboard(qId: string, answerType: string): InlineButton[][] {
  if (answerType === "number") return buildNumberKeyboard(qId);
  return buildBooleanKeyboard(qId);
}

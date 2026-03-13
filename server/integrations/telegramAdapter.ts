const TELEGRAM_API = "https://api.telegram.org/bot"

export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string
): Promise<void> {
  const url = `${TELEGRAM_API}${botToken}/sendMessage`
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram API error ${res.status}: ${err}`)
  }
}

export function formatAssistantReplyForTelegram(result: any): string {
  const top = result.differential?.[0]
  const level = result.triage?.level?.toUpperCase() ?? "UNKNOWN"

  const levelIcon =
    level === "CRITICAL" ? "🔴"
    : level === "URGENT" ? "🟠"
    : level === "SEMI-URGENT" ? "🟡"
    : "🟢"

  const dx = result.differential
    ?.slice(0, 3)
    .map((d: any, i: number) => `${i + 1}. ${d.diagnosis} (${Math.round((d.confidence ?? d.score ?? 0) * 100)}%)`)
    .join("\n") ?? "—"

  const questions = result.nextQuestions?.slice(0, 3).map((q: string) => `• ${q}`).join("\n") ?? "—"

  const alerts = result.safetyAlerts
    ?.filter((a: any) => a.severity === "critical")
    .map((a: any) => `⚠️ ${a.message}`)
    .join("\n")

  return [
    `<b>Triage:</b> ${levelIcon} ${level}`,
    `\n<b>Top Differentials:</b>\n${dx}`,
    questions ? `\n<b>Suggested questions:</b>\n${questions}` : "",
    alerts ? `\n<b>⛔ Red flags:</b>\n${alerts}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

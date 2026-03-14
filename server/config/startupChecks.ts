import { ENV } from "./env"

export type CheckResult = { name: string; ok: boolean; detail: string }

export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push({
    name: "SESSION_SECRET",
    ok: ENV.SESSION_SECRET.length >= 12,
    detail: ENV.SESSION_SECRET.length >= 12 ? "Set" : "Too short or missing",
  })

  results.push({
    name: "OPENAI_API_KEY",
    ok: !!ENV.OPENAI_API_KEY,
    detail: ENV.OPENAI_API_KEY ? "Set" : "Missing — AI features disabled",
  })

  results.push({
    name: "TWILIO_AUTH_TOKEN",
    ok: !!ENV.TWILIO_AUTH_TOKEN,
    detail: ENV.TWILIO_AUTH_TOKEN ? "Set" : "Missing — WhatsApp disabled",
  })

  results.push({
    name: "TELEGRAM_BOT_TOKEN",
    ok: !!ENV.TELEGRAM_BOT_TOKEN,
    detail: ENV.TELEGRAM_BOT_TOKEN ? "Set" : "Missing — Telegram disabled",
  })

  results.push({
    name: "EHR_ENDPOINT",
    ok: !!ENV.EHR_ENDPOINT,
    detail: ENV.EHR_ENDPOINT ? `Configured: ${ENV.EHR_ENDPOINT}` : "Not set — using mock adapter",
  })

  return results
}

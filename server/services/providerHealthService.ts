import { ENV } from "../config/env"

export type ProviderStatus = {
  provider: string
  ok: boolean
  latencyMs?: number
  detail: string
  checkedAt: string
}

export async function checkAllProviders(): Promise<ProviderStatus[]> {
  const results = await Promise.allSettled([
    checkOpenAI(),
    checkTwilio(),
    checkTelegram(),
    checkEhr(),
  ])

  return results.map((r) => (r.status === "fulfilled" ? r.value : {
    provider: "unknown",
    ok: false,
    detail: r.reason?.message ?? "Failed",
    checkedAt: new Date().toISOString(),
  }))
}

async function checkOpenAI(): Promise<ProviderStatus> {
  const t0 = Date.now()
  const ok = !!ENV.OPENAI_API_KEY
  return { provider: "openai", ok, latencyMs: Date.now() - t0, detail: ok ? "Key present" : "Key missing", checkedAt: new Date().toISOString() }
}

async function checkTwilio(): Promise<ProviderStatus> {
  const ok = !!ENV.TWILIO_AUTH_TOKEN
  return { provider: "twilio", ok, detail: ok ? "Token present" : "Token missing", checkedAt: new Date().toISOString() }
}

async function checkTelegram(): Promise<ProviderStatus> {
  const ok = !!ENV.TELEGRAM_BOT_TOKEN
  return { provider: "telegram", ok, detail: ok ? "Token present" : "Token missing", checkedAt: new Date().toISOString() }
}

async function checkEhr(): Promise<ProviderStatus> {
  const ok = !!ENV.EHR_ENDPOINT
  return { provider: "ehr", ok, detail: ok ? `Endpoint: ${ENV.EHR_ENDPOINT}` : "No endpoint configured (mock)", checkedAt: new Date().toISOString() }
}

import { ENV } from "../config/env"
import { withRetry } from "../lib/retry"

export type EhrPayload = {
  caseId: string
  patientId?: string
  encounter?: Record<string, unknown>
  orders?: unknown[]
  notes?: string
}

export type EhrResult = {
  ok: boolean
  ehrId?: string
  error?: string
  provider: string
  sentAt: string
}

export async function sendToEhr(payload: EhrPayload): Promise<EhrResult> {
  if (!ENV.EHR_ENDPOINT) {
    return mockEhrSend(payload)
  }

  return withRetry(
    async () => {
      const res = await fetch(ENV.EHR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": ENV.EHR_API_KEY },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`EHR responded ${res.status}`)
      const data = await res.json()
      return { ok: true, ehrId: data.id, provider: "ecw", sentAt: new Date().toISOString() }
    },
    {
      maxAttempts: ENV.EHR_RETRY_MAX,
      onRetry: (attempt, err) => console.warn(`[EhrAdapter] Retry ${attempt}:`, err.message),
    }
  )
}

function mockEhrSend(payload: EhrPayload): EhrResult {
  return {
    ok: true,
    ehrId: `MOCK-${payload.caseId}-${Date.now()}`,
    provider: "mock",
    sentAt: new Date().toISOString(),
  }
}

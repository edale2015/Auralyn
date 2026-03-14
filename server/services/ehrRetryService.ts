import { listDeadLetters, retryDeadLetter, resolveDeadLetter } from "./ehrDeadLetterService"
import { sendToEhr } from "./ehrAdapter"

export type RetryJobResult = {
  id: string
  caseId: string
  ok: boolean
  ehrId?: string
  error?: string
}

export async function retryDeadLetterEntry(id: string): Promise<RetryJobResult> {
  const entry = retryDeadLetter(id)
  if (!entry) return { id, caseId: "unknown", ok: false, error: "Entry not found or already resolved" }

  try {
    const result = await sendToEhr({ caseId: entry.caseId, ...(entry.payload as object) })
    if (result.ok) {
      resolveDeadLetter(id)
      return { id, caseId: entry.caseId, ok: true, ehrId: result.ehrId }
    }
    return { id, caseId: entry.caseId, ok: false, error: result.error ?? "Unknown EHR error" }
  } catch (err: any) {
    return { id, caseId: entry.caseId, ok: false, error: err.message }
  }
}

export async function retryAllDeadLetters(): Promise<RetryJobResult[]> {
  const entries = listDeadLetters()
  return Promise.all(entries.map((e) => retryDeadLetterEntry(e.id)))
}

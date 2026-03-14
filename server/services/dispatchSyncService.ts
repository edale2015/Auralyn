import { sendToEhr, type EhrPayload } from "./ehrAdapter"
import { addToDeadLetter } from "./ehrDeadLetterService"

export type DispatchRecord = {
  caseId: string
  status: "queued" | "sent" | "failed" | "dead_letter"
  ehrId?: string
  error?: string
  sentAt?: string
  attempts: number
}

const queue: DispatchRecord[] = []

export async function dispatchCase(payload: EhrPayload): Promise<DispatchRecord> {
  const rec: DispatchRecord = { caseId: payload.caseId, status: "queued", attempts: 0 }
  queue.push(rec)

  try {
    rec.attempts++
    const result = await sendToEhr(payload)
    rec.status = result.ok ? "sent" : "failed"
    rec.ehrId = result.ehrId
    rec.sentAt = result.sentAt
  } catch (err: any) {
    rec.status = "dead_letter"
    rec.error = err.message
    addToDeadLetter({ caseId: payload.caseId, error: err.message, payload, createdAt: new Date().toISOString() })
  }

  return rec
}

export function getDispatchQueue(): DispatchRecord[] {
  return [...queue]
}

export function getDispatchRecord(caseId: string): DispatchRecord | undefined {
  return queue.find((r) => r.caseId === caseId)
}

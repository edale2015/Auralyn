import { appendEvent } from "./eventStream"
import type { ClinicalEventType, ClinicalEvent } from "./eventTypes"
import { invalidateState } from "../state/clinicalStateCache"
import { emitToSubscribers } from "./eventSubscriber"

export async function publishEvent(
  caseId: string,
  type: ClinicalEventType | string,
  payload: Record<string, any> = {}
): Promise<ClinicalEvent> {
  const event: ClinicalEvent = {
    caseId,
    type: type as ClinicalEventType,
    payload,
    timestamp: new Date().toISOString(),
  }
  await appendEvent(event)
  invalidateState(caseId)
  emitToSubscribers(event)
  return event
}

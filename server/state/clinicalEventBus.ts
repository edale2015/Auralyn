import { getClinicalState, setClinicalState, type ClinicalEventType } from "./clinicalStateStore";
import { projectEvent } from "./stateProjectionService";
import { appendEvent } from "../core/events/eventStream";

export interface EmitOptions {
  persist?: boolean;
}

export function emitClinicalEvent(
  caseId: string,
  type: ClinicalEventType,
  data: Record<string, any>,
  opts?: EmitOptions
): void {
  const event = { type, timestamp: new Date().toISOString(), data };
  const state = getClinicalState(caseId);
  state.events.push(event);
  projectEvent(caseId, event);
  state.updatedAt = event.timestamp;
  appendEvent({ caseId, type, data, timestamp: event.timestamp }).catch(() => {});
}

export function getEventLog(caseId: string): any[] {
  return getClinicalState(caseId).events ?? [];
}

export function getEventsByType(caseId: string, type: ClinicalEventType): any[] {
  return getClinicalState(caseId).events.filter(e => e.type === type);
}

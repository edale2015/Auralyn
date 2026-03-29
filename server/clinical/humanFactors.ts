import { logEvent } from "../ops/auditEvents";

export type PhysicianAction =
  | "ALERT_VIEWED"
  | "ALERT_DISMISSED"
  | "OVERRIDE_INITIATED"
  | "OVERRIDE_CONFIRMED"
  | "OVERRIDE_CANCELLED"
  | "SUMMARY_READ"
  | "DIFFERENTIAL_EXPANDED"
  | "ER_REFERRAL_ISSUED"
  | "INTAKE_REVIEWED"
  | "RLHF_APPROVED"
  | "RLHF_REJECTED"
  | "PATIENT_EXPLANATION_SENT";

export interface PhysicianInteraction {
  interactionId: string;
  physicianId: string;
  encounterId?: string;
  action: PhysicianAction;
  durationMs?: number;
  success: boolean;
  context?: any;
  timestamp: string;
}

const interactions: PhysicianInteraction[] = [];
const MAX_INTERACTIONS = 2000;

const actionCounts: Record<string, number> = {};
let totalTimeMs = 0;
let successCount = 0;

export function trackPhysicianInteraction(event: {
  physicianId: string;
  encounterId?: string;
  action: PhysicianAction;
  durationMs?: number;
  success?: boolean;
  context?: any;
}): PhysicianInteraction {
  const interaction: PhysicianInteraction = {
    interactionId: `HF-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    physicianId:   event.physicianId,
    encounterId:   event.encounterId,
    action:        event.action,
    durationMs:    event.durationMs,
    success:       event.success ?? true,
    context:       event.context,
    timestamp:     new Date().toISOString(),
  };

  interactions.push(interaction);
  if (interactions.length > MAX_INTERACTIONS) interactions.shift();

  actionCounts[event.action] = (actionCounts[event.action] ?? 0) + 1;
  if (event.durationMs) totalTimeMs += event.durationMs;
  if (event.success ?? true) successCount++;

  logEvent({ type: "PHYSICIAN_INTERACTION", ...interaction });

  return interaction;
}

export function getInteractionHistory(physicianId?: string, limit = 50): PhysicianInteraction[] {
  let list = interactions.slice(-200).reverse();
  if (physicianId) list = list.filter((i) => i.physicianId === physicianId);
  return list.slice(0, limit);
}

export function getActionSummary(): Record<string, number> {
  return { ...actionCounts };
}

export function getHumanFactorsStats() {
  const total = interactions.length;
  return {
    active:               true,
    totalInteractions:    total,
    successRate:          total > 0 ? +((successCount / total) * 100).toFixed(1) : 100,
    avgDurationMs:        total > 0 ? +(totalTimeMs / total).toFixed(0) : 0,
    topAction:            Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    trackedActionTypes:   Object.keys(PHYSICIAN_ACTIONS).length,
  };
}

const PHYSICIAN_ACTIONS: Record<PhysicianAction, true> = {
  ALERT_VIEWED: true, ALERT_DISMISSED: true, OVERRIDE_INITIATED: true,
  OVERRIDE_CONFIRMED: true, OVERRIDE_CANCELLED: true, SUMMARY_READ: true,
  DIFFERENTIAL_EXPANDED: true, ER_REFERRAL_ISSUED: true, INTAKE_REVIEWED: true,
  RLHF_APPROVED: true, RLHF_REJECTED: true, PATIENT_EXPLANATION_SENT: true,
};

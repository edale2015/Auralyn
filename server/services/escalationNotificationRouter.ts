import { createNotification } from "./notificationService";

export type EscalationLevel = "low" | "medium" | "high" | "critical";

export interface EscalationEvent {
  caseId: string;
  level: EscalationLevel;
  reason: string;
  triggeredBy?: string;
}

export function routeEscalation(event: EscalationEvent): void {
  const recipientId = event.level === "critical" ? "admin@example.com" : "physician@example.com";

  createNotification({
    type: "escalation",
    recipientId,
    title: `${event.level.toUpperCase()} Escalation: Case ${event.caseId}`,
    body: event.reason,
    metadata: { caseId: event.caseId, level: event.level, triggeredBy: event.triggeredBy },
  });
}

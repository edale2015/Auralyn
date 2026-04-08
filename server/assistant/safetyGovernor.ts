/**
 * safetyGovernor.ts
 *
 * FDA-grade hard override layer.
 *
 * Safety Governor is the FINAL gate before a result leaves the telemedicine
 * assistant. It cannot be bypassed, disabled, or overridden by any other module.
 *
 * When ANY safety alert is present:
 *   → triage MUST be "emergency"
 *   → urgencyScore MUST be 1.0
 *   → escalation MUST be set to "emergency"
 *   → intervention MUST be "ESCALATE / immediate"
 *
 * This ensures FDA-grade resilience: even if the differential engine,
 * urgency engine, or fusion layer computes a lower risk, safety alerts
 * always dominate.
 */

export interface SafetyGovernorOutput<T extends object> {
  result: T;
  overrideApplied: boolean;
  overrideReason: string | null;
}

export function applySafetyGovernor<T extends {
  safetyAlerts: Array<{ message: string; severity: string }>;
  triage: { level: string; urgencyScore: number; reason: string };
  escalation?: { priority: string; reason: string; topConcerns: string[]; recommendedActions: string[] } | null;
  intervention?: { action: string; urgency: string; message: string; channels: string[] };
}>(result: T): SafetyGovernorOutput<T> {
  const hasSafetyAlerts = result.safetyAlerts.length > 0;

  if (!hasSafetyAlerts) {
    return { result, overrideApplied: false, overrideReason: null };
  }

  const alertMessages = result.safetyAlerts.slice(0, 3).map(a => a.message);
  const overrideReason = `Safety Governor hard override — ${result.safetyAlerts.length} alert(s): ${alertMessages.join("; ")}`;

  const governed: T = {
    ...result,
    triage: {
      level: "emergency",
      urgencyScore: 1.0,
      reason: `SAFETY OVERRIDE: ${alertMessages[0] ?? "Safety alert present"}`,
    },
    escalation: {
      priority: "emergency",
      reason: overrideReason,
      topConcerns: [
        ...alertMessages,
        ...((result.escalation as any)?.topConcerns ?? []),
      ].slice(0, 5),
      recommendedActions: [
        "IMMEDIATE physician evaluation required",
        "Do not delay — safety governor override active",
        "Consider emergency department referral",
        ...((result.escalation as any)?.recommendedActions ?? []),
      ].slice(0, 4),
    },
    intervention: {
      action: "ESCALATE",
      urgency: "immediate",
      message: overrideReason,
      channels: ["physician_alert", "sms", "dashboard", "emergency_log"],
    },
  };

  return { result: governed, overrideApplied: true, overrideReason };
}

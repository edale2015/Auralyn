import { runSystem } from "../brain/fullLoop";
import { checkScope, ScopeCheckResult } from "./scopeGuard";
import { checkEscalation, EscalationResult } from "./escalation";
import { auditLog } from "../security/auditLogger";

export interface PatientFlowInput {
  sessionId?: string;
  patientId?: string;
  complaint?: string;
  complaints?: string[];
  vitals?: Record<string, any>;
  history?: Record<string, any>;
  text?: string;
}

export interface PatientFlowResult {
  status: "self_service_complete" | "physician_required" | "physician_review" | "emergency_911";
  reason?: string;
  scope?: ScopeCheckResult;
  escalation?: EscalationResult;
  plan?: any;
  result?: any;
}

export async function runPatientFlow(input: PatientFlowInput): Promise<PatientFlowResult> {
  const complaint = input.complaint ?? input.complaints?.[0];

  auditLog({
    actor: "patient_flow",
    action: "flow_started",
    patientId: input.patientId,
    details: { complaint },
  });

  const scope = checkScope({ complaint, complaints: input.complaints });

  if (!scope.withinScope) {
    auditLog({
      actor: "patient_flow",
      action: "out_of_scope_blocked",
      patientId: input.patientId,
      details: { complaint, suggestedPath: scope.suggestedPath },
    });
    return {
      status: scope.suggestedPath === "emergency_911" ? "emergency_911" : "physician_required",
      reason: scope.reason,
      scope,
    };
  }

  let result: Awaited<ReturnType<typeof runSystem>>;
  try {
    result = await runSystem({
      id: input.patientId ?? `anon-${Date.now()}`,
      complaints: input.complaints ?? (complaint ? [complaint] : []),
      vitals: input.vitals,
      history: input.history,
      text: input.text,
    });
  } catch (err: any) {
    return { status: "physician_required", reason: `System error: ${err.message}`, scope };
  }

  const riskScore = result.decision?.scores?.overallRisk === "high" ? 0.8
    : result.decision?.scores?.overallRisk === "moderate" ? 0.5 : 0.2;

  const escalation = checkEscalation({
    riskScore,
    requiresPhysicianReview: result.decision?.requiresPhysicianReview,
    overallRisk: result.decision?.scores?.overallRisk,
    patientId: input.patientId,
  });

  if (escalation.needsEscalation) {
    auditLog({
      actor: "patient_flow",
      action: "escalated_to_physician",
      patientId: input.patientId,
      riskScore,
      details: { reason: escalation.reason, priority: escalation.priority },
    });
    return { status: "physician_review", reason: escalation.reason, scope, escalation, result };
  }

  auditLog({
    actor: "patient_flow",
    action: "self_service_completed",
    patientId: input.patientId,
    riskScore,
  });

  return {
    status: "self_service_complete",
    plan: result.decision,
    scope,
    escalation,
    result,
  };
}

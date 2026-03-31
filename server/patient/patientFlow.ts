import { runFinalPipeline, FinalPipelineInput } from "../clinical/finalPipeline";
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
  ageYears?: number;
  isPregnant?: boolean;
}

export interface PipelineTrace {
  pipelineVersion: string;
  durationMs?: number;
  stages: Array<{ stage: string; outcome: string; detail?: string }>;
  safetyTrigger?: string;
}

export interface PatientFlowResult {
  status: "self_service_complete" | "physician_required" | "physician_review" | "emergency_911";
  reason?: string;
  scope?: ScopeCheckResult;
  escalation?: EscalationResult;
  plan?: any;
  result?: any;
  topDiagnosis?: string;
  confidence?: number;
  differential?: Array<{ dx: string; id?: string; score: number; label?: string }>;
  safetyDisposition?: string;
  safetyFlags?: string[];
  physicianSummary?: string;
  pipelineVersion?: string;
  disposition?: string;
  trace?: PipelineTrace;
}

function mapDisposition(disp: string): PatientFlowResult["status"] {
  const d = (disp ?? "").toUpperCase();
  if (d === "ER_NOW" || d === "CALL_911") return "emergency_911";
  if (d === "URGENT_24H")                 return "physician_required";
  if (d === "ROUTINE_72H")               return "physician_review";
  return "self_service_complete";
}

export async function runPatientFlow(input: PatientFlowInput): Promise<PatientFlowResult> {
  const complaint = input.complaint ?? input.complaints?.[0];

  auditLog({ actor: "patient_flow", action: "flow_started", patientId: input.patientId, details: { complaint } });

  // ── 1. Scope guard ───────────────────────────────────────────────────────
  const scope = checkScope({ complaint, complaints: input.complaints });
  if (!scope.withinScope) {
    auditLog({ actor: "patient_flow", action: "out_of_scope_blocked", patientId: input.patientId, details: { complaint } });
    return {
      status: scope.suggestedPath === "emergency_911" ? "emergency_911" : "physician_required",
      reason: scope.reason,
      scope,
      trace: {
        pipelineVersion: "scope_guard_v1",
        stages: [{ stage: "scope_guard", outcome: "BLOCKED", detail: scope.reason }],
      },
    };
  }

  // ── 2. Canonical 9-stage final pipeline ──────────────────────────────────
  const start = Date.now();
  try {
    const fp: FinalPipelineInput = {
      freeText:   input.text ?? (input.complaints ?? []).join(", "),
      complaint,
      symptoms:   input.complaints ?? (complaint ? [complaint] : []),
      vitals:     input.vitals,
      history:    input.history ? Object.keys(input.history).map(k => `${k}=${(input.history as any)[k]}`) : [],
      patientId:  input.patientId,
      ageYears:   input.ageYears ?? (input.history as any)?.age,
      isPregnant: input.isPregnant ?? (input.history as any)?.pregnant ?? false,
    };

    const out = runFinalPipeline(fp);
    const durationMs = Date.now() - start;
    const status = mapDisposition(out.safetyDisposition);

    const trace: PipelineTrace = {
      pipelineVersion: out.pipelineVersion,
      durationMs,
      stages: [
        { stage: "nlp_intake",       outcome: "OK",                                  detail: out.normalizedInput?.complaint ?? complaint },
        { stage: "fusion",           outcome: out.fusionResult ? "TRIGGERED" : "SKIP", detail: out.fusionResult?.suspicion },
        { stage: "hybrid_reasoning", outcome: "OK",                                  detail: `${out.topDiagnosis} @ ${(out.confidence * 100).toFixed(0)}%` },
        { stage: "safety_pipeline",  outcome: (out.safetyFlags ?? []).length ? "FLAGS" : "CLEAR", detail: (out.safetyFlags ?? []).join(", ") || "No flags" },
        { stage: "rlhf_proposal",    outcome: out.rlhfProposal?.accepted ? "ACCEPTED" : "SKIPPED" },
        { stage: "final_disposition",outcome: out.safetyDisposition,                 detail: out.explainability },
      ],
      safetyTrigger: (out.safetyFlags ?? [])[0],
    };

    auditLog({
      actor: "patient_flow",
      action: status === "emergency_911" ? "escalated_911"
            : status === "physician_required" ? "escalated_to_physician"
            : "self_service_completed",
      patientId: input.patientId,
      riskScore: out.confidence,
      details: { disposition: out.safetyDisposition, pipeline: out.pipelineVersion },
    });

    return {
      status,
      reason: out.explainability,
      scope,
      plan: { topDiagnosis: out.topDiagnosis, confidence: out.confidence, differential: out.differential, safetyFlags: out.safetyFlags, recommendation: out.safetyDisposition },
      result: out,
      topDiagnosis:     out.topDiagnosis,
      confidence:       out.confidence,
      differential:     out.differential,
      safetyDisposition: out.safetyDisposition,
      safetyFlags:      out.safetyFlags,
      physicianSummary: out.physicianSummary,
      pipelineVersion:  out.pipelineVersion,
      disposition:      out.safetyDisposition,
      trace,
    };
  } catch (finalPipelineErr: any) {
    auditLog({ actor: "patient_flow", action: "final_pipeline_error", patientId: input.patientId, details: { error: finalPipelineErr.message } });
  }

  // ── 3. Fallback to legacy fullLoop (keeps system working if finalPipeline errors) ──
  let legacyResult: Awaited<ReturnType<typeof runSystem>>;
  try {
    legacyResult = await runSystem({
      id: input.patientId ?? `anon-${Date.now()}`,
      complaints: input.complaints ?? (complaint ? [complaint] : []),
      vitals: input.vitals,
      history: input.history,
      text: input.text,
    });
  } catch (err: any) {
    return { status: "physician_required", reason: `System error: ${err.message}`, scope };
  }

  const riskScore = legacyResult.decision?.scores?.overallRisk === "high" ? 0.8
    : legacyResult.decision?.scores?.overallRisk === "moderate" ? 0.5 : 0.2;

  const escalation = checkEscalation({
    riskScore,
    requiresPhysicianReview: legacyResult.decision?.requiresPhysicianReview,
    overallRisk: legacyResult.decision?.scores?.overallRisk,
    patientId: input.patientId,
  });

  if (escalation.needsEscalation) {
    auditLog({ actor: "patient_flow", action: "escalated_to_physician", patientId: input.patientId, riskScore, details: { reason: escalation.reason } });
    return { status: "physician_review", reason: escalation.reason, scope, escalation, result: legacyResult };
  }

  auditLog({ actor: "patient_flow", action: "self_service_completed", patientId: input.patientId, riskScore });
  return { status: "self_service_complete", plan: legacyResult.decision, scope, escalation, result: legacyResult };
}

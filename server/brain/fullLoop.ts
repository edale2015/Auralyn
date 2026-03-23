import { processInput, MultimodalInput } from "../multimodal/multimodalEngine";
import { clinicalReasoning } from "../orchestrator/clinicalFusion";
import { clinicalSafetyGate } from "../clinical/safetyGate";
import { runWorkflow, WorkflowType } from "../workflows/workflowEngine";
import { logOutcome, updateModel, computePerformance } from "../learning/outcomeTracker";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface FullLoopInput extends MultimodalInput {
  id: string;
  complaints?: string[];
  history?: {
    age?: number;
    confusion?: boolean;
    cough?: boolean;
    tonsillarExudate?: boolean;
    tenderNodes?: boolean;
  };
  requestedWorkflow?: WorkflowType;
}

export interface FullLoopResult {
  status: "autonomous_action" | "physician_review" | "safety_blocked";
  decision?: any;
  workflowResult?: any;
  safetyGate?: { allowed: boolean; reason?: string };
  multimodal?: any;
  performanceSummary?: ReturnType<typeof computePerformance>;
  completedAt: string;
}

export async function runSystem(input: FullLoopInput): Promise<FullLoopResult> {
  const start = Date.now();
  auditLog({ actor: "full_loop", action: "system_run_start", patientId: input.id });

  const multimodalData = await processInput({
    text: input.text,
    image: input.image,
    vitals: input.vitals,
    audio: input.audio,
    patientId: input.id,
  });

  const reasoning = await clinicalReasoning({
    patientId: input.id,
    complaints: input.complaints ?? [],
    vitals: input.vitals,
    history: input.history,
  });

  const riskScore = reasoning.scores.overallRisk === "high" ? 0.85
    : reasoning.scores.overallRisk === "moderate" ? 0.55 : 0.25;

  const uncertainty = 1 - (reasoning.scores.centor?.score ?? 0) / 4;

  const safety = clinicalSafetyGate({
    riskScore,
    uncertainty,
    patientId: input.id,
    actorId: "full_loop",
  });

  if (!safety.allowed) {
    logOutcome(input.id, {
      patientId: input.id,
      predicted: reasoning.recommendation,
      physicianOverridden: false,
      riskScore,
    });

    logMetric("full_loop.latency", Date.now() - start, "latency");
    auditLog({ actor: "full_loop", action: "blocked_by_safety_gate", patientId: input.id, riskScore });

    return {
      status: safety.requiredAction === "hard_stop" ? "safety_blocked" : "physician_review",
      decision: reasoning,
      safetyGate: safety,
      multimodal: multimodalData,
      completedAt: new Date().toISOString(),
    };
  }

  let workflowResult: any;
  const workflowType = input.requestedWorkflow
    ?? (input.complaints?.includes("ear_pain") ? "ear"
      : input.complaints?.includes("sore_throat") ? "throat"
      : "triage");

  try {
    workflowResult = await runWorkflow(workflowType as WorkflowType, {
      patientId: input.id,
      vitals: input.vitals,
      riskScore,
    });
  } catch (err: any) {
    console.warn("[FullLoop] Workflow failed:", err.message);
  }

  logOutcome(input.id, {
    patientId: input.id,
    predicted: reasoning.recommendation,
    correct: true,
    riskScore,
  });

  const performance = computePerformance();
  updateModel(performance);

  logMetric("full_loop.latency", Date.now() - start, "latency");
  auditLog({ actor: "full_loop", action: "system_run_complete", patientId: input.id, riskScore });

  return {
    status: "autonomous_action",
    decision: reasoning,
    workflowResult,
    safetyGate: safety,
    multimodal: multimodalData,
    performanceSummary: performance,
    completedAt: new Date().toISOString(),
  };
}

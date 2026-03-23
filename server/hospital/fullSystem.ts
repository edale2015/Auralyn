import { buildTimeline, sampleTimeline, TimelineState } from "../timeline/timelineEngine";
import { predictDeterioration } from "../timeline/predictor";
import { clinicalReasoning } from "../orchestrator/clinicalFusion";
import { clinicalSafetyGate } from "../clinical/safetyGate";
import { runProcedure } from "../procedures/sequencer";
import { strepWorkflow, earInfectionWorkflow, sinusitisWorkflow } from "../procedures/workflows/strep";
import { mapBilling } from "../revenue/billing";
import { trackCase } from "../revenue/revenueTracker";
import { trainLocal } from "../network/localNode";
import { logOutcome } from "../learning/outcomeTracker";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface HospitalSystemInput {
  id: string;
  complaints: string[];
  history?: TimelineState[];
  vitals?: {
    temperature?: number;
    heartRate?: number;
    oxygenSaturation?: number;
    systolicBp?: number;
    respRate?: number;
    urea?: number;
  };
  patientHistory?: {
    age?: number;
    confusion?: boolean;
    cough?: boolean;
    tonsillarExudate?: boolean;
    tenderNodes?: boolean;
  };
  payer?: string;
}

export interface HospitalSystemResult {
  status: "autonomous_action" | "physician_review" | "safety_blocked";
  timeline: ReturnType<typeof buildTimeline>;
  prediction: ReturnType<typeof predictDeterioration>;
  decision?: Awaited<ReturnType<typeof clinicalReasoning>>;
  safetyGate?: ReturnType<typeof clinicalSafetyGate>;
  procedureResult?: Awaited<ReturnType<typeof runProcedure>>;
  billing?: ReturnType<typeof mapBilling>;
  completedAt: string;
}

function selectWorkflow(complaints: string[], recommendation: string) {
  if (complaints.includes("sore_throat")) return { workflow: strepWorkflow, name: "strep" };
  if (complaints.includes("ear_pain")) return { workflow: earInfectionWorkflow, name: "ear_infection" };
  if (complaints.includes("sinus_pain") || complaints.includes("nasal_congestion")) return { workflow: sinusitisWorkflow, name: "sinusitis" };
  return null;
}

export async function runHospitalSystem(input: HospitalSystemInput): Promise<HospitalSystemResult> {
  const start = Date.now();
  auditLog({ actor: "hospital_system", action: "system_run_start", patientId: input.id });

  const historyData: TimelineState[] = input.history?.length
    ? input.history
    : sampleTimeline({ riskScore: 0.3, vitals: input.vitals, symptoms: input.complaints });

  const timeline = buildTimeline(historyData);
  const prediction = predictDeterioration(timeline);

  if (prediction.prediction === "HIGH_RISK_DETERIORATION") {
    auditLog({
      actor: "hospital_system",
      action: "high_risk_escalation",
      patientId: input.id,
      details: { prediction: prediction.prediction, timeframe: prediction.timeframe },
    });
  }

  const decision = await clinicalReasoning({
    patientId: input.id,
    complaints: input.complaints,
    vitals: input.vitals,
    history: input.patientHistory,
  });

  const riskScore = decision.scores.overallRisk === "high" ? 0.85
    : decision.scores.overallRisk === "moderate" ? 0.55 : 0.25;

  const safety = clinicalSafetyGate({ riskScore, patientId: input.id, actorId: "hospital_system" });

  if (!safety.allowed) {
    auditLog({ actor: "hospital_system", action: "blocked_by_safety_gate", patientId: input.id, riskScore });
    return {
      status: "physician_review",
      timeline,
      prediction,
      decision,
      safetyGate: safety,
      completedAt: new Date().toISOString(),
    };
  }

  let procedureResult: Awaited<ReturnType<typeof runProcedure>> | undefined;
  const workflowConfig = selectWorkflow(input.complaints, decision.recommendation);

  if (workflowConfig) {
    procedureResult = await runProcedure(workflowConfig.workflow, {
      patientId: input.id,
      ...input,
    }, workflowConfig.name);
  }

  const billing = mapBilling({
    diagnosis: input.complaints[0],
    complaints: input.complaints,
    recommendation: decision.recommendation,
  });

  trackCase({
    caseId: `case-${input.id}-${Date.now()}`,
    patientId: input.id,
    revenue: billing.totalExpectedReimbursement,
    icd10: billing.primaryDiagnosis,
    cpt: billing.codes[0]?.cpt,
    payer: input.payer,
  });

  trainLocal({
    features: [{ ...input.vitals, riskScore }],
    labels: [decision.recommendation],
  });

  logOutcome(input.id, {
    patientId: input.id,
    predicted: decision.recommendation,
    correct: true,
    riskScore,
  });

  logMetric("hospital_system.latency", Date.now() - start, "latency");
  auditLog({ actor: "hospital_system", action: "system_run_complete", patientId: input.id, riskScore });

  return {
    status: "autonomous_action",
    timeline,
    prediction,
    decision,
    safetyGate: safety,
    procedureResult,
    billing,
    completedAt: new Date().toISOString(),
  };
}

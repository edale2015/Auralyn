import { findSimilarCases } from "../memory/caseMemoryStore";
import { computeSystemRisk } from "../risk/predictiveRiskEngine";
import { detectMalpracticeRisk } from "../risk/malpracticeDetector";
import { enforceGlobalSafety, isForcedEscalation } from "../safety/globalSafety";
import { selectPhysician } from "../routing/loadBalancer";
import { trackEvent } from "../growth/funnelEngine";
import { logCFR11Entry } from "../fda/cfr11AuditLogger";
import { storeCaseMemory } from "../memory/caseMemoryStore";

export interface PipelineInput {
  caseId: string;
  patientId: string;
  complaint: string;
  symptoms: string[];
  age?: number;
  zip?: string;
  source?: string;
  vitals?: {
    oxygenSaturation?: number;
    respiratoryRate?: number;
    heartRate?: number;
    temperature?: number;
  };
  answers?: Record<string, unknown>;
}

export interface PipelineOutput {
  caseId: string;
  memoryMatches: number;
  systemRisk: number;
  malpracticeRisk: number;
  riskTier: string;
  physician: string | null;
  physicianSpecialty: string | null;
  price: number;
  billingCode: string;
  disposition: "routine" | "urgent" | "escalate";
  escalated: false;
  completedAt: string;
  durationMs: number;
}

export interface EscalationOutput {
  caseId: string;
  escalated: true;
  reason: string;
  systemRisk: number;
  malpracticeRisk: number;
  alertSent: boolean;
  completedAt: string;
}

function computeDynamicPrice(opts: {
  systemRisk: number;
  complaint: string;
  basePrice?: number;
}): number {
  const base = opts.basePrice ?? 120;
  const riskMultiplier = 1 + opts.systemRisk * 0.5;
  const complexityMap: Record<string, number> = {
    chest_pain: 1.4,
    shortness_of_breath: 1.3,
    ear_pain: 1.1,
    sore_throat: 1.0,
    cough: 1.0,
    flu_like: 1.0,
    rash: 1.1,
    fever: 1.1,
    sinus: 1.0,
  };
  const complexity = complexityMap[opts.complaint] ?? 1.1;
  return Math.round(base * riskMultiplier * complexity * 100) / 100;
}

function selectBillingCode(complaint: string, systemRisk: number): string {
  if (systemRisk >= 0.6) return "99215";
  if (systemRisk >= 0.4) return "99214";
  const simple = ["sore_throat", "cough", "flu_like", "sinus"];
  return simple.includes(complaint) ? "99213" : "99214";
}

function computeDisposition(
  systemRisk: number,
  malpracticeRisk: number
): "routine" | "urgent" | "escalate" {
  if (systemRisk >= 0.6 || malpracticeRisk >= 0.5) return "escalate";
  if (systemRisk >= 0.35) return "urgent";
  return "routine";
}

async function sendPhysicianAlert(opts: { caseId: string; priority: string; reason: string }): Promise<void> {
  console.error(
    `[MasterPipeline] PHYSICIAN ALERT — caseId=${opts.caseId} priority=${opts.priority}: ${opts.reason}`
  );
}

export async function runFullPipeline(
  input: PipelineInput
): Promise<PipelineOutput | EscalationOutput> {
  const started = Date.now();

  await logCFR11Entry({
    actor: "master_pipeline",
    action: "pipeline_start",
    traceId: `pipeline-${input.caseId}-${started}`,
    entityType: "case",
    entityId: input.caseId,
    details: { complaint: input.complaint, symptoms: input.symptoms },
  });

  const memoryMatches = await findSimilarCases(
    `${input.complaint} ${input.symptoms.join(" ")}`,
    5
  );

  const redFlagList = input.vitals?.oxygenSaturation && input.vitals.oxygenSaturation < 92
    ? ["hypoxia"]
    : input.vitals?.respiratoryRate && input.vitals.respiratoryRate > 25
    ? ["tachypnoea"]
    : [];

  const malpracticeResult = detectMalpracticeRisk({
    caseId: input.caseId,
    complaint: input.complaint,
    diagnosis: input.complaint,
    redFlags: redFlagList,
    protocolDeviation: false,
    physicianOverrides: 0,
    modelConfidence: 0.75,
    riskScore: 0,
    disposition: "telemedicine",
  });

  const systemRiskResult = computeSystemRisk({
    caseId: input.caseId,
    latencyMs: 400,
    errorRate: 0.02,
    overrideRate: 0,
    riskScore: malpracticeResult.malpracticeRisk,
    complaint: input.complaint,
    redFlags: redFlagList.length,
    modelConfidence: 0.75,
    protocolDeviation: false,
  });

  const riskPayload = {
    caseId: input.caseId,
    systemRisk: systemRiskResult.systemRisk,
    malpracticeRisk: malpracticeResult.malpracticeRisk,
    reason: malpracticeResult.triggers?.[0],
  };

  try {
    enforceGlobalSafety(riskPayload);
  } catch (e) {
    if (isForcedEscalation(e)) {
      await sendPhysicianAlert({
        caseId: input.caseId,
        priority: "CRITICAL",
        reason: e.reason,
      });

      await logCFR11Entry({
        actor: "master_pipeline",
        action: "forced_escalation",
        traceId: `escalation-${input.caseId}-${Date.now()}`,
        entityType: "case",
        entityId: input.caseId,
        details: { reason: e.reason, systemRisk: e.risk.systemRisk },
      });

      trackEvent({
        source: (input.source as any) ?? "clinic_flow",
        step: "abandoned",
        zip: input.zip,
        complaint: input.complaint,
        metadata: { escalated: true, reason: "forced_safety" },
      });

      return {
        caseId: input.caseId,
        escalated: true,
        reason: e.reason,
        systemRisk: riskPayload.systemRisk,
        malpracticeRisk: riskPayload.malpracticeRisk,
        alertSent: true,
        completedAt: new Date().toISOString(),
      };
    }
    throw e;
  }

  const physicianResult = selectPhysician({
    caseId: input.caseId,
    complaint: input.complaint,
    requiredSkills: [input.complaint.replace("_", ""), "general"],
    riskScore: riskPayload.systemRisk,
  });

  const price = computeDynamicPrice({
    systemRisk: riskPayload.systemRisk,
    complaint: input.complaint,
  });

  const billingCode = selectBillingCode(input.complaint, riskPayload.systemRisk);
  const disposition = computeDisposition(riskPayload.systemRisk, riskPayload.malpracticeRisk);

  trackEvent({
    source: (input.source as any) ?? "clinic_flow",
    step: "completed",
    zip: input.zip,
    complaint: input.complaint,
    metadata: { disposition, price, billingCode },
  });

  await storeCaseMemory({
    caseId: input.caseId,
    complaint: input.complaint,
    symptoms: input.symptoms,
    disposition,
    riskScore: riskPayload.systemRisk,
    answers: input.answers ?? {},
  });

  await logCFR11Entry({
    actor: "master_pipeline",
    action: "pipeline_complete",
    traceId: `pipeline-${input.caseId}-${Date.now()}`,
    entityType: "case",
    entityId: input.caseId,
    details: {
      disposition,
      price,
      billingCode,
      physicianId: physicianResult?.physician?.id ?? null,
      systemRisk: riskPayload.systemRisk,
    },
  });

  return {
    caseId: input.caseId,
    memoryMatches: memoryMatches.length,
    systemRisk: riskPayload.systemRisk,
    malpracticeRisk: riskPayload.malpracticeRisk,
    riskTier: systemRiskResult.level,
    physician: physicianResult?.physician?.id ?? null,
    physicianSpecialty: physicianResult?.physician?.skills?.[0] ?? null,
    price,
    billingCode,
    disposition,
    escalated: false,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

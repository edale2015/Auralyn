import { runMultimodalFlow } from "../multimodal/orchestrator";
import { selectPhysician, updatePhysicianLoad } from "../routing/loadBalancer";
import { storeCaseMemory, findSimilarCases } from "../memory/caseMemoryStore";
import { upsertRoom } from "../orchestration/roomManager";
import { logCFR11Entry } from "../fda/cfr11AuditLogger";
import { detectMalpracticeRisk } from "../risk/malpracticeDetector";
import { computeSystemRisk } from "../risk/predictiveRiskEngine";
import { trackEvent } from "../growth/funnelEngine";
import { auditLog } from "../security/auditLogger";
import type { OrchestratorInput } from "../multimodal/orchestrator";

const ICD10_MAP: Record<string, string> = {
  sore_throat: "J02.9",
  ear_pain: "H92.09",
  rash: "R21",
  flu_like: "J11.1",
  cough: "R05.9",
  fever: "R50.9",
  sinusitis: "J32.9",
  chest_pain: "R07.9",
};

const CPT_MAP: Record<string, string> = {
  sore_throat: "99213",
  ear_pain: "99213",
  rash: "99214",
  flu_like: "99213",
  cough: "99212",
  fever: "99213",
  sinusitis: "99214",
  chest_pain: "99215",
};

export interface ClinicFlowInput extends OrchestratorInput {
  caseId?: string;
  source?: string;
  zip?: string;
}

export interface ClinicFlowResult {
  caseId: string;
  intake: Awaited<ReturnType<typeof runMultimodalFlow>>;
  disposition: string;
  physicianId?: string;
  physicianName?: string;
  billing: { icd10: string; cpt: string; amount: number };
  followUp: { date: string; type: string };
  malpracticeRisk: { level: string; risk: number };
  systemRisk: { level: string; risk: number };
  similarCases: number;
  latencyMs: number;
}

export async function runClinicFlow(input: ClinicFlowInput): Promise<ClinicFlowResult> {
  const start = Date.now();
  const caseId = input.caseId ?? `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (input.source) {
    trackEvent({ source: input.source, step: "intake", zip: input.zip, caseId, patientId: input.patientId });
  }

  const intake = await runMultimodalFlow(input);
  const complaint = intake.structured?.dominantSignal ?? "general";
  const riskScore = intake.structured?.riskScore ?? 0;

  upsertRoom(caseId, {
    caseId,
    patientId: input.patientId,
    complaint,
    status: riskScore >= 0.7 ? "escalated" : "active",
    riskScore,
    channel: "web",
  });

  const physicianResult = selectPhysician({ caseId, complaint, riskScore });
  if (physicianResult) updatePhysicianLoad(physicianResult.physician.id, 1);

  const disposition =
    riskScore >= 0.8 ? "ER" :
    riskScore >= 0.6 ? "urgent_care" :
    riskScore >= 0.3 ? "telemedicine" :
    "self_care";

  const systemRiskResult = computeSystemRisk({
    caseId,
    latencyMs: Date.now() - start,
    errorRate: 0,
    overrideRate: 0,
    riskScore,
    complaint,
    redFlags: intake.structured?.redFlags?.length ?? 0,
  });

  const malpracticeResult = detectMalpracticeRisk({
    caseId,
    patientId: input.patientId,
    diagnosis: complaint,
    redFlags: intake.structured?.redFlags ?? [],
    disposition: disposition as any,
    protocolDeviation: false,
    riskScore,
  });

  const billing = {
    icd10: ICD10_MAP[complaint] ?? "Z00.00",
    cpt: CPT_MAP[complaint] ?? "99213",
    amount: riskScore >= 0.6 ? 175 : riskScore >= 0.3 ? 120 : 85,
  };

  const followUpDays = riskScore >= 0.6 ? 1 : riskScore >= 0.3 ? 3 : 7;
  const followUp = {
    date: new Date(Date.now() + followUpDays * 86_400_000).toISOString().split("T")[0],
    type: riskScore >= 0.6 ? "in_person" : "virtual_followup",
  };

  const similar = await findSimilarCases(`${complaint} riskScore:${riskScore.toFixed(1)}`);

  await storeCaseMemory({
    caseId,
    patientId: input.patientId,
    complaint,
    diagnosis: complaint,
    disposition,
    riskScore,
    outcome: "pending",
    physicianId: physicianResult?.physician.id,
    context: { billing, followUp },
  });

  logCFR11Entry({
    caseId,
    patientId: input.patientId,
    actor: "clinic_orchestrator",
    action: "clinic_flow_complete",
    decision: disposition,
    riskScore,
    modelVersion: "v1.0",
    reasoning: `Complaint: ${complaint}, risk: ${riskScore.toFixed(2)}, signals: ${intake.structured?.signals?.length ?? 0}`,
    physicianId: physicianResult?.physician.id,
    metadata: { billing, malpracticeLevel: malpracticeResult.level, systemRiskLevel: systemRiskResult.level },
  });

  if (input.source) {
    trackEvent({ source: input.source, step: "completed", zip: input.zip, caseId, patientId: input.patientId });
  }

  if (physicianResult) updatePhysicianLoad(physicianResult.physician.id, -1);

  upsertRoom(caseId, { status: "pending_review" });

  auditLog({
    actor: "clinic_orchestrator",
    action: "flow_complete",
    patientId: input.patientId,
    riskScore,
    details: { caseId, disposition, physicianId: physicianResult?.physician.id, latencyMs: Date.now() - start },
  });

  return {
    caseId,
    intake,
    disposition,
    physicianId: physicianResult?.physician.id,
    physicianName: physicianResult?.physician.name,
    billing,
    followUp,
    malpracticeRisk: { level: malpracticeResult.level, risk: malpracticeResult.malpracticeRisk },
    systemRisk: { level: systemRiskResult.level, risk: systemRiskResult.systemRisk },
    similarCases: similar.length,
    latencyMs: Date.now() - start,
  };
}

export function scheduleFollowUp(caseData: { riskScore?: number }): { date: string; type: string } {
  const days = (caseData.riskScore ?? 0) >= 0.6 ? 1 : 3;
  return {
    date: new Date(Date.now() + days * 86_400_000).toISOString().split("T")[0],
    type: days === 1 ? "in_person" : "virtual_followup",
  };
}

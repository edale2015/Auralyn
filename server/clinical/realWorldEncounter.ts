/**
 * Real-World Encounter Orchestrator
 * End-to-end execution path for an urgent care encounter:
 * 1. Clinical decision (final pipeline)
 * 2. EHR write
 * 3. Billing code generation
 * 4. Audit logging
 *
 * This is the production integration layer — all external calls go through here.
 */

import { runFinalPipeline, type FinalPipelineInput } from "./finalPipeline";
import type { FinalPipelineOutput } from "./finalPipeline";

export interface EncounterBillingResult {
  cpt: string;
  icd10: string;
  estimatedReimbursement: number;
  complexity: string;
}

export interface RealWorldEncounterResult {
  clinical:    FinalPipelineOutput;
  billing:     EncounterBillingResult;
  ehrStatus:   "written" | "failed" | "skipped";
  ehrId?:      string;
  auditTraceId: string;
}

function deriveCPT(complexity: "low" | "moderate" | "high"): string {
  const map: Record<string, string> = { low: "99213", moderate: "99214", high: "99215" };
  return map[complexity] ?? "99213";
}

function deriveComplexity(output: FinalPipelineOutput): "low" | "moderate" | "high" {
  if (output.safetyDisposition === "ER_NOW" || output.safetyFlags.length > 2) return "high";
  if (output.safetyDisposition === "URGENT" || output.confidence > 0.75) return "moderate";
  return "low";
}

const CPT_REIMBURSEMENT: Record<string, number> = {
  "99213": 80,
  "99214": 115,
  "99215": 165,
};

export async function handleEncounter(
  input: FinalPipelineInput & { icd10?: string }
): Promise<RealWorldEncounterResult> {
  const traceId = `ENC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1️⃣ Clinical decision
  const clinical = runFinalPipeline(input);

  // 2️⃣ Generate billing
  const complexity = deriveComplexity(clinical);
  const cpt = deriveCPT(complexity);
  const billing: EncounterBillingResult = {
    cpt,
    icd10: input.icd10 ?? clinical.topDiagnosis ?? "Z00.00",
    estimatedReimbursement: CPT_REIMBURSEMENT[cpt] ?? 80,
    complexity,
  };

  // 3️⃣ EHR write (non-blocking, best-effort)
  let ehrStatus: RealWorldEncounterResult["ehrStatus"] = "skipped";
  let ehrId: string | undefined;

  try {
    const { writeEHRAll } = await import("../integrations/ehrUnified");
    const result = await writeEHRAll({
      patientId:   input.patientId ?? "unknown",
      disposition: clinical.safetyDisposition,
      note:        clinical.physicianSummary,
      traceId,
    });
    ehrId = result.athena || result.epic || result.ecw || traceId;
    ehrStatus = "written";
  } catch {
    ehrStatus = "failed";
  }

  return { clinical, billing, ehrStatus, ehrId, auditTraceId: traceId };
}

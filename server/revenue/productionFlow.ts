import { runFinalPipeline } from "../clinical/finalPipeline";
import { assignCPT } from "../billing/cptRevenue";
import { submitClaim } from "../billing/submitClaim";
import { sendPilotCase } from "../integrations/hospitalPilot";
import { predictDenial } from "./denialPredictor";

export interface ProductionFlowResult {
  patientId: string;
  disposition: string;
  cptCode: string;
  denialRisk: "high" | "low";
  claimSubmitted: boolean;
  hospitalSent: boolean;
}

export async function productionPatientFlow(patient: {
  patientId: string;
  freeText?: string;
  complaint?: string;
  ageYears?: number;
  insurance?: string;
  [key: string]: unknown;
}): Promise<ProductionFlowResult> {
  const triage = runFinalPipeline({
    patientId: patient.patientId,
    freeText: patient.freeText ?? patient.complaint ?? "unknown",
    ageYears: patient.ageYears,
  });

  const disposition = triage.safetyDisposition;
  const cptCode = assignCPT(disposition);

  const denial = predictDenial({
    insurance: patient.insurance,
    cpt: cptCode,
    disposition,
  });

  let claimSubmitted = false;
  try {
    await submitClaim({
      claimId: `CLM-${patient.patientId}-${Date.now()}`,
      patientId: patient.patientId,
      diagnosis: disposition,
      icd10: "R69",
      procedure: cptCode,
      cptDescription: `Disposition: ${disposition}`,
      provider: "Auralyn",
      dateOfService: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      status: "draft",
    });
    claimSubmitted = true;
  } catch {
    claimSubmitted = false;
  }

  let hospitalSent = false;
  try {
    await sendPilotCase({
      patientId: patient.patientId,
      complaint: patient.complaint ?? patient.freeText ?? "unknown",
      disposition,
    });
    hospitalSent = true;
  } catch {
    hospitalSent = false;
  }

  return {
    patientId: patient.patientId,
    disposition,
    cptCode,
    denialRisk: denial.risk,
    claimSubmitted,
    hospitalSent,
  };
}

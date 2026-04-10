import { runFinalPipeline } from "../clinical/finalPipeline";
import { epicFullFlow } from "../integrations/epicFullFlow";
import { submitClaim } from "../billing/submitClaim";
import { predictDenial } from "../revenue/denialPredictor";
import { assignCPT } from "../billing/cptRevenue";
import { broadcast } from "../control/controlBus";

export interface PilotResult {
  patientId: string;
  disposition: string;
  cptCode: string;
  denialRisk: "high" | "low";
  claimId: string;
  fhirPushed: boolean;
  traceId?: string;
}

export async function runPilot(
  patient: {
    patientId: string;
    freeText?: string;
    complaint?: string;
    ageYears?: number;
    insurance?: string;
    [key: string]: unknown;
  },
  fhirToken: string
): Promise<PilotResult> {
  const triage = runFinalPipeline({
    patientId: patient.patientId,
    freeText: patient.freeText ?? patient.complaint ?? "unknown",
    ageYears: patient.ageYears,
  });

  const disposition = triage.safetyDisposition;
  let cptCode = assignCPT(disposition);

  const denial = predictDenial({
    insurance: patient.insurance,
    cpt: cptCode,
    disposition,
  });

  if (denial.risk === "high") {
    cptCode = "99284";
  }

  let fhirPushed = false;
  try {
    await epicFullFlow(patient.patientId, patient as any, fhirToken);
    fhirPushed = true;
  } catch {
    fhirPushed = false;
  }

  const claimId = `PILOT-${patient.patientId}-${Date.now()}`;
  await submitClaim({
    claimId,
    patientId: patient.patientId,
    diagnosis: disposition,
    icd10: "R69",
    procedure: cptCode,
    cptDescription: `Pilot triage: ${disposition}`,
    provider: "Auralyn Pilot",
    dateOfService: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    status: "draft",
  });

  const result: PilotResult = {
    patientId: patient.patientId,
    disposition,
    cptCode,
    denialRisk: denial.risk,
    claimId,
    fhirPushed,
    traceId: (triage as any).traceId,
  };

  broadcast("pilot_run", result);
  return result;
}

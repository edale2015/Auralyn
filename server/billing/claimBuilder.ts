import { mapToBilling } from "./codingEngine";

export interface ClaimData {
  claimId: string;
  patientId: string;
  diagnosis: string;
  icd10: string;
  procedure: string;
  cptDescription: string;
  provider: string;
  facility?: string;
  dateOfService: string;
  createdAt: string;
  status: "draft" | "submitted" | "accepted" | "rejected";
}

let claimCounter = 0;

export function buildClaim(
  result: { diagnosis?: string; triage?: string },
  patient: { id: string; provider?: string; facility?: string }
): ClaimData {
  claimCounter++;
  const billing = mapToBilling(
    result.diagnosis || "Unknown",
    result.triage || "routine"
  );

  return {
    claimId: `CLM-${Date.now()}-${claimCounter.toString().padStart(4, "0")}`,
    patientId: patient.id,
    diagnosis: billing.diagnosis,
    icd10: billing.icd10,
    procedure: billing.cpt.code,
    cptDescription: billing.cpt.description,
    provider: patient.provider || "ClinicalBrain Platform",
    facility: patient.facility,
    dateOfService: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    status: "draft",
  };
}

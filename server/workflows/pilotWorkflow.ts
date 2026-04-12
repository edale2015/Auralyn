import { runClinicalWorkflow } from "./clinicalWorkflowEngine";
import { generateCPT } from "../billing/cptEngine";
import { submitEncounter } from "../ehr/ehrOrchestrator";

export type PilotEncounterStatus = "pending_physician_review" | "complete" | "ehr_failed";

export interface PilotEncounterResult {
  status:   PilotEncounterStatus;
  clinical: Awaited<ReturnType<typeof runClinicalWorkflow>>;
  billing?: ReturnType<typeof generateCPT>;
  ehr?:     Awaited<ReturnType<typeof submitEncounter>>;
}

export async function runPilotEncounter(
  input: Parameters<typeof runClinicalWorkflow>[0]
): Promise<PilotEncounterResult> {
  // Step 1: Clinical workflow
  const clinical = await runClinicalWorkflow(input);

  // Step 2: Physician documentation gate (documented flag set by ehr.document tool)
  if (!clinical.documented) {
    return { status: "pending_physician_review", clinical };
  }

  // Step 3: CPT billing
  const billing = generateCPT(clinical);

  // Step 4: EHR submission
  const ehr = await submitEncounter({ ...clinical, billing });

  return {
    status:   ehr.success ? "complete" : "ehr_failed",
    clinical,
    billing,
    ehr,
  };
}

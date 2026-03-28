import { checkFormulary } from "./formulary";
import { validatePrescriptionAuthority } from "./deaGuard";
import { detectInteractions } from "./interactions";

export interface MedSafetyInput {
  clinicId: string;
  payerId?: string;
  currentMeds: string[];
  proposedDrug: string;
  clinicianHasDea?: boolean;
  state?: string;
  patientAge?: number;
}

export interface MedSafetyResult {
  proposedDrug: string;
  riskLevel: "low" | "moderate" | "high";
  safeToProceed: boolean;
  interactions: ReturnType<typeof detectInteractions>;
  formulary: Awaited<ReturnType<typeof checkFormulary>>;
  dea: ReturnType<typeof validatePrescriptionAuthority>;
  summary: string;
}

export async function runMedicationSafetyCheck(input: MedSafetyInput): Promise<MedSafetyResult> {
  const interactions = detectInteractions([...input.currentMeds, input.proposedDrug]);
  const formulary = await checkFormulary(
    input.clinicId,
    input.payerId || "default",
    input.proposedDrug
  );
  const dea = validatePrescriptionAuthority({
    clinicianHasDea: input.clinicianHasDea ?? false,
    state: input.state || "NY",
    drug: input.proposedDrug,
    patientAge: input.patientAge,
  });

  const hasContraindicated = interactions.some((i) => i.severity === "contraindicated");
  const hasHigh = interactions.some((i) => i.severity === "high");

  const riskLevel: MedSafetyResult["riskLevel"] =
    hasContraindicated ? "high" : hasHigh ? "moderate" : "low";

  const safeToProceed =
    dea.allowed &&
    !hasContraindicated &&
    (formulary.covered || formulary.priorAuthRequired);

  const issues: string[] = [];
  if (!dea.allowed) issues.push(`DEA: ${dea.reason}`);
  if (hasContraindicated) issues.push(`Contraindicated interaction: ${interactions.find(i => i.severity === "contraindicated")?.reason}`);
  if (!formulary.covered && !formulary.priorAuthRequired) issues.push(`Not covered by formulary`);
  if (formulary.priorAuthRequired) issues.push(`Prior authorization required`);

  return {
    proposedDrug: input.proposedDrug,
    riskLevel,
    safeToProceed,
    interactions,
    formulary,
    dea,
    summary: issues.length === 0
      ? `${input.proposedDrug} — safe to prescribe`
      : `${input.proposedDrug} — review required: ${issues.join("; ")}`,
  };
}

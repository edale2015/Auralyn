import { getFormularyEntry } from "./formularyService";
import { evaluateRules } from "./medicationRuleRegistry";
import { checkDrugInteractions } from "../clinicalConstraints/drugInteractionChecker";
import { evaluatePatientConstraints } from "../clinicalConstraints/patientConstraintEngine";

export interface MedicationSafetyCheck {
  medicationId: string;
  formularyStatus: "on_formulary" | "off_formulary";
  tier?: string;
  requiresPriorAuth: boolean;
  triggeredRules: { ruleId: string; severity: string; action: string }[];
  interactions: { drug1: string; drug2: string; severity: string }[];
  constraints: { allowed: boolean; warnings: string[]; contraindications: string[] };
  overallSafe: boolean;
}

export function runMedicationSafetyCheck(
  medicationId: string,
  currentMedications: string[],
  patientProfile: any
): MedicationSafetyCheck {
  const entry = getFormularyEntry(medicationId);
  const rules = evaluateRules(medicationId, patientProfile || {});
  const interactions = checkDrugInteractions(currentMedications, medicationId);
  const constraints = evaluatePatientConstraints(patientProfile || {}, medicationId);

  const hasBlockingRule = rules.some((r) => r.severity === "block");
  const hasContraindication = interactions.some((i) => i.severity === "contraindicated");

  return {
    medicationId,
    formularyStatus: entry ? "on_formulary" : "off_formulary",
    tier: entry?.tier,
    requiresPriorAuth: entry?.requiresPriorAuth ?? false,
    triggeredRules: rules.map((r) => ({ ruleId: r.ruleId, severity: r.severity, action: r.action })),
    interactions: interactions.map((i) => ({ drug1: i.drug1, drug2: i.drug2, severity: i.severity })),
    constraints: { allowed: constraints.allowed, warnings: constraints.warnings, contraindications: constraints.contraindications },
    overallSafe: !hasBlockingRule && !hasContraindication && constraints.allowed,
  };
}

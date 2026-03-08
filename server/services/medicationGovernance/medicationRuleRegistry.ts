export interface MedicationRule {
  ruleId: string;
  medicationId: string;
  type: "contraindication" | "dose_limit" | "duration_limit" | "monitoring" | "age_restriction";
  condition: string;
  action: string;
  severity: "info" | "warning" | "block";
}

const rules: MedicationRule[] = [
  { ruleId: "R001", medicationId: "azithromycin", type: "monitoring", condition: "QTc > 470ms", action: "Monitor ECG; consider alternative", severity: "warning" },
  { ruleId: "R002", medicationId: "codeine", type: "age_restriction", condition: "Age < 12", action: "Do not prescribe", severity: "block" },
  { ruleId: "R003", medicationId: "prednisone", type: "duration_limit", condition: "Duration > 10 days", action: "Taper required", severity: "warning" },
  { ruleId: "R004", medicationId: "amoxicillin", type: "contraindication", condition: "Penicillin allergy", action: "Use alternative antibiotic", severity: "block" },
];

export function getRulesForMedication(medicationId: string): MedicationRule[] {
  return rules.filter((r) => r.medicationId === medicationId);
}

export function getAllRules(): MedicationRule[] { return [...rules]; }

export function evaluateRules(medicationId: string, patientContext: Record<string, unknown>): MedicationRule[] {
  return getRulesForMedication(medicationId);
}

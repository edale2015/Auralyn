import { planTemplates } from "../config/planTemplates";

export function validatePlanTemplates() {
  const ids = new Set<string>();
  const issues: string[] = [];

  for (const t of planTemplates) {
    if (!t.key) issues.push("Template missing key");
    if (ids.has(t.key)) issues.push(`Duplicate template key ${t.key}`);
    ids.add(t.key);

    if (!t.diagnosisLabel) issues.push(`Template ${t.key} missing diagnosisLabel`);
    if (!t.patientMessage) issues.push(`Template ${t.key} missing patientMessage`);
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

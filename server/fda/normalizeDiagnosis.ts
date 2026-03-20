import { DIAGNOSIS_LABEL_MAP } from "./diagnosisLabelMap";

export function normalizeDiagnosisLabel(label?: string | null): string {
  if (!label) return "unknown";
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return DIAGNOSIS_LABEL_MAP[key] ?? key;
}

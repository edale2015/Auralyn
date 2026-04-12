/**
 * CPT code generator from clinical workflow output.
 * Separate from the richer codingEngine.ts — this focuses on risk-level-driven E&M coding.
 */

export interface CPTResult {
  code:          string;
  level:         string;
  justification: string;
}

const CPT_MAP: Record<string, { code: string; level: string }> = {
  low:      { code: "99213", level: "Office visit — moderate complexity" },
  moderate: { code: "99214", level: "Office visit — high complexity" },
  high:     { code: "99214", level: "Office visit — high complexity" },
  critical: { code: "99285", level: "ED visit — high complexity (observation)" },
};

export function generateCPT(clinical: {
  riskLevel?:  string;
  diagnosis?:  string;
  disposition?: string;
}): CPTResult {
  const level = clinical.riskLevel ?? "low";
  const entry = CPT_MAP[level] ?? CPT_MAP.low;

  return {
    code:          entry.code,
    level:         entry.level,
    justification: `Risk level: ${level} | Diagnosis: ${clinical.diagnosis ?? "Unknown"} | Disposition: ${clinical.disposition ?? "Unknown"}`,
  };
}

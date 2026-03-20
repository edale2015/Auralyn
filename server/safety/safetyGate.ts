export type SafetyLevel = "LOW" | "MEDIUM" | "HIGH";

export interface SafetyGateResult {
  allowed: boolean;
  level: SafetyLevel;
  reasons: string[];
  blockedAt?: string;
}

export interface SafetyChecks {
  pediatric?: { risk?: string; reason?: string };
  pregnancy?: { risk?: string; reason?: string };
  drug?: string[] | { interactions?: any[]; safe?: boolean };
}

export function runSafetyGate(input: Record<string, any>, safetyChecks: SafetyChecks): SafetyGateResult {
  const reasons: string[] = [];

  if (safetyChecks.pediatric?.risk === "HIGH") {
    reasons.push(`Pediatric high-risk: ${safetyChecks.pediatric.reason || "urgent paediatric condition"}`);
  }

  if (safetyChecks.pregnancy?.risk === "HIGH") {
    reasons.push(`Pregnancy contraindication: ${safetyChecks.pregnancy.reason || "unsafe medication in pregnancy"}`);
  }

  const drugIssues = Array.isArray(safetyChecks.drug) ? safetyChecks.drug : [];
  if (drugIssues.length > 0) {
    reasons.push(`Drug interaction risk: ${drugIssues.slice(0, 3).join(", ")}`);
  }

  if (input.chestPain && (input.age ?? 0) > 50) {
    reasons.push("High-risk chest pain: age >50 with chest pain requires immediate evaluation");
  }

  if ((input.ageYears ?? input.age ?? 99) < 1 && (input.fever || input.temperature > 37.8)) {
    reasons.push("CRITICAL: Infant (<1yr) with fever requires immediate escalation to ED");
  }

  if (input.oxygenSaturation && input.oxygenSaturation < 92) {
    reasons.push(`CRITICAL: Hypoxia detected (SpO₂ ${input.oxygenSaturation}%) — urgent intervention required`);
  }

  if (input.respiratoryRate && input.respiratoryRate > 25) {
    reasons.push(`Tachypnoea (RR ${input.respiratoryRate}/min) — respiratory compromise risk`);
  }

  const level: SafetyLevel =
    reasons.length > 2 ? "HIGH" :
    reasons.length > 0 ? "MEDIUM" :
    "LOW";

  return {
    allowed: level !== "HIGH",
    level,
    reasons,
    blockedAt: level === "HIGH" ? new Date().toISOString() : undefined,
  };
}

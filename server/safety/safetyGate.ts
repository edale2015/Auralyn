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
  let forceCritical = false;

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

  const hasChestPain = !!(input.chestPain || input.chest_pain);
  const hasCardiacSymptom = !!(input.diaphoresis || input.left_arm_radiation || input.leftArmRadiation || input.jaw_pain || input.jawPain);
  if (hasChestPain && hasCardiacSymptom) {
    reasons.push("CRITICAL: Chest pain with cardiac symptoms (diaphoresis/radiation) — possible ACS, call 911");
    forceCritical = true;
  } else if (hasChestPain && (input.age ?? 0) > 50) {
    reasons.push("High-risk chest pain: age >50 with chest pain requires immediate evaluation");
  } else if (hasChestPain && (input.severity === "severe" || input.severity === "10/10")) {
    reasons.push("Severe chest pain requires immediate evaluation");
    forceCritical = true;
  }

  const hasThunderclapHeadache = !!(input.thunderclap_headache || input.thunderclapHeadache);
  const hasNeckStiffness = !!(input.neck_stiffness || input.neckStiffness);
  if (hasThunderclapHeadache) {
    reasons.push("CRITICAL: Thunderclap headache — rule out subarachnoid haemorrhage, call 911");
    forceCritical = true;
  } else if (hasNeckStiffness && input.severity === "severe") {
    reasons.push("CRITICAL: Neck stiffness with severe headache — possible meningitis, emergency evaluation required");
    forceCritical = true;
  }

  if ((input.ageYears ?? input.age ?? 99) < 1 && (input.fever || input.temperature > 37.8)) {
    reasons.push("CRITICAL: Infant (<1yr) with fever requires immediate escalation to ED");
    forceCritical = true;
  }

  if (input.oxygenSaturation && input.oxygenSaturation < 92) {
    reasons.push(`CRITICAL: Hypoxia detected (SpO₂ ${input.oxygenSaturation}%) — urgent intervention required`);
    forceCritical = true;
  }

  if (input.respiratoryRate && input.respiratoryRate > 25) {
    reasons.push(`Tachypnoea (RR ${input.respiratoryRate}/min) — respiratory compromise risk`);
  }

  const level: SafetyLevel =
    forceCritical || reasons.length > 2 ? "HIGH" :
    reasons.length > 0 ? "MEDIUM" :
    "LOW";

  return {
    allowed: level !== "HIGH",
    level,
    reasons,
    blockedAt: level === "HIGH" ? new Date().toISOString() : undefined,
  };
}

/**
 * Risk-Based Scope — dynamic permissions that expand as patient acuity increases
 * LOW → read only · MODERATE → suggest · HIGH → order labs · CRITICAL → escalate
 */

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

const RISK_PERMISSIONS: Record<RiskLevel, string[]> = {
  LOW: [
    "read:patient_data",
  ],
  MODERATE: [
    "read:patient_data",
    "suggest:treatment",
    "suggest:labs",
  ],
  HIGH: [
    "read:patient_data",
    "suggest:treatment",
    "order:labs",
    "send:alert",
  ],
  CRITICAL: [
    "read:patient_data",
    "suggest:treatment",
    "order:labs",
    "send:alert",
    "execute:escalation",
    "submit:orders",
  ],
};

export function getScopeByRisk(level: RiskLevel | string): string[] {
  return RISK_PERMISSIONS[(level as RiskLevel)] ?? RISK_PERMISSIONS.LOW;
}

export function augmentScopeWithRisk(baseScope: { express: string[]; [k: string]: any }, triageLevel: RiskLevel | string) {
  const dynamicPermissions = getScopeByRisk(triageLevel);
  return {
    ...baseScope,
    express: [...new Set([...baseScope.express, ...dynamicPermissions])],
  };
}

export function getRiskLabel(score: number): RiskLevel {
  if (score > 8) return "CRITICAL";
  if (score > 6) return "HIGH";
  if (score > 3) return "MODERATE";
  return "LOW";
}

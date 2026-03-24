import { auditLog } from "../security/auditLogger";

export interface SystemRiskSignal {
  caseId: string;
  latencyMs: number;
  errorRate: number;
  overrideRate: number;
  riskScore: number;
  complaint: string;
  redFlags: number;
  modelConfidence?: number;
  protocolDeviation?: boolean;
}

export interface SystemRiskResult {
  caseId: string;
  systemRisk: number;
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  factors: Record<string, number>;
  recommendation: string;
}

const riskHistory: Array<{ signal: SystemRiskSignal; result: SystemRiskResult; ts: number }> = [];

export function computeSystemRisk(signal: SystemRiskSignal): SystemRiskResult {
  const factors: Record<string, number> = {};

  factors.latency = signal.latencyMs > 5000 ? 0.15 : signal.latencyMs > 2000 ? 0.1 : 0;
  factors.errorRate = signal.errorRate > 0.1 ? 0.25 : signal.errorRate > 0.05 ? 0.15 : 0;
  factors.overrideRate = signal.overrideRate > 0.3 ? 0.3 : signal.overrideRate > 0.2 ? 0.2 : signal.overrideRate > 0.1 ? 0.1 : 0;
  factors.redFlags = signal.redFlags > 3 ? 0.4 : signal.redFlags > 1 ? 0.25 : signal.redFlags > 0 ? 0.15 : 0;
  factors.caseRisk = signal.riskScore * 0.4;
  factors.modelUncertainty = signal.modelConfidence !== undefined ? (1 - signal.modelConfidence) * 0.15 : 0;
  factors.protocolDeviation = signal.protocolDeviation ? 0.2 : 0;

  const systemRisk = Math.min(1, Object.values(factors).reduce((s, v) => s + v, 0));

  const level: SystemRiskResult["level"] =
    systemRisk >= 0.75 ? "CRITICAL" :
    systemRisk >= 0.5 ? "HIGH" :
    systemRisk >= 0.25 ? "MEDIUM" : "LOW";

  const recommendation =
    level === "CRITICAL" ? "Immediate physician review + escalate to ER if indicated" :
    level === "HIGH" ? "Physician review required within 5 minutes" :
    level === "MEDIUM" ? "Flag for physician attention — monitor closely" :
    "Continue standard protocol";

  const result: SystemRiskResult = { caseId: signal.caseId, systemRisk, level, factors, recommendation };

  riskHistory.push({ signal, result, ts: Date.now() });
  if (riskHistory.length > 500) riskHistory.shift();

  auditLog({
    actor: "predictive_risk_engine",
    action: "system_risk_computed",
    entityId: signal.caseId,
    riskScore: systemRisk,
    details: { level, factors, complaint: signal.complaint },
  });

  return result;
}

export function getRiskHistory(limit = 50) {
  return riskHistory.slice(-limit).map((h) => ({ ...h.result, ts: h.ts }));
}

export function getSystemRiskStats() {
  const recent = riskHistory.slice(-100);
  const byLevel = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const h of recent) byLevel[h.result.level]++;
  const avgRisk = recent.length > 0 ? recent.reduce((s, h) => s + h.result.systemRisk, 0) / recent.length : 0;
  return { total: riskHistory.length, recentSamples: recent.length, byLevel, avgRisk: parseFloat(avgRisk.toFixed(3)) };
}

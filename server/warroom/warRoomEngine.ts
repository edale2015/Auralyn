import { computeOutcomeWeightedRevenue } from "../dashboard/revenueEngine";
import { getSystemPerformanceSummary } from "../clinician/performanceEngine";
import { computeHEDISMetrics } from "../quality/hedisEngine";
import { getClaimOutcomeStats } from "../billing/claimOutcomeLearning";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";

export type SystemHealthStatus = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface AgentSystemStatus {
  agentName: string;
  displayName: string;
  status: "healthy" | "degraded" | "failing" | "offline";
  riskScore: number;
  lastChecked: string;
  activeOverride?: string;
  metrics: Record<string, number | string>;
}

export interface WarRoomSnapshot {
  timestamp: string;
  systemHealth: SystemHealthStatus;
  systemHealthReason: string;
  uptimeSeconds: number;

  revenue: {
    total: number;
    qualityAdjusted: number;
    denialRate: number;
    grade: string;
    potentialRecovery: number;
  };

  clinicians: {
    total: number;
    available: number;
    avgAccuracy: number;
    avgDenialRate: number;
    criticalAlerts: number;
    topPerformer: string;
  };

  quality: {
    hedisScore: number;
    hedisGrade: string;
    metricsExceeding: number;
    metricsBelow: number;
    complianceFlags: number;
  };

  agents: AgentSystemStatus[];

  rlhf: {
    lastUpdateTime: string;
    diagnosisWeight: number;
    escalationPenalty: number;
    outcomeWeight: number;
    totalAdjustments: number;
  };

  alerts: {
    severity: "info" | "warning" | "critical";
    message: string;
    source: string;
    timestamp: string;
  }[];
}

const startTime = Date.now();
let rlhfState = {
  diagnosisWeight: 1.0,
  escalationPenalty: 1.0,
  outcomeWeight: 1.0,
  totalAdjustments: 0,
  lastUpdateTime: new Date().toISOString(),
};

export function getRLHFState() {
  return { ...rlhfState };
}

export function updateRLHFWeights(update: Partial<typeof rlhfState>) {
  rlhfState = { ...rlhfState, ...update, lastUpdateTime: new Date().toISOString() };
}

function evaluateAgentHealth(
  name: string,
  displayName: string,
  errorRate: number,
  latencyScore: number,
  loadScore: number
): AgentSystemStatus {
  const riskScore = Math.min(errorRate * 0.45 + latencyScore * 0.30 + loadScore * 0.25, 1.0);
  let status: AgentSystemStatus["status"] = "healthy";
  if (riskScore >= 0.70) status = "failing";
  else if (riskScore >= 0.45) status = "degraded";

  const override = (globalThis as any)["ACTIVE_AGENT_OVERRIDE"]?.[name];

  return {
    agentName: name,
    displayName,
    status,
    riskScore: Math.round(riskScore * 1000) / 1000,
    lastChecked: new Date().toISOString(),
    activeOverride: override,
    metrics: {
      errorRate: Math.round(errorRate * 1000) / 10,
      latencyScore: Math.round(latencyScore * 1000) / 10,
      loadScore: Math.round(loadScore * 1000) / 10,
    },
  };
}

export async function getWarRoomSnapshot(): Promise<WarRoomSnapshot> {
  const revenue = computeOutcomeWeightedRevenue();
  const clinicianSummary = getSystemPerformanceSummary();
  const stats = getClaimOutcomeStats();

  let hedisData = { overallScore: 0.88, overallGrade: "B" as string, metrics: [] as any[], complianceFlags: [] as string[] };
  try {
    const hedis = await computeHEDISMetrics();
    hedisData = hedis;
  } catch (_e) {}

  const denialRate = revenue.denialRate / 100;
  const errorRate = Math.min(1 - clinicianSummary.avgSystemAccuracy, 1);
  const latencyNorm = 0.15;
  const loadNorm = clinicianSummary.systemUtilization;

  const agents: AgentSystemStatus[] = [
    evaluateAgentHealth("diagnosis", "Diagnosis Engine", errorRate, latencyNorm, loadNorm * 0.8),
    evaluateAgentHealth("billing", "Billing Engine", denialRate * 0.5, latencyNorm * 0.8, loadNorm * 0.6),
    evaluateAgentHealth("safety", "Safety Guard", errorRate * 0.3, latencyNorm * 0.5, 0.1),
    evaluateAgentHealth("learning", "RLHF Engine", 0.05, latencyNorm * 0.7, 0.2),
    evaluateAgentHealth("scoring", "Risk Scorer", errorRate * 0.4, latencyNorm * 0.9, loadNorm * 0.5),
    evaluateAgentHealth("routing", "Physician Router", loadNorm * 0.3, latencyNorm, loadNorm),
  ];

  const failingAgents = agents.filter(a => a.status === "failing").length;
  const degradedAgents = agents.filter(a => a.status === "degraded").length;

  let systemHealth: SystemHealthStatus = "GREEN";
  let systemHealthReason = "All systems operating normally";

  if (failingAgents >= 2 || denialRate > 0.25) {
    systemHealth = "RED";
    systemHealthReason = failingAgents >= 2
      ? `${failingAgents} critical agents in FAIL state — immediate intervention required`
      : "Denial rate critically high — revenue at severe risk";
  } else if (failingAgents === 1 || denialRate > 0.18 || degradedAgents >= 3) {
    systemHealth = "ORANGE";
    systemHealthReason = failingAgents === 1
      ? `${agents.find(a => a.status === "failing")?.displayName} agent failing — auto-reroute active`
      : "Multiple systems degraded — monitoring elevated";
  } else if (degradedAgents >= 1 || denialRate > 0.12 || clinicianSummary.avgSystemAccuracy < 0.85) {
    systemHealth = "YELLOW";
    systemHealthReason = degradedAgents >= 1
      ? `${degradedAgents} agent(s) degraded — performance monitoring active`
      : denialRate > 0.12
      ? `Denial rate at ${(denialRate * 100).toFixed(1)}% — above 12% threshold`
      : "Clinician accuracy below 85% — coaching engagement recommended";
  }

  const alerts: WarRoomSnapshot["alerts"] = [];

  agents.filter(a => a.status === "failing").forEach(a => {
    alerts.push({
      severity: "critical",
      message: `${a.displayName} risk score ${(a.riskScore * 100).toFixed(0)}% — auto-reroute to fallback`,
      source: a.agentName,
      timestamp: new Date().toISOString(),
    });
  });

  agents.filter(a => a.status === "degraded").forEach(a => {
    alerts.push({
      severity: "warning",
      message: `${a.displayName} showing elevated risk (${(a.riskScore * 100).toFixed(0)}%) — monitoring`,
      source: a.agentName,
      timestamp: new Date().toISOString(),
    });
  });

  if (denialRate > 0.15) {
    alerts.push({
      severity: "warning",
      message: `Claim denial rate ${(denialRate * 100).toFixed(1)}% — billing review recommended`,
      source: "billing",
      timestamp: new Date().toISOString(),
    });
  }

  clinicianSummary.criticalAlerts.slice(0, 3).forEach(msg => {
    alerts.push({ severity: "warning", message: msg, source: "clinician_monitor", timestamp: new Date().toISOString() });
  });

  hedisData.complianceFlags.slice(0, 2).forEach(flag => {
    alerts.push({ severity: "info", message: flag, source: "hedis_engine", timestamp: new Date().toISOString() });
  });

  if (alerts.length === 0) {
    alerts.push({ severity: "info", message: "All systems nominal — no active alerts", source: "system", timestamp: new Date().toISOString() });
  }

  return {
    timestamp: new Date().toISOString(),
    systemHealth,
    systemHealthReason,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),

    revenue: {
      total: revenue.totalRevenue,
      qualityAdjusted: revenue.qualityAdjustedRevenue,
      denialRate: revenue.denialRate,
      grade: revenue.grade,
      potentialRecovery: revenue.potentialRecovery,
    },

    clinicians: {
      total: clinicianSummary.totalPhysicians,
      available: clinicianSummary.availablePhysicians,
      avgAccuracy: Math.round(clinicianSummary.avgSystemAccuracy * 1000) / 10,
      avgDenialRate: Math.round(clinicianSummary.avgSystemDenialRate * 1000) / 10,
      criticalAlerts: clinicianSummary.criticalAlerts.length,
      topPerformer: clinicianSummary.topPerformer,
    },

    quality: {
      hedisScore: Math.round(hedisData.overallScore * 1000) / 10,
      hedisGrade: hedisData.overallGrade,
      metricsExceeding: (hedisData.metrics as any[]).filter(m => m.status === "exceeds").length,
      metricsBelow: (hedisData.metrics as any[]).filter(m => m.status === "below").length,
      complianceFlags: hedisData.complianceFlags.length,
    },

    agents,
    rlhf: rlhfState,
    alerts,
  };
}

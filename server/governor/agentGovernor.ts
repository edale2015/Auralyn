import { rerouteDecision, getActiveOverrides, getRerouteLog } from "./rerouter";
import { getClaimOutcomeStats } from "../billing/claimOutcomeLearning";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";
import { getPhysicianRegistry } from "../billing/smartPhysicianRouter";

export type AgentHealth = "healthy" | "degraded" | "failing" | "offline";

export interface AgentStatus {
  agent: string;
  displayName: string;
  health: AgentHealth;
  riskScore: number;
  action: string;
  activeOverride?: string;
  lastEvaluated: string;
  metrics: Record<string, number | string>;
}

export interface GovernorReport {
  timestamp: string;
  agentStatuses: AgentStatus[];
  overallSystemRisk: number;
  rerouteEvents: number;
  activeOverrides: Record<string, string>;
  recommendations: string[];
}

function predictRisk(agentId: string): number {
  const stats = getClaimOutcomeStats();
  const revenue = calculateRevenueMetrics();
  const physicians = getPhysicianRegistry();

  const denialRate = revenue.denialRate ?? stats.denialRate ?? 0.09;
  const errorProxy = 1 - (stats.paidRate || 0.88);
  const loadUtilization = physicians.length > 0
    ? physicians.reduce((s, p) => s + p.currentLoad, 0) / (physicians.reduce((s, p) => s + p.maxLoad, 1))
    : 0.4;

  const agentRiskMap: Record<string, () => number> = {
    diagnosis: () => Math.min(errorProxy * 1.2, 1.0),
    billing: () => Math.min(denialRate * 1.8, 1.0),
    safety: () => Math.min(errorProxy * 0.6, 1.0),
    learning: () => 0.08,
    scoring: () => Math.min(errorProxy * 0.9, 1.0),
    routing: () => Math.min(loadUtilization * 0.8, 1.0),
  };

  const fn = agentRiskMap[agentId];
  return fn ? Math.round(fn() * 1000) / 1000 : 0.1;
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  diagnosis: "Diagnosis Engine",
  billing: "Billing Engine",
  safety: "Safety Guard",
  learning: "RLHF Engine",
  scoring: "Risk Scorer",
  routing: "Physician Router",
};

export async function evaluateAgents(): Promise<AgentStatus[]> {
  const agents = ["diagnosis", "scoring", "billing", "safety", "learning", "routing"];
  const overrides = getActiveOverrides();
  const results: AgentStatus[] = [];

  for (const agent of agents) {
    const risk = predictRisk(agent);

    let health: AgentHealth = "healthy";
    let action = "none";

    if (risk >= 0.70) {
      health = "failing";
      action = "reroute";
      rerouteDecision(agent, `Risk score ${(risk * 100).toFixed(0)}% exceeds 70% threshold`);
    } else if (risk >= 0.45) {
      health = "degraded";
      action = "monitor";
    } else if (risk >= 0.25) {
      health = "degraded";
      action = "watch";
    }

    results.push({
      agent,
      displayName: AGENT_DISPLAY_NAMES[agent] ?? agent,
      health,
      riskScore: risk,
      action,
      activeOverride: overrides[agent],
      lastEvaluated: new Date().toISOString(),
      metrics: {
        riskPct: (risk * 100).toFixed(1),
        status: health,
      },
    });
  }

  return results;
}

export async function getGovernorReport(): Promise<GovernorReport> {
  const agentStatuses = await evaluateAgents();
  const overrides = getActiveOverrides();
  const rerouteEvents = getRerouteLog(100).length;

  const overallSystemRisk = agentStatuses.reduce((s, a) => s + a.riskScore, 0) / agentStatuses.length;

  const recommendations: string[] = [];
  const failing = agentStatuses.filter(a => a.health === "failing");
  const degraded = agentStatuses.filter(a => a.health === "degraded");

  if (failing.length > 0) {
    recommendations.push(`CRITICAL: ${failing.map(a => a.displayName).join(", ")} in failure state — check logs immediately`);
  }
  if (degraded.length > 0) {
    recommendations.push(`WATCH: ${degraded.map(a => a.displayName).join(", ")} degraded — review input data quality`);
  }
  if (Object.keys(overrides).length > 0) {
    recommendations.push(`${Object.keys(overrides).length} agent(s) running on fallback — restore when root cause resolved`);
  }
  if (recommendations.length === 0) {
    recommendations.push("All agents healthy — no action required");
  }

  return {
    timestamp: new Date().toISOString(),
    agentStatuses,
    overallSystemRisk: Math.round(overallSystemRisk * 1000) / 1000,
    rerouteEvents,
    activeOverrides: overrides,
    recommendations,
  };
}

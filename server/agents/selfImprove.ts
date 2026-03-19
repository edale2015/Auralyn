import { getAgentStats } from "./tracking";
import { publish } from "./eventBus";

export interface ImprovementAction {
  agent: string;
  action: string;
  reason: string;
  timestamp: string;
  metric: { successRate: number; runs: number };
}

const improvementLog: ImprovementAction[] = [];
const agentThresholds: Record<string, Record<string, number>> = {};

export function evaluateAndImprove(): ImprovementAction[] {
  const stats = getAgentStats();
  const actions: ImprovementAction[] = [];

  for (const [agent, s] of Object.entries(stats)) {
    if (s.runs < 5) continue;

    if (s.successRate < 60) {
      const action: ImprovementAction = {
        agent,
        action: "threshold_adjustment",
        reason: `Success rate ${s.successRate}% below 60% threshold over ${s.runs} runs`,
        timestamp: new Date().toISOString(),
        metric: { successRate: s.successRate, runs: s.runs },
      };
      actions.push(action);

      if (!agentThresholds[agent]) agentThresholds[agent] = {};
      agentThresholds[agent].conservatism = (agentThresholds[agent].conservatism || 0) + 0.1;

      publish("selfimprove:adjustment", { agent, adjustment: "increased_conservatism" });
    }

    if (s.successRate < 40) {
      actions.push({
        agent,
        action: "escalation_recommended",
        reason: `Critical: ${agent} success rate ${s.successRate}% — recommend disabling or physician-only fallback`,
        timestamp: new Date().toISOString(),
        metric: { successRate: s.successRate, runs: s.runs },
      });
    }

    if (s.avgMs > 5000) {
      actions.push({
        agent,
        action: "performance_warning",
        reason: `Agent ${agent} avg latency ${s.avgMs}ms exceeds 5s — potential timeout risk`,
        timestamp: new Date().toISOString(),
        metric: { successRate: s.successRate, runs: s.runs },
      });
    }
  }

  improvementLog.push(...actions);
  if (improvementLog.length > 500) improvementLog.splice(0, improvementLog.length - 500);

  return actions;
}

export function getImprovementLog(limit = 100): ImprovementAction[] {
  return improvementLog.slice(-limit);
}

export function getAgentThresholds(): Record<string, Record<string, number>> {
  return { ...agentThresholds };
}

export function computeBusinessMetrics(claimData: Array<{ revenue: number; paid: boolean }>): {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  strategy: string;
} {
  const revenue = claimData.reduce((sum, c) => sum + (c.paid ? c.revenue : 0), 0);
  const cost = claimData.length * 0.02;
  const profit = revenue - cost;
  const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) / 100 : 0;

  let strategy: string;
  if (margin < 0.5) strategy = "Reduce compute cost or renegotiate payer contracts — margin critically low";
  else if (margin < 0.7) strategy = "Optimize coding accuracy to reduce denials and improve revenue per claim";
  else if (revenue > 50000) strategy = "Scale marketing and clinic partnerships — strong unit economics";
  else strategy = "Focus on growth — add clinics, expand payer network, increase case volume";

  return { revenue: Math.round(revenue), cost: Math.round(cost * 100) / 100, profit: Math.round(profit * 100) / 100, margin, strategy };
}

let improvementInterval: ReturnType<typeof setInterval> | null = null;

export function startSelfImproveLoop(intervalMs = 60000) {
  if (improvementInterval) return;
  improvementInterval = setInterval(() => evaluateAndImprove(), intervalMs);
}

export function stopSelfImproveLoop() {
  if (improvementInterval) {
    clearInterval(improvementInterval);
    improvementInterval = null;
  }
}

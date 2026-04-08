import { getAgentPerformance } from "./outcomeLearningService";

export function getAdaptiveAgentWeight(agentId: string): number {
  const stats = getAgentPerformance();
  const agent = stats.find(a => a.agentId === agentId);
  if (!agent || agent.total < 5) return 1.0;
  return Math.max(0.2, Math.min(2.5, 1 + agent.score));
}

export function applyAdaptiveWeights<T extends { agentId: string; confidence: number }>(agents: T[]): T[] {
  return agents.map(a => ({
    ...a,
    confidence: Math.min(1, a.confidence * getAdaptiveAgentWeight(a.agentId)),
  }));
}

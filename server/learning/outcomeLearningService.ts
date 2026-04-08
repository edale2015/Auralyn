export type OutcomeLabel = "correct" | "incorrect" | "overtriage" | "undertriage";

export interface OutcomeEvent {
  caseId: string;
  finalDecision: string;
  triageLevel: string;
  actualOutcome: string;
  label: OutcomeLabel;
  winningAgent: string;
  timestamp: number;
}

export interface AgentPerformance {
  agentId: string;
  total: number;
  correct: number;
  incorrect: number;
  overtriage: number;
  undertriage: number;
  score: number;
  lastUpdated: number;
}

const outcomeLog: OutcomeEvent[] = [];
const agentPerformance: Record<string, AgentPerformance> = {};
const MAX_LOG = 1000;

export function recordTelemedOutcome(event: OutcomeEvent): AgentPerformance {
  outcomeLog.push(event);
  if (outcomeLog.length > MAX_LOG) outcomeLog.splice(0, outcomeLog.length - MAX_LOG);

  if (!agentPerformance[event.winningAgent]) {
    agentPerformance[event.winningAgent] = {
      agentId: event.winningAgent, total: 0, correct: 0, incorrect: 0,
      overtriage: 0, undertriage: 0, score: 0.5, lastUpdated: Date.now(),
    };
  }

  const stat = agentPerformance[event.winningAgent];
  stat.total++;
  if (event.label === "correct") stat.correct++;
  else if (event.label === "incorrect") stat.incorrect++;
  else if (event.label === "overtriage") stat.overtriage++;
  else if (event.label === "undertriage") stat.undertriage++;

  stat.score = (stat.correct * 1.0 + stat.overtriage * 0.25 - stat.undertriage * 1.5 - stat.incorrect * 1.0) / stat.total;
  stat.lastUpdated = Date.now();

  return stat;
}

export function getAgentPerformance(): AgentPerformance[] {
  return Object.values(agentPerformance).sort((a, b) => b.score - a.score);
}

export function getOutcomeLog(limit = 100): OutcomeEvent[] {
  return outcomeLog.slice(-limit).reverse();
}

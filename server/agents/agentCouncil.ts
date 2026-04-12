/**
 * Agent Council — lightweight specialist council (ICU + Cardiology + ID)
 * Runs all agents, sorts by confidence, returns top recommendation
 * Feeds into the agent loop and hooks layer.
 */

import { ICUAgent }         from "./icuAgent";
import { CardiologyAgent }  from "./cardiologyAgent";
import { IDAgent }          from "./idAgent";
import type { AgentOutput } from "./icuAgent";

export interface CouncilResult {
  topDecision:   AgentOutput | null;
  allDecisions:  AgentOutput[];
  agentsRan:     number;
  votedFor:      string[];
  consensusLevel:"strong" | "split" | "no_consensus";
}

export function runAgentCouncil(patient: {
  vitals:      any;
  symptoms?:   string[];
  level?:      string;
  sepsisRisk?: any;
  history?:    any;
}): CouncilResult {
  const agents = [
    new ICUAgent(),
    new CardiologyAgent(),
    new IDAgent(),
  ];

  const allDecisions: AgentOutput[] = agents
    .map((a) => (a as any).evaluate(patient))
    .filter((d): d is AgentOutput => d !== null)
    .sort((a, b) => b.confidence - a.confidence);

  const topDecision = allDecisions[0] ?? null;

  const votedFor     = [...new Set(allDecisions.map((d) => d.recommendation))];
  const consensusLevel: CouncilResult["consensusLevel"] =
    allDecisions.length === 0  ? "no_consensus" :
    votedFor.length === 1      ? "strong" :
    "split";

  return { topDecision, allDecisions, agentsRan: agents.length, votedFor, consensusLevel };
}

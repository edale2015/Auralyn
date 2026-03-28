import { getLastCycles } from "../learning/selfLearningEngine";
import { getSafetySummary } from "../safety/safetyGuard";

export interface EvolutionProposal {
  agent: string;
  change: string;
  reason: string;
  newConfig: Record<string, any>;
  urgency: "low" | "medium" | "high";
}

let lastProposal: EvolutionProposal | null = null;
let lastAnalysisAt: string | null = null;

/**
 * Analyse recent learning cycles and safety data to propose agent improvements.
 * Returns null if the system is healthy and no evolution is warranted.
 */
export function proposeEvolution(): EvolutionProposal | null {
  const cycles        = getLastCycles(10);
  const safetySummary = getSafetySummary();

  lastAnalysisAt = new Date().toISOString();

  // Proposal 1: too many safety blocks → tighten routing threshold
  if (safetySummary.criticalBlocks > 0) {
    lastProposal = {
      agent: "RoutingAgent",
      change: "lower_risk_threshold",
      reason: `${safetySummary.criticalBlocks} critical safety blocks detected — tightening routing threshold`,
      newConfig: { riskThreshold: 0.45, requirePhysicianReview: true },
      urgency: "high",
    };
    return lastProposal;
  }

  // Proposal 2: learning cycles processing zero outcomes → increase batch size
  if (cycles.length >= 3) {
    const avgProcessed = cycles.reduce((s, c) => s + c.processed, 0) / cycles.length;
    if (avgProcessed === 0) {
      lastProposal = {
        agent: "LearningAgent",
        change: "increase_batch_size",
        reason: "Self-learning cycles processing 0 outcomes — expanding data window",
        newConfig: { batchSize: 200, lookbackHours: 72 },
        urgency: "medium",
      };
      return lastProposal;
    }

    // Proposal 3: low weight update rate → broaden learning scope
    const avgUpdates = cycles.reduce((s, c) => s + c.weightUpdates, 0) / cycles.length;
    if (avgUpdates < 2 && avgProcessed > 0) {
      lastProposal = {
        agent: "LearningAgent",
        change: "broaden_learning_scope",
        reason: `Low weight update rate (avg ${avgUpdates.toFixed(1)}/cycle) — expanding feature coverage`,
        newConfig: { learningRate: 0.12, minOutcomes: 1 },
        urgency: "low",
      };
      return lastProposal;
    }
  }

  lastProposal = null;
  return null;
}

export function getLastProposal() {
  return { proposal: lastProposal, analyzedAt: lastAnalysisAt };
}

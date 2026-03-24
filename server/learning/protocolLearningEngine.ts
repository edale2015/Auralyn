import { updateWeight, getWeight, getAllWeights } from "./weightStore";
import { auditLog } from "../security/auditLogger";

export interface ProtocolOutcome {
  protocolId: string;
  patientId?: string;
  predicted: string;
  actual: string;
  physicianOverride?: boolean;
  overrideTo?: string;
  confidence?: number;
  features?: Record<string, unknown>;
  timestamp?: number;
}

const outcomeBuffer: ProtocolOutcome[] = [];

function weightKey(protocolId: string, decision: string): string {
  return `protocol:${protocolId}:${decision}`;
}

export function recordOutcome(outcome: ProtocolOutcome): void {
  const o = { ...outcome, timestamp: outcome.timestamp ?? Date.now() };
  outcomeBuffer.push(o);

  const key = weightKey(o.protocolId, o.predicted);

  if (o.predicted === o.actual) {
    updateWeight(key, 0.1);
  } else {
    updateWeight(key, -0.2);
  }

  if (o.physicianOverride) {
    updateWeight(key, -0.3);
    if (o.overrideTo) {
      updateWeight(weightKey(o.protocolId, o.overrideTo), 0.2);
    }
  }

  auditLog({
    actor: "protocol_learning_engine",
    action: "outcome_recorded",
    patientId: o.patientId,
    details: {
      protocolId: o.protocolId,
      predicted: o.predicted,
      actual: o.actual,
      physicianOverride: o.physicianOverride ?? false,
      weight: getProtocolWeight(o.protocolId, o.predicted),
    },
  });
}

export function getProtocolWeight(protocolId: string, decision: string): number {
  return getWeight(weightKey(protocolId, decision));
}

export function applyWeightedScore(
  baseScore: number,
  protocolId: string,
  decision: string,
  threshold: number
): { adjusted: number; decision: string; confident: boolean } {
  const w = getProtocolWeight(protocolId, decision);
  const adjusted = baseScore * w;
  return {
    adjusted,
    decision: adjusted > threshold ? decision : "insufficient_confidence",
    confident: adjusted > threshold,
  };
}

export function getProtocolAccuracy(protocolId: string): { correct: number; total: number; accuracy: number; overrides: number } {
  const relevant = outcomeBuffer.filter((o) => o.protocolId === protocolId);
  const correct = relevant.filter((o) => o.predicted === o.actual).length;
  const overrides = relevant.filter((o) => o.physicianOverride).length;
  return {
    correct,
    total: relevant.length,
    accuracy: relevant.length > 0 ? correct / relevant.length : 0,
    overrides,
  };
}

export function getAllProtocolStats(): Record<string, ReturnType<typeof getProtocolAccuracy>> {
  const ids = [...new Set(outcomeBuffer.map((o) => o.protocolId))];
  return Object.fromEntries(ids.map((id) => [id, getProtocolAccuracy(id)]));
}

export function getRecentOutcomes(limit = 50): ProtocolOutcome[] {
  return outcomeBuffer.slice(-limit);
}

export function runLearningCycle(): { processed: number; weights: Record<string, number> } {
  const recent = outcomeBuffer.slice(-100);
  let processed = 0;

  for (const o of recent) {
    const key = weightKey(o.protocolId, o.predicted);
    const drift = o.predicted !== o.actual ? -0.05 : 0.02;
    updateWeight(key, drift);
    processed++;
  }

  auditLog({
    actor: "protocol_learning_engine",
    action: "learning_cycle_complete",
    details: { processed, totalOutcomes: outcomeBuffer.length },
  });

  return { processed, weights: getAllWeights() };
}

/**
 * Recommendation #2 — Debate Outcome Recorder
 *
 * Closes the Phase 9 self-improvement loop:
 *   1. After a case resolves (actual diagnosis known), call recordDebateResolution()
 *   2. This updates each debate agent's EMA accuracy in Redis
 *   3. Records the resolution as a ClinicalOutcome so the learning pipeline sees it
 *   4. Emits a DEBATE_RESOLVED event to the Control Tower
 *
 * Without this, the debate engine's agent weights never learn from real cases.
 */

import { recordOutcome }      from "../../outcomes/outcomeTracker";
import { updateAgentAccuracy } from "./debateEngine";
import { emitEvent }           from "../../controlTower/eventBus";
import { getRedisAsync }       from "../../queue/redis";

const REDIS_DEBATE_HISTORY = "phase9:debate_history";  // list of resolved debates

export interface DebateResolution {
  caseId:              string;
  debatedDiagnosis:    string;   // what the debate engine concluded
  actualDiagnosis:     string;   // ground truth from physician
  disposition:         string;
  agentVotes: Array<{
    agent:      string;
    diagnosis:  string;
    wasCorrect: boolean;
  }>;
  resolvedAt:          string;
}

/**
 * Call this when a physician confirms the final diagnosis after a debate-triaged case.
 */
export async function recordDebateResolution(
  caseId:           string,
  debatedDiagnosis: string,
  actualDiagnosis:  string,
  disposition:      string,
  agentVotes: Array<{ agent: string; diagnosis: string }>,
): Promise<DebateResolution> {

  const correct = debatedDiagnosis.toLowerCase() === actualDiagnosis.toLowerCase();

  /* 1. Update individual agent EMA accuracies in Redis */
  const agentResults = agentVotes.map(v => ({
    agent:      v.agent,
    diagnosis:  v.diagnosis,
    wasCorrect: v.diagnosis.toLowerCase() === actualDiagnosis.toLowerCase(),
  }));

  await Promise.all(
    agentResults.map(v => updateAgentAccuracy(v.agent, v.wasCorrect))
  );

  /* 2. Record as a ClinicalOutcome so continuousLearning.ts can learn from it */
  recordOutcome(caseId, debatedDiagnosis, actualDiagnosis, disposition);

  /* 3. Emit to Control Tower for real-time visibility */
  emitEvent({
    type:      "DEBATE_RESOLVED",
    payload:   { caseId, debatedDiagnosis, actualDiagnosis, correct, agentCount: agentVotes.length },
    timestamp: Date.now(),
  });

  const resolution: DebateResolution = {
    caseId,
    debatedDiagnosis,
    actualDiagnosis,
    disposition,
    agentVotes: agentResults,
    resolvedAt: new Date().toISOString(),
  };

  /* 4. Persist to Redis history (capped at 500 entries) */
  const r = await getRedisAsync();
  if (r) {
    try {
      await r.lpush(REDIS_DEBATE_HISTORY, JSON.stringify(resolution));
      await r.ltrim(REDIS_DEBATE_HISTORY, 0, 499);
    } catch { /* non-blocking */ }
  }

  return resolution;
}

export async function getDebateResolutionHistory(limit = 20): Promise<DebateResolution[]> {
  const r = await getRedisAsync();
  if (!r) return [];
  try {
    const items = await r.lrange(REDIS_DEBATE_HISTORY, 0, limit - 1);
    return items.map(i => typeof i === "string" ? JSON.parse(i) : i);
  } catch { return []; }
}

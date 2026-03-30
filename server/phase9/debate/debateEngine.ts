/**
 * Phase 9 — Multi-Agent Debate Engine
 *
 * Three real clinical agents argue over every diagnosis:
 *   1. HybridReasoning Agent  — deterministic fusion + Bayesian differential
 *   2. Bayesian Differential Agent — pure probabilistic from symptom priors
 *   3. Safety Agent           — conservative disposition bias; veto power on ER cases
 *
 * Consensus uses Bayesian model averaging weighted by each agent's historical
 * accuracy (from outcomeTracker) — Recommendation #2 implemented.
 */

import { hybridReasoning }  from "../../clinical/hybridReasoning";
import { runDifferential }  from "../../clinical/bayesianEngine";
import { safetyPipeline }   from "../../clinical/safetyPipeline";
import { getOutcomeStats }  from "../../outcomes/outcomeTracker";
import { getRedisAsync }    from "../../queue/redis";
import { emitEvent }        from "../../controlTower/eventBus";

export interface AgentOpinion {
  agent:      string;
  role:       "primary_reasoning" | "bayesian_differential" | "safety_veto";
  diagnosis:  string;
  confidence: number;
  disposition: string;
  reasoning:  string;
  differential: Array<{ dx: string; score: number }>;
  historicalAccuracy: number;
}

export interface DebateResult {
  opinions:         AgentOpinion[];
  consensus:        AgentOpinion;
  disagreement:     boolean;
  disagreementType: "diagnosis" | "disposition" | "none";
  safetyVetoed:     boolean;
  confidenceDelta:  number;
  modelAveragedDiagnosis: string;
  modelAveragedConfidence: number;
  debateMs:         number;
  debatedAt:        string;
}

const REDIS_AGENT_ACCURACY_KEY = "phase9:agent_accuracy"; // hash: agent → accuracy

/* ── pull per-agent accuracy from Redis (or use defaults) ──────────────── */
async function getAgentAccuracy(agent: string): Promise<number> {
  const r = await getRedisAsync();
  if (!r) return 0.75;
  try {
    const v = await r.hget(REDIS_AGENT_ACCURACY_KEY, agent);
    return v ? parseFloat(v as string) : 0.75;
  } catch { return 0.75; }
}

async function updateAgentAccuracy(agent: string, correct: boolean): Promise<void> {
  const r = await getRedisAsync();
  if (!r) return;
  try {
    const curr = await getAgentAccuracy(agent);
    // Exponential moving average (α=0.1) — Recommendation #4 temporal decay
    const updated = curr * 0.9 + (correct ? 1 : 0) * 0.1;
    await r.hset(REDIS_AGENT_ACCURACY_KEY, { [agent]: updated.toFixed(4) });
  } catch { /* non-blocking */ }
}

export { updateAgentAccuracy };

/* ── run all three agents in parallel ─────────────────────────────────── */
export async function runDebate(input: {
  symptoms:  string[];
  complaint: string;
  vitals?:   any;
  pregnant?: boolean;
  age?:      number;
}): Promise<DebateResult> {
  const start = Date.now();

  /* Agent 1: Hybrid Reasoning (fusion + Bayesian) */
  const hybrid = hybridReasoning({ symptoms: input.symptoms, complaint: input.complaint, vitals: input.vitals });

  /* Agent 2: Pure Bayesian Differential */
  const bayesDiff = runDifferential(input.symptoms);
  const topBayes  = bayesDiff[0] ?? { diagnosis: "undifferentiated", posterior: 0.5 };

  /* Agent 3: Safety Pipeline */
  const safety = safetyPipeline({
    symptoms:           input.symptoms,
    vitals:             input.vitals,
    pregnant:           input.pregnant ?? false,
    age:                input.age ?? 35,
    suicidalIdeation:   false,
    complaint:          input.complaint,
  });

  /* Fetch historical accuracies (parallel) */
  const [acc1, acc2, acc3] = await Promise.all([
    getAgentAccuracy("hybrid_reasoning"),
    getAgentAccuracy("bayesian_differential"),
    getAgentAccuracy("safety_agent"),
  ]);

  const opinions: AgentOpinion[] = [
    {
      agent:       "hybrid_reasoning",
      role:        "primary_reasoning",
      diagnosis:   hybrid.topDiagnosis,
      confidence:  hybrid.confidence,
      disposition: safety.disposition ?? "TELEMEDICINE",
      reasoning:   hybrid.explainability ?? `Hybrid reasoning: ${hybrid.topDiagnosis}`,
      differential: hybrid.differential.slice(0, 3).map(d => ({ dx: d.dx, score: d.score })),
      historicalAccuracy: acc1,
    },
    {
      agent:       "bayesian_differential",
      role:        "bayesian_differential",
      diagnosis:   topBayes.diagnosis,
      confidence:  topBayes.posterior,
      disposition: topBayes.posterior > 0.8 ? "TELEMEDICINE" : "MONITOR",
      reasoning:   `Bayesian: top posterior = ${(topBayes.posterior * 100).toFixed(1)}% for ${topBayes.diagnosis}`,
      differential: bayesDiff.slice(0, 3).map(d => ({ dx: d.diagnosis, score: d.posterior })),
      historicalAccuracy: acc2,
    },
    {
      agent:       "safety_agent",
      role:        "safety_veto",
      diagnosis:   input.complaint,
      confidence:  0.95,
      disposition: safety.disposition ?? "MONITOR",
      reasoning:   safety.flags?.length
        ? `Safety flags: ${safety.flags.join(", ")}`
        : "No critical safety flags detected",
      differential: [],
      historicalAccuracy: acc3,
    },
  ];

  /* Safety veto: if safety agent says ER_NOW, it overrides all others */
  const safetyVetoed = safety.disposition === "ER_NOW" || safety.disposition === "ER_URGENT";

  /* Bayesian model averaging — Recommendation #2 */
  const totalWeight = opinions.reduce((s, o) => s + o.historicalAccuracy, 0);
  const weightedVotes: Record<string, number> = {};
  for (const op of opinions) {
    const weight = op.historicalAccuracy / totalWeight;
    weightedVotes[op.diagnosis] = (weightedVotes[op.diagnosis] ?? 0) + weight * op.confidence;
  }
  const modelAveragedDiagnosis  = Object.entries(weightedVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? hybrid.topDiagnosis;
  const modelAveragedConfidence = weightedVotes[modelAveragedDiagnosis] ?? hybrid.confidence;

  /* Consensus: safety veto overrides; otherwise model-averaged winner */
  const consensus: AgentOpinion = safetyVetoed
    ? { ...opinions[2], diagnosis: modelAveragedDiagnosis }
    : { ...opinions[0], diagnosis: modelAveragedDiagnosis, confidence: modelAveragedConfidence };

  const diagnosisDisagree   = new Set(opinions.map(o => o.diagnosis)).size > 1;
  const dispositionDisagree = new Set(opinions.map(o => o.disposition)).size > 1;

  const result: DebateResult = {
    opinions,
    consensus,
    disagreement:     diagnosisDisagree || dispositionDisagree,
    disagreementType: diagnosisDisagree ? "diagnosis" : dispositionDisagree ? "disposition" : "none",
    safetyVetoed,
    confidenceDelta: Math.max(...opinions.map(o => o.confidence)) - Math.min(...opinions.map(o => o.confidence)),
    modelAveragedDiagnosis,
    modelAveragedConfidence,
    debateMs:  Date.now() - start,
    debatedAt: new Date().toISOString(),
  };

  /* Recommendation #5 — Real-time WebSocket push via Control Tower event bus
   * Broadcasts debate disagreements so physicians see agent conflicts live. */
  if (result.disagreement || result.safetyVetoed) {
    emitEvent({
      type:      "DEBATE_DISAGREEMENT",
      payload: {
        disagreementType:       result.disagreementType,
        safetyVetoed:           result.safetyVetoed,
        modelAveragedDiagnosis: result.modelAveragedDiagnosis,
        confidenceDelta:        result.confidenceDelta,
        agentCount:             opinions.length,
        complaint:              input.complaint,
      },
      timestamp: Date.now(),
    });
  }

  return result;
}

export async function getDebateAgentStats() {
  const r = await getRedisAsync();
  const accuracies: Record<string, number> = {};
  if (r) {
    try {
      const hash = await r.hgetall(REDIS_AGENT_ACCURACY_KEY);
      for (const [k, v] of Object.entries(hash ?? {})) {
        accuracies[k] = parseFloat(v as string);
      }
    } catch { /* ignore */ }
  }
  const outcomes = getOutcomeStats();
  return { accuracies, outcomes };
}

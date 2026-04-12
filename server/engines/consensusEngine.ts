export interface AgentOpinion {
  agent: string;
  diagnosis: string;
  confidence: number;
  reasoning?: string;
}

export interface ConsensusResult {
  topDiagnosis: string | null;
  topScore: number;
  ranked: { diagnosis: string; score: number; normalizedScore: number }[];
  rawOpinions: AgentOpinion[];
  consensusStrength: "strong" | "moderate" | "weak";
  dissent: boolean;
}

const AGENT_WEIGHTS: Record<string, number> = {
  infectious:  1.2,
  pulmonary:   1.1,
  cardiology:  1.3,
  general:     1.0,
  pediatrics:  1.1,
  emergency:   1.2,
};

export function runConsensus(opinions: AgentOpinion[]): ConsensusResult {
  if (opinions.length === 0) {
    return {
      topDiagnosis: null,
      topScore: 0,
      ranked: [],
      rawOpinions: [],
      consensusStrength: "weak",
      dissent: false,
    };
  }

  const scores: Record<string, number> = {};

  for (const op of opinions) {
    const weight = AGENT_WEIGHTS[op.agent] ?? 1.0;
    const score  = op.confidence * weight;
    scores[op.diagnosis] = (scores[op.diagnosis] ?? 0) + score;
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([diagnosis, score]) => ({
      diagnosis,
      score,
      normalizedScore: Math.round((score / totalScore) * 1000) / 1000,
    }));

  const topScore         = ranked[0]?.score ?? 0;
  const secondScore      = ranked[1]?.score ?? 0;
  const leadMargin       = topScore - secondScore;
  const uniqueDiagnoses  = new Set(opinions.map((o) => o.diagnosis)).size;

  const consensusStrength: ConsensusResult["consensusStrength"] =
    leadMargin > 0.5 * topScore ? "strong"
    : leadMargin > 0.2 * topScore ? "moderate"
    : "weak";

  return {
    topDiagnosis: ranked[0]?.diagnosis ?? null,
    topScore,
    ranked,
    rawOpinions: opinions,
    consensusStrength,
    dissent: uniqueDiagnoses > opinions.length / 2,
  };
}

export function weightedConsensus(
  opinions: AgentOpinion[],
  customWeights: Record<string, number>
): ConsensusResult {
  const weighted = opinions.map((op) => ({
    ...op,
    confidence: op.confidence * (customWeights[op.agent] ?? 1.0),
  }));
  return runConsensus(weighted);
}

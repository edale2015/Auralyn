import { bayesianEngine, computeBayesScore } from "./bayesianEngine";
import { similarityEngine } from "./similarityEngine";
import { getWeight } from "../../learning/weightStore";
import type { EngineScore } from "./bayesianEngine";

export interface HybridScore {
  diagnosis: string;
  baseScore: number;
  bayesScore: number;
  rlhfWeight: number;
  similarityScore: number;
  hybridScore: number;
}

/**
 * Combines four signals into a unified ranking:
 *  1. Static Bayesian prior (symptom→dx map)
 *  2. Adaptive Bayesian learned counts
 *  3. RLHF outcome weights from weightStore
 *  4. Case-similarity (Jaccard) from historical cases
 */
export function computeHybridScores(symptoms: string[]): HybridScore[] {
  const staticScores  = bayesianEngine(symptoms);
  const similarScores = similarityEngine(symptoms);

  const dxSet = new Set([
    ...staticScores.map(e => e.diagnosis),
    ...similarScores.map(e => e.diagnosis),
  ]);

  const simMap: Record<string, number> = {};
  for (const e of similarScores) simMap[e.diagnosis] = e.score;

  return Array.from(dxSet).map(dx => {
    const baseScore       = staticScores.find(e => e.diagnosis === dx)?.score ?? 0;
    const bayesScore      = computeBayesScore(dx, symptoms);
    const rlhfWeight      = getWeight(`dx:${dx}`) ?? 1.0;
    const similarityScore = simMap[dx] ?? 0;

    const hybridScore = (baseScore + 0.5) * bayesScore * rlhfWeight + similarityScore * 0.3;

    return { diagnosis: dx, baseScore, bayesScore, rlhfWeight, similarityScore, hybridScore };
  }).sort((a, b) => b.hybridScore - a.hybridScore);
}

/** Return top-N as EngineScore[] for compatibility with existing engine pipeline */
export function hybridEngine(symptoms: string[], topN = 5): EngineScore[] {
  return computeHybridScores(symptoms)
    .slice(0, topN)
    .map(h => ({ diagnosis: h.diagnosis, score: h.hybridScore }));
}

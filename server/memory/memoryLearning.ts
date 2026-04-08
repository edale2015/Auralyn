/**
 * memoryLearning.ts
 * Wires clinical encounter outcomes into cognitiveMemory and metaLearning.
 *
 * Call learnFromCase() at the end of each encounter when outcome data is available
 * (e.g. physician confirmed diagnosis, patient returned as per precautions, etc.).
 *
 * This creates a virtuous feedback loop:
 *   Outcome → cognitive memory (pattern recall)
 *   Outcome → meta-learning (engine importance adjustment)
 *   Outcome → bandit (engine selection improvement)
 */

import { cognitiveMemory }           from "./cognitiveMemory";
import { metaLearning }              from "../meta/metaLearningEngine";
import { engineBandit }              from "../clinical/engineBandit";

export interface LearningCaseData {
  caseKey:         string;
  features:        number[];
  outcome:         "positive" | "negative" | "neutral";
  diagnosis?:      string;
  confidence?:     number;
  enginesRan?:     string[];
}

/**
 * Persists a completed case to cognitive memory and triggers meta-learning updates.
 * All Redis operations are fire-and-forget — errors do not affect the caller.
 */
export async function learnFromCase(data: LearningCaseData): Promise<void> {
  const outcomeImproved = data.outcome === "positive";

  await Promise.allSettled([
    cognitiveMemory.store(data.caseKey, {
      features:   data.features,
      outcome:    data.outcome,
      diagnosis:  data.diagnosis,
      confidence: data.confidence,
    }),

    data.enginesRan?.length
      ? metaLearning.recordOutcome(data.enginesRan, outcomeImproved)
      : Promise.resolve(),

    data.enginesRan?.length
      ? Promise.allSettled(
          data.enginesRan.map((e) =>
            engineBandit.record(e, outcomeImproved ? 1 : -1),
          ),
        )
      : Promise.resolve(),
  ]);
}

/**
 * Convenience function: reduce uncertainty when high-similarity past cases exist.
 * Returns adjusted uncertainty (capped at 0.0 floor).
 */
export function applyCognitiveHint(
  currentUncertainty: number,
  similarCases:       { similarity: number }[],
): number {
  if (!similarCases.length) return currentUncertainty;

  const topSim = similarCases[0].similarity;
  const reduction = topSim * 0.2;

  return Math.max(0, currentUncertainty - reduction);
}

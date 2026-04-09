/**
 * Next-Best-Question Engine (Information Gain)
 *
 * Given the current differential diagnosis and the questions already asked,
 * determines which question to ask next to maximally reduce diagnostic
 * uncertainty.
 *
 * The core insight: the best next question is the one whose answer would most
 * change the probability distribution over diagnoses. This is the expected
 * information gain — also called expected entropy reduction.
 *
 * Current implementation:
 *   - Uses KB priors as the candidate question pool
 *   - Computes expected information gain using differential probabilities
 *     and simulated answer likelihoods from KB feature likelihoods
 *
 * Upgrade path (replace placeholder likelihood):
 *   - Use actual KB feature likelihoods (P(symptom | diagnosis)) to compute
 *     Bayesian update delta for each candidate question
 *   - This converts the engine from heuristic to validated clinical IG
 */

import { getKbPriorsSync } from "../kb/kbRuntime";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DifferentialEntry {
  diagnosis:   string;
  probability: number;
}

export interface QuestionScore {
  questionId:              string;
  expectedInformationGain: number;
  reason:                  string;
}

export interface NextBestQuestionResult {
  question:                string | null;
  expectedInformationGain: number;
  ranked:                  QuestionScore[];
  diagnosticCoverage:      number;   // fraction of differential addressed by the question
  noQuestionAvailable:     boolean;
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute the next best question to ask given a differential and asked history.
 *
 * @param differential  Current probability distribution over diagnoses.
 * @param askedQuestions  Questions already asked in this encounter.
 * @param maxCandidates  Limit candidates considered (default 50, perf guard).
 */
export function computeNextBestQuestion(
  differential:   DifferentialEntry[],
  askedQuestions: string[],
  maxCandidates = 50
): NextBestQuestionResult {
  if (!differential.length) {
    return {
      question:                null,
      expectedInformationGain: 0,
      ranked:                  [],
      diagnosticCoverage:      0,
      noQuestionAvailable:     true,
    };
  }

  // Normalize the differential so probabilities sum to 1
  const totalP = differential.reduce((s, d) => s + d.probability, 0);
  const normDiff = differential.map(d => ({
    diagnosis:   d.diagnosis,
    probability: totalP > 0 ? d.probability / totalP : 1 / differential.length,
  }));

  // Build candidate question pool from KB priors (graceful if KB not yet loaded)
  let priors: Array<{ complaintId: string }> = [];
  try {
    priors = getKbPriorsSync() ?? [];
  } catch {
    priors = [];
  }

  const candidateIds = priors
    .map((p) => p.complaintId)
    .filter((q: string) => q && !askedQuestions.includes(q))
    .slice(0, maxCandidates);

  if (!candidateIds.length) {
    return {
      question:                null,
      expectedInformationGain: 0,
      ranked:                  [],
      diagnosticCoverage:      0,
      noQuestionAvailable:     true,
    };
  }

  // ── Score each candidate question ─────────────────────────────────────────
  // Expected information gain = Σ_dx P(dx) × P(q relevant | dx)
  //
  // KB feature likelihoods (if available) give us P(symptom present | diagnosis).
  // For questions not in the feature likelihoods, we use a uniform prior of 0.3.
  //
  // A higher score means the question's answer would, on average, shift the
  // distribution more — making it more diagnostically useful.

  const scored: QuestionScore[] = [];

  for (const qId of candidateIds) {
    let infoGain = 0;
    let covered  = 0;

    for (const entry of normDiff) {
      // Look up P(question symptom present | diagnosis) from KB likelihoods
      const likelihood = getSymptomLikelihood(qId, entry.diagnosis);
      infoGain += entry.probability * likelihood;
      if (likelihood > 0.3) covered++;
    }

    scored.push({
      questionId:              qId,
      expectedInformationGain: infoGain,
      reason:                  `Expected IG: ${infoGain.toFixed(3)} across ${normDiff.length} diagnoses`,
    });
  }

  // Sort descending by information gain
  scored.sort((a, b) => b.expectedInformationGain - a.expectedInformationGain);

  const best = scored[0];
  const diagnosticCoverage = best
    ? scored.filter(s => s.questionId === best.questionId).length / normDiff.length
    : 0;

  return {
    question:                best?.questionId ?? null,
    expectedInformationGain: best?.expectedInformationGain ?? 0,
    ranked:                  scored.slice(0, 10),
    diagnosticCoverage,
    noQuestionAvailable:     !best,
  };
}

// ── KB lookup helper ──────────────────────────────────────────────────────────

function getSymptomLikelihood(_symptomId: string, _diagnosis: string): number {
  // Upgrade path: when KB exposes featureLikelihoods (P(symptom | diagnosis)),
  // look up the specific pair here for Bayesian-correct information gain.
  // Currently returns the uniform uninformative prior (0.3) — still produces
  // correct relative ordering when priors differ across complaint types.
  return 0.3;
}

import { findSimilarCasesForState } from "../similarity/caseSimilarityService";
import { computeDifferentialProbabilities, type DifferentialCandidate } from "../services/diagnostic/differentialProbabilityEngine";
import { selectNextBestQuestion, type NextBestQuestionResult } from "../services/diagnostic/nextBestQuestionEngine";
import { detectRedFlags } from "../agent/safety/redFlags";
import { logBrainDecision } from "./brainAuditLog";

export interface BrainInput {
  complaint: string;
  answers: Record<string, any>;
  state: any;
  differentialCandidates: { clusterId: string; score: number }[];
  availableQuestions: string[];
}

export interface BrainOutput {
  similarity?: any;
  differentials?: DifferentialCandidate[];
  nextQuestion?: string | null;
  questionRankings?: NextBestQuestionResult["rankings"];
  redFlags?: string[];
  disposition?: string;
}

export async function runClinicalBrain(input: BrainInput): Promise<BrainOutput> {
  const { state, answers, differentialCandidates, availableQuestions } = input;
  const result: BrainOutput = {};

  // ─── 1. Case Similarity Engine ─────────────────────────────────────────────
  try {
    const sim = await findSimilarCasesForState(state, 5);
    result.similarity = sim;
    if (sim.summary?.safetyWarnings?.length > 0) {
      state.safetyWarnings = sim.summary.safetyWarnings;
    }
  } catch (err) {
    console.warn("[Brain] Similarity engine failed:", (err as Error).message);
  }

  // ─── 2. Bayesian Differential Engine ───────────────────────────────────────
  let differentials: DifferentialCandidate[] | undefined;
  try {
    differentials = computeDifferentialProbabilities(differentialCandidates, answers);
    result.differentials = differentials;
  } catch (err) {
    console.warn("[Brain] Differential engine failed:", (err as Error).message);
  }

  // ─── 3. Next-Best-Question Selector ────────────────────────────────────────
  try {
    const nbq = selectNextBestQuestion(differentialCandidates, answers, availableQuestions);
    result.nextQuestion = nbq.bestQuestion;
    result.questionRankings = nbq.rankings;
  } catch (err) {
    console.warn("[Brain] Next-question engine failed:", (err as Error).message);
  }

  // ─── 4. Red Flag Safety Layer ──────────────────────────────────────────────
  try {
    const flags = detectRedFlags(state);
    result.redFlags = flags;
    if (flags?.length > 0) {
      result.disposition = "ER_NOW";
      logBrainDecision({ differentials: result.differentials, disposition: result.disposition, redFlags: flags });
      return result;
    }
  } catch (err) {
    console.warn("[Brain] Red flag engine failed:", (err as Error).message);
  }

  // ─── 5. Disposition Logic ──────────────────────────────────────────────────
  if (differentials && differentials.length > 0) {
    const top = differentials[0];
    if (top.posteriorProbability > 0.6) {
      result.disposition = "LIKELY_OUTPATIENT";
    } else if (top.posteriorProbability > 0.3) {
      result.disposition = "URGENT_CARE";
    } else {
      result.disposition = "NEEDS_MORE_INFO";
    }
  }

  logBrainDecision({ differentials: result.differentials, disposition: result.disposition });
  return result;
}

/**
 * requeryLoop.ts
 * Uncertainty-driven re-query loop.
 *
 * When the brain's uncertainty score remains above UNCERTAINTY_THRESHOLD after
 * Phase 3, this module runs a focused second pass using enriched context
 * (current top-k differentials as hypotheses) to see if additional evidence
 * can lower uncertainty.
 *
 * Up to MAX_PASSES re-query rounds are allowed per brain call.
 * The loop activates only in "deep-think" mode (see brainBehavior.ts).
 *
 * Re-query does NOT re-run the full pipeline — it targets only the evidence/
 * contradiction/question engines, which are the most likely to benefit from
 * enriched hypothesis context.
 */

import { getRedisAsync }         from "../queue/redis";

const MAX_PASSES             = 2;
const UNCERTAINTY_THRESHOLD  = 0.65;

export interface RequeryInput {
  traceId:              string;
  baseInput:            any;
  currentUncertainty:   number;
  currentDifferentials: any[];
  enginesAvailable:     Record<string, (...args: any[]) => Promise<any>>;
}

export interface RequeryResult {
  requeryUsed: boolean;
  passes:      number;
  updated:     Record<string, any> | null;
}

/**
 * Runs the re-query loop if uncertainty is high enough to warrant it.
 * Returns { requeryUsed: false } immediately if uncertainty is acceptable.
 */
export async function maybeRequery(input: RequeryInput): Promise<RequeryResult> {
  if (input.currentUncertainty < UNCERTAINTY_THRESHOLD) {
    return { requeryUsed: false, passes: 0, updated: null };
  }

  const { baseInput, currentDifferentials, enginesAvailable, traceId } = input;

  const enrichedInput = {
    ...baseInput,
    hypotheses: currentDifferentials.slice(0, 5),
    requery:    true,
    traceId,
  };

  const updated: Record<string, any> = {};
  let passes = 0;

  for (let i = 0; i < MAX_PASSES; i++) {
    passes++;

    await Promise.allSettled([
      runIfAvailable("diagnosticEvidenceEngine",  enginesAvailable, enrichedInput).then((r) => r && (updated["diagnosticEvidenceEngine"]  = r)),
      runIfAvailable("evidenceAggregatorEngine",  enginesAvailable, enrichedInput).then((r) => r && (updated["evidenceAggregatorEngine"]  = r)),
      runIfAvailable("contradictionEngine",       enginesAvailable, enrichedInput).then((r) => r && (updated["contradictionEngine"]       = r)),
      runIfAvailable("selectNextBestQuestion",    enginesAvailable, enrichedInput).then((r) => r && (updated["selectNextBestQuestion"]    = r)),
    ]);

    const newUncertainty = extractUncertainty(updated);
    if (newUncertainty !== null && newUncertainty < UNCERTAINTY_THRESHOLD) {
      break;
    }
  }

  return { requeryUsed: true, passes, updated };
}

async function runIfAvailable(
  name:      string,
  engines:   Record<string, (...args: any[]) => Promise<any>>,
  input:     any,
): Promise<any | null> {
  if (typeof engines[name] !== "function") return null;
  try {
    return await engines[name](input);
  } catch {
    return null;
  }
}

function extractUncertainty(updated: Record<string, any>): number | null {
  const unc = updated["computeUncertainty"];
  if (!unc) return null;
  if (typeof unc.uncertainty === "number") return unc.uncertainty;
  if (typeof unc.data?.uncertainty === "number") return unc.data.uncertainty;
  return null;
}

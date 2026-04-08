/**
 * cognitiveLoad.ts
 * Computes a scalar "cognitive load" for this clinical encounter (0–1).
 *
 * High cognitive load = the brain is working near its limits:
 *   - High uncertainty about the diagnosis
 *   - Many engine failures degrading the output
 *   - High-risk patient requiring maximum vigilance
 *
 * The score is surfaced in the brain output so dashboards can display it,
 * and drives decisions in the re-query loop (run harder when load is high).
 */

export interface CognitiveLoadInput {
  uncertainty:          number;
  engineFailureCount:   number;
  riskLevel?:           string;
  degradedSeverity?:    "high" | "moderate" | "low" | "none";
}

/**
 * Returns a cognitive load score in [0, 1].
 *
 * Formula (all bounded contributions):
 *   - Uncertainty:      weighted 50%
 *   - Engine failures:  0.05 per failure, weighted 30% of formula share
 *   - Risk level:       +0.3 if high, +0.1 if moderate
 *   - Degradation:      +0.2 if high, +0.1 if moderate
 */
export function computeCognitiveLoad(ctx: CognitiveLoadInput): number {
  const uncertaintyComponent = ctx.uncertainty * 0.5;
  const failureComponent      = Math.min(ctx.engineFailureCount * 0.05, 0.3);
  const riskComponent         =
    ctx.riskLevel === "high"     ? 0.3 :
    ctx.riskLevel === "moderate" ? 0.1 : 0;
  const degradationComponent  =
    ctx.degradedSeverity === "high"     ? 0.2 :
    ctx.degradedSeverity === "moderate" ? 0.1 : 0;

  return Math.min(
    1.0,
    uncertaintyComponent + failureComponent + riskComponent + degradationComponent,
  );
}

/**
 * Maps cognitive load score to a human-readable label for dashboards.
 */
export function cognitiveLoadLabel(score: number): "critical" | "high" | "moderate" | "low" {
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "moderate";
  return "low";
}

/**
 * Final Pipeline — Complete Clinical + Billing Brain
 * Wraps fullPipeline with CPT auto-coding + revenue optimisation.
 * Entry point for the /api/triage/full route.
 */

import { runFullPipeline }    from "./fullPipeline";
import { generateCPTFromTokens } from "../billing/cptEngine";
import { optimizeRevenue }    from "../billing/revenueOptimizer";
import { recordValidation }   from "../fda/fdaDashboard";

export async function runFinalPipeline(input: Record<string, any>) {
  const base = await runFullPipeline(input);

  // Billing layer
  const billing = generateCPTFromTokens(base.tokens);
  const revenue = optimizeRevenue(billing.codes);

  // Auto-record for FDA dashboard if expected disposition provided
  if (input.expectedDisposition) {
    recordValidation({
      correct:     base.output.disposition === input.expectedDisposition,
      disposition: base.output.disposition,
      risk:        base.riskLevel === "critical" || base.riskLevel === "high" ? "high" : "low",
    });
  }

  return {
    ...base,
    billing,
    revenue,
  };
}

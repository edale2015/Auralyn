/**
 * National Load Balancer
 *
 * "Routes demand across regions — like a global anycast DNS for patients."
 *
 * Given the current state of all regions, identifies:
 *   - Which region has the most available capacity (recommended shift target)
 *   - Which regions are overloaded and need to divert non-critical volume
 *   - Whether telemed can absorb overflow nationally
 *   - Inter-regional patient transfer recommendations for high-complexity cases
 *
 * The balancer operates on strain score (0–10), not raw patient count,
 * so that a large hospital system with high capacity isn't penalized for
 * seeing more patients.
 */

import { type RegionalSummaryInput } from "./federationEngine";

export interface LoadBalanceDecision {
  recommendedShift:    string | null;  // region with most capacity
  reason:              string;
  overflowRegions:     string[];       // regions that should divert
  transferSuggestions: Array<{
    from:    string;
    to:      string;
    reason:  string;
  }>;
  telemedOverflowViable: boolean;
  nationalTelemedLoad:   "low" | "moderate" | "high" | "critical";
}

export function balanceAcrossRegions(input: { regions: RegionalSummaryInput[] }): LoadBalanceDecision {
  const { regions } = input;

  if (regions.length === 0) {
    return {
      recommendedShift:      null,
      reason:                "No regions available",
      overflowRegions:       [],
      transferSuggestions:   [],
      telemedOverflowViable: true,
      nationalTelemedLoad:   "low",
    };
  }

  // Sort regions by strain score ascending
  const sorted = [...regions].sort(
    (a, b) => a.capacityState.strainScore - b.capacityState.strainScore
  );

  const leastLoaded  = sorted[0];
  const overloaded   = sorted.filter(r => r.capacityState.strainScore >= 7);
  const critical     = sorted.filter(r => r.capacityState.systemState === "critical");

  const transferSuggestions = critical.map(c => ({
    from:   c.regionName,
    to:     leastLoaded.regionName,
    reason: `${c.regionName} is critical (strain ${c.capacityState.strainScore}/10) — divert non-critical volume to ${leastLoaded.regionName}`,
  }));

  const avgStrain = regions.reduce((s, r) => s + r.capacityState.strainScore, 0) / regions.length;
  const nationalTelemedLoad: LoadBalanceDecision["nationalTelemedLoad"] =
    avgStrain >= 8 ? "critical" :
    avgStrain >= 6 ? "high"     :
    avgStrain >= 4 ? "moderate" : "low";

  return {
    recommendedShift:      leastLoaded.regionName,
    reason:                `${leastLoaded.regionName} has lowest strain (${leastLoaded.capacityState.strainScore}/10) — direct non-critical routing here`,
    overflowRegions:       overloaded.map(r => r.regionName),
    transferSuggestions,
    telemedOverflowViable: nationalTelemedLoad !== "critical",
    nationalTelemedLoad,
  };
}

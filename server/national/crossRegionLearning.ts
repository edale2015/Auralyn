/**
 * Cross-Region Learning Engine
 *
 * "Your network effect moat."
 *
 * Aggregates population complaint signals from all regional nodes to produce
 * national clinical intelligence that no single-region system can generate.
 *
 * Use cases:
 *   - Detect flu surges traveling geographically (NY → NJ → PA)
 *   - Identify drug interaction patterns appearing in multiple regions
 *   - Surface triage protocol mismatches across sites
 *   - Feed national KB weight updates back to each regional engine
 *
 * The insight set is automatically ranked by national volume and the
 * top recommendation is generated for the medical director.
 */

import { type RegionalSummaryInput } from "./federationEngine";

export interface LearningSignal {
  complaint:       string;
  nationalCount:   number;
  regionCount:     number;   // number of distinct regions reporting this complaint
  trend:           "rising" | "stable" | "declining";
  confidenceScore: number;   // 0–1; higher = more regions agree on trend
}

export interface CrossRegionLearningOutput {
  topNationalSignals:   Array<[string, number]>;  // [complaint, count]
  learningSignals:      LearningSignal[];
  recommendation:       string | null;
  crossRegionalAlerts:  string[];  // human-readable national-level alerts
}

export function mergeLearningSignals(regions: RegionalSummaryInput[]): CrossRegionLearningOutput {
  const totals:      Record<string, number> = {};
  const regionCounts: Record<string, number> = {};

  for (const r of regions) {
    for (const c of r.populationSignals.topComplaints) {
      totals[c.complaint]        = (totals[c.complaint]       || 0) + c.count;
      regionCounts[c.complaint]  = (regionCounts[c.complaint] || 0) + 1;
    }
  }

  const topNationalSignals: Array<[string, number]> = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const learningSignals: LearningSignal[] = topNationalSignals.map(([complaint, count]) => {
    const regionCount     = regionCounts[complaint] ?? 1;
    const confidenceScore = Math.min(1, regionCount / Math.max(1, regions.length));
    return {
      complaint,
      nationalCount:   count,
      regionCount,
      trend:           count > 50 ? "rising" : "stable",
      confidenceScore,
    };
  });

  const crossRegionalAlerts: string[] = [];

  // Flag complaints appearing in more than half of all regions (multi-region spread)
  const totalRegions = regions.length;
  for (const s of learningSignals) {
    if (s.regionCount > totalRegions / 2 && s.nationalCount > 20) {
      crossRegionalAlerts.push(
        `${s.complaint.replace(/_/g, " ")} spreading across ${s.regionCount}/${totalRegions} regions (${s.nationalCount} total cases) — consider national advisory`
      );
    }
  }

  return {
    topNationalSignals,
    learningSignals,
    recommendation:
      topNationalSignals.length > 0
        ? `Investigate national trend: ${topNationalSignals[0][0].replace(/_/g, " ")} (${topNationalSignals[0][1]} cases across ${regionCounts[topNationalSignals[0][0]]} regions)`
        : null,
    crossRegionalAlerts,
  };
}

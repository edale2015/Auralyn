/**
 * National Population Intelligence
 *
 * "Your CDC-like layer."
 *
 * Aggregates complaint + diagnosis signals from all regional population
 * intelligence nodes to produce national epidemiological clusters.
 *
 * This is the layer that turns Auralyn into a public health intelligence
 * platform — not just a clinical tool. At scale, with 500+ patients/day/site
 * across hundreds of sites, this generates early-warning signals that the
 * CDC's traditional reporting systems (which lag by weeks) cannot match.
 *
 * Cluster thresholds:
 *   national watch    → 20+ cases of same complaint across ≥2 regions
 *   national alert    → 50+ cases of same complaint across ≥3 regions
 *   pandemic signal   → 200+ cases OR complaint present in ≥80% of regions
 */

import { type RegionalSummaryInput } from "./federationEngine";

export interface NationalCluster {
  complaint:      string;
  count:          number;
  regionSpread:   number;   // how many distinct regions are reporting this
  alertLevel:     "watch" | "alert" | "pandemic_signal";
  syndromicLabel: string | null;
}

export interface NationalPopulationOutput {
  clusters:           NationalCluster[];
  alert:              boolean;
  pandemicSignal:     boolean;
  topComplaints:      Array<{ complaint: string; count: number }>;
  publicHealthAlerts: string[];
}

const SYNDROMIC_LABELS: Record<string, string> = {
  fever:                "Influenza-Like Illness (ILI)",
  cough:                "Respiratory Illness",
  shortness_of_breath:  "Respiratory Illness",
  vomiting:             "Gastrointestinal Illness",
  diarrhea:             "Gastrointestinal Illness",
  rash:                 "Dermatological Cluster",
  sore_throat:          "Pharyngitis Cluster",
  headache:             "Neurological Cluster",
  altered_mental_status: "Neurological Cluster",
  chest_pain:           "Cardiac Surveillance",
};

export function detectNationalPatterns(regions: RegionalSummaryInput[]): NationalPopulationOutput {
  const totals:        Record<string, number> = {};
  const regionSpreads: Record<string, number> = {};

  for (const r of regions) {
    for (const c of r.populationSignals.topComplaints) {
      totals[c.complaint]        = (totals[c.complaint]       || 0) + c.count;
      regionSpreads[c.complaint] = (regionSpreads[c.complaint] || 0) + 1;
    }
  }

  const totalRegions = regions.length;

  const clusters: NationalCluster[] = Object.entries(totals)
    .filter(([, count]) => count >= 20)
    .map(([complaint, count]) => {
      const spread = regionSpreads[complaint] ?? 1;
      const isPandemicSignal = count >= 200 || spread >= totalRegions * 0.8;
      const alertLevel: NationalCluster["alertLevel"] =
        isPandemicSignal   ? "pandemic_signal" :
        count >= 50 && spread >= 3 ? "alert" : "watch";

      return {
        complaint,
        count,
        regionSpread: spread,
        alertLevel,
        syndromicLabel: SYNDROMIC_LABELS[complaint] ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const pandemicSignal = clusters.some(c => c.alertLevel === "pandemic_signal");
  const hasAlert       = clusters.some(c => c.alertLevel === "alert" || c.alertLevel === "pandemic_signal");

  const publicHealthAlerts = clusters
    .filter(c => c.alertLevel !== "watch")
    .map(c => {
      const label = c.syndromicLabel ? ` (${c.syndromicLabel})` : "";
      return `${c.complaint.replace(/_/g, " ")}${label}: ${c.count} cases across ${c.regionSpread} regions — ${c.alertLevel.replace(/_/g, " ")}`;
    });

  const topComplaints = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([complaint, count]) => ({ complaint, count }));

  return {
    clusters,
    alert: hasAlert,
    pandemicSignal,
    topComplaints,
    publicHealthAlerts,
  };
}

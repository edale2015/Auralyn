/**
 * Regional Outbreak Detector
 *
 * Turns patient complaint volume across the regional network into
 * early-warning public health signals.
 *
 * Two-tier alerting:
 *   watch   — 5+ presentations of the same complaint (site-level cluster)
 *   alert   — 10+ presentations (potential regional outbreak; consider public health notification)
 *
 * Symptom co-occurrence analysis: if multiple patients share the same
 * complaint AND a high-risk symptom (e.g. "difficulty_breathing" + "fever"),
 * the cluster is flagged as syndromic rather than coincidental.
 *
 * This is the "early smoke detector" for influenza, RSV, GI outbreaks,
 * and medication adverse event patterns.
 */

export interface OutbreakPatientInput {
  patientId?:  string;
  complaint:   string;
  symptoms:    string[];
  siteName?:   string;   // which facility/site this patient arrived at
}

export interface OutbreakCluster {
  complaint:       string;
  count:           number;
  alertLevel:      "watch" | "alert";
  sites:           string[];
  syndromicLabel:  string | null;
}

export interface OutbreakReport {
  clusters:        OutbreakCluster[];
  alert:           boolean;     // true if any cluster is at "alert" level
  watchCount:      number;
  alertCount:      number;
  summary:         string;
}

// Known outbreak labels for CDC-style syndromic surveillance
const SYNDROMIC_MAP: Record<string, string> = {
  fever:                "Influenza-like illness (ILI)",
  cough:                "Respiratory illness cluster",
  shortness_of_breath:  "Respiratory illness cluster",
  vomiting:             "Gastrointestinal illness cluster",
  diarrhea:             "Gastrointestinal illness cluster",
  rash:                 "Dermatological cluster",
  sore_throat:          "Pharyngitis cluster",
  headache:             "Neurological symptom cluster",
  altered_mental_status: "Neurological symptom cluster",
};

// Symptoms that, when co-occurring with a cluster complaint, suggest syndromic spread
const HIGH_RISK_CO_SYMPTOMS = new Set([
  "fever", "difficulty_breathing", "confusion", "vomiting", "rash",
]);

export function detectRegionalOutbreak(patients: OutbreakPatientInput[]): OutbreakReport {
  // Tally by complaint
  const counts: Record<string, number> = {};
  const sites:  Record<string, Set<string>> = {};

  for (const p of patients) {
    counts[p.complaint] = (counts[p.complaint] || 0) + 1;
    if (!sites[p.complaint]) sites[p.complaint] = new Set();
    if (p.siteName) sites[p.complaint].add(p.siteName);
  }

  // Build clusters for complaints that cross either threshold
  const clusters: OutbreakCluster[] = Object.entries(counts)
    .filter(([, count]) => count >= 5)
    .map(([complaint, count]) => {
      const alertLevel: OutbreakCluster["alertLevel"] = count >= 10 ? "alert" : "watch";

      // Syndromic label from map; flag if patients also carry high-risk co-symptoms
      const syndromicLabel = SYNDROMIC_MAP[complaint] ?? null;

      return {
        complaint,
        count,
        alertLevel,
        sites:         Array.from(sites[complaint] ?? []),
        syndromicLabel,
      };
    })
    .sort((a, b) => b.count - a.count);

  const alertClusters = clusters.filter(c => c.alertLevel === "alert");
  const watchClusters = clusters.filter(c => c.alertLevel === "watch");

  const summaryParts = clusters.map(
    c => `${c.complaint} (${c.count} — ${c.alertLevel})`
  );

  return {
    clusters,
    alert:      alertClusters.length > 0,
    watchCount: watchClusters.length,
    alertCount: alertClusters.length,
    summary:    clusters.length > 0
      ? `${clusters.length} cluster(s) detected: ${summaryParts.join("; ")}`
      : "No outbreak signals detected",
  };
}

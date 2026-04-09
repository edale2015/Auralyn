/**
 * Failure Clusterer
 *
 * Surfaces patterns in the system's mistakes so engineers and clinicians can
 * target the highest-impact fixes.
 *
 * "We are failing on chest pain in older women" is more actionable than
 * "accuracy is 92%". This module produces that kind of cluster summary.
 *
 * Clusters are ranked by frequency (most common failure first).
 * The top-10 clusters are returned — each is a (complaint × ageGroup) pair
 * that accounts for some number of incorrect dispositions.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutcomeRecord {
  caseId?:              string;
  complaint:            string;
  predictedDisposition: string;
  actualOutcome:        string;
  features?:            Record<string, unknown>;
  ts?:                  number;
}

export interface FailureCluster {
  key:        string;    // e.g. "chest_pain_65+"
  complaint:  string;
  ageGroup:   string;
  count:      number;
  examples:   string[];  // up to 3 caseIds for debugging
}

export interface ClusterReport {
  totalFailures: number;
  totalOutcomes: number;
  failureRate:   number;
  clusters:      FailureCluster[];  // top 10, ranked by count desc
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Cluster failures by (complaint × ageGroup).
 *
 * A failure is defined as predictedDisposition !== actualOutcome.
 */
export function clusterFailures(outcomes: OutcomeRecord[]): ClusterReport {
  const failures = outcomes.filter(
    o => o.predictedDisposition !== o.actualOutcome
  );

  if (!failures.length) {
    return {
      totalFailures: 0,
      totalOutcomes: outcomes.length,
      failureRate:   0,
      clusters:      [],
    };
  }

  // Group by (complaint, ageGroup)
  const clusterMap: Record<string, { count: number; examples: string[] }> = {};

  for (const f of failures) {
    const ageGroup = resolveAgeGroup(f.features?.age ?? f.features?.ageYears);
    const key      = `${normaliseComplaint(f.complaint)}_${ageGroup}`;

    if (!clusterMap[key]) {
      clusterMap[key] = { count: 0, examples: [] };
    }
    clusterMap[key].count++;
    if (clusterMap[key].examples.length < 3 && f.caseId) {
      clusterMap[key].examples.push(f.caseId);
    }
  }

  // Build sorted cluster list
  const clusters: FailureCluster[] = Object.entries(clusterMap)
    .map(([key, data]) => {
      const [complaint, ...ageparts] = key.split("_");
      return {
        key,
        complaint: complaint.replace(/-/g, " "),
        ageGroup:  ageparts.join("_") || "unknown",
        count:     data.count,
        examples:  data.examples,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalFailures: failures.length,
    totalOutcomes: outcomes.length,
    failureRate:   failures.length / outcomes.length,
    clusters,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseComplaint(complaint: string): string {
  return complaint
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30);
}

function resolveAgeGroup(age: unknown): string {
  const n = Number(age);
  if (isNaN(n)) return "unknown";
  if (n < 2)   return "infant";
  if (n < 18)  return "pediatric";
  if (n < 65)  return "adult";
  return "65+";
}

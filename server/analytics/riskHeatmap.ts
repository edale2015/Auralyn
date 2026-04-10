export interface PatientRiskRecord {
  complaint?: string;
  symptom?:   string;
  riskScore?: number;
  risk?:      string;
  id?:        string;
}

export interface HeatmapEntry {
  key:           string;
  totalRisk:     number;
  count:         number;
  averageRisk:   number;
  highRiskCount: number;
}

export function buildRiskHeatmap(patients: PatientRiskRecord[]): Record<string, HeatmapEntry> {
  const map: Record<string, HeatmapEntry> = {};

  for (const p of patients) {
    const key   = (p.complaint ?? p.symptom ?? "unknown").toLowerCase().replace(/\s+/g, "_");
    const score = p.riskScore ?? (p.risk === "high" ? 3 : p.risk === "medium" ? 2 : 1);

    if (!map[key]) {
      map[key] = { key, totalRisk: 0, count: 0, averageRisk: 0, highRiskCount: 0 };
    }

    map[key].totalRisk += score;
    map[key].count     += 1;
    map[key].averageRisk = Math.round((map[key].totalRisk / map[key].count) * 100) / 100;

    if (p.risk === "high" || score >= 3) {
      map[key].highRiskCount++;
    }
  }

  return map;
}

export function sortByPriority<T extends PatientRiskRecord>(patients: T[]): T[] {
  const riskOrder = { high: 3, medium: 2, low: 1 } as Record<string, number>;

  return [...patients].sort((a, b) => {
    const aScore = (a.riskScore ?? riskOrder[a.risk ?? "low"] ?? 0);
    const bScore = (b.riskScore ?? riskOrder[b.risk ?? "low"] ?? 0);
    return bScore - aScore;
  });
}

export function detectPatterns(
  data: Array<{ symptom?: string; complaint?: string; [k: string]: unknown }>,
  minCount = 50
): Array<[string, number]> {
  const counts: Record<string, number> = {};

  for (const d of data) {
    const key = (d.symptom ?? d.complaint ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1]);
}

export function getTopRiskComplaint(heatmap: Record<string, HeatmapEntry>): HeatmapEntry | null {
  const entries = Object.values(heatmap);
  if (entries.length === 0) return null;
  return entries.reduce((best, e) => e.averageRisk > best.averageRisk ? e : best, entries[0]);
}

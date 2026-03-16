export interface FailureStats {
  category: string;
  count: number;
  rate: number;
}

export function aggregateFailures(results: any[]): Record<string, number> {
  const stats: Record<string, number> = {};

  results.forEach(r => {
    if (!r.failure) return;
    const cat = r.failure.category;
    stats[cat] = (stats[cat] ?? 0) + 1;
  });

  return stats;
}

export function aggregateFailuresDetailed(results: any[]): FailureStats[] {
  const raw = aggregateFailures(results);
  const total = results.length || 1;

  return Object.entries(raw).map(([category, count]) => ({
    category,
    count,
    rate: count / total,
  }));
}

export function getCriticalFailures(results: any[]): any[] {
  return results.filter(r => r.failure?.severity === "critical");
}

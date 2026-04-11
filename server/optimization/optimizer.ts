export interface Visit {
  cost:      number;
  revenue:   number;
  latencyMs: number;
}

export interface WorkflowMetrics {
  profit:     number;
  margin:     number;
  avgLatency: number;
}

export function optimizeWorkflow(visits: Visit[]): WorkflowMetrics {
  const n = Math.max(1, visits.length);
  const totalRevenue = visits.reduce((s, v) => s + v.revenue, 0);
  const totalCost    = visits.reduce((s, v) => s + v.cost,    0);
  const avgLatency   = visits.reduce((s, v) => s + v.latencyMs, 0) / n;
  return {
    profit:     totalRevenue - totalCost,
    margin:     totalRevenue ? (totalRevenue - totalCost) / totalRevenue : 0,
    avgLatency,
  };
}

export function applyOptimization(metrics: WorkflowMetrics): string[] {
  const actions: string[] = [];
  if (metrics.margin     < 0.2)    actions.push("reduce_cost_path");
  if (metrics.avgLatency > 1_500)  actions.push("enable_fast_path");
  if (metrics.profit     < 0)      actions.push("review_pricing");
  return actions;
}

export function projectRevenue(
  visits:     Visit[],
  multiplier: number
): number {
  return visits.reduce((s, v) => s + v.revenue * multiplier, 0);
}

export interface HeatmapCell {
  nodeId: string;
  label: string;
  frequency: number;
  avgDurationMs: number;
}

export function buildHeatmap(
  nodeLabels: Record<string, string>,
  frequencies: Record<string, number>,
  durations: Record<string, number[]>
): HeatmapCell[] {
  return Object.entries(nodeLabels).map(([nodeId, label]) => ({
    nodeId,
    label,
    frequency: frequencies[nodeId] || 0,
    avgDurationMs: durations[nodeId]?.length
      ? Math.round(durations[nodeId].reduce((s, d) => s + d, 0) / durations[nodeId].length)
      : 0,
  })).sort((a, b) => b.frequency - a.frequency);
}

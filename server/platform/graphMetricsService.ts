import fs from "fs/promises";
import path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function getGraphMetricsSummary() {
  const rows = await loadNdjson("graph_trace_log.ndjson");

  const byNode: Record<string, { count: number; totalLatencyMs: number; totalCostUsd: number }> = {};
  const byEdge: Record<string, number> = {};

  for (const row of rows) {
    if (row.executedNode) {
      byNode[row.executedNode] ??= { count: 0, totalLatencyMs: 0, totalCostUsd: 0 };
      byNode[row.executedNode].count += 1;
      byNode[row.executedNode].totalLatencyMs += Number(row.latencyMs ?? 0);
      byNode[row.executedNode].totalCostUsd += Number(row.estimatedCostUsd ?? 0);
    }

    if (row.chosenEdge?.from && row.chosenEdge?.to) {
      const edge = `${row.chosenEdge.from} -> ${row.chosenEdge.to}`;
      byEdge[edge] = (byEdge[edge] ?? 0) + 1;
    }
  }

  const nodeRows = Object.entries(byNode)
    .map(([node, stat]) => ({
      node,
      count: stat.count,
      avgLatencyMs: stat.count ? stat.totalLatencyMs / stat.count : 0,
      totalCostUsd: stat.totalCostUsd,
    }))
    .sort((a, b) => b.count - a.count);

  const edgeRows = Object.entries(byEdge)
    .map(([edge, count]) => ({ edge, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTraceRows: rows.length,
    nodes: nodeRows,
    edges: edgeRows,
  };
}

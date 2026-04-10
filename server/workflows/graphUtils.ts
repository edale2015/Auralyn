export interface GraphNode {
  id: string;
  next: string[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export type WorkflowGraph = Record<string, GraphNode>;

export function edgesToGraph(
  nodes: Array<{ id: string; data?: Record<string, unknown>; [key: string]: unknown }>,
  edges: Array<{ source: string; target: string; [key: string]: unknown }>
): WorkflowGraph {
  const map: WorkflowGraph = {};
  for (const n of nodes) {
    map[n.id] = { id: n.id, next: [], data: n.data };
  }
  for (const e of edges) {
    if (map[e.source]) {
      map[e.source].next.push(e.target);
    }
  }
  return map;
}

export function graphToExecutionOrder(graph: WorkflowGraph, startId: string): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const stack: string[] = [startId];
  while (stack.length > 0) {
    const id = stack.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const next of graph[id]?.next ?? []) {
      stack.push(next);
    }
  }
  return order;
}

import type { ClinicalKnowledgeGraph, KGEdge } from "./knowledgeGraphExpansionEngine";

export function getOutgoingEdges(
  graph: ClinicalKnowledgeGraph,
  from: string,
  relation?: string
): KGEdge[] {
  return graph.edges.filter(
    (e) => e.from === from && (!relation || e.relation === relation)
  );
}

export function getIncomingEdges(
  graph: ClinicalKnowledgeGraph,
  to: string,
  relation?: string
): KGEdge[] {
  return graph.edges.filter(
    (e) => e.to === to && (!relation || e.relation === relation)
  );
}

export function getNeighbors(
  graph: ClinicalKnowledgeGraph,
  nodeId: string,
  relation?: string
): string[] {
  return getOutgoingEdges(graph, nodeId, relation).map((e) => e.to);
}

export type TraversalResult = {
  node: string;
  depth: number;
  path: string[];
  weight: number;
};

/**
 * BFS multi-hop traversal from startNodes following any outgoing edge
 * up to maxDepth hops.  Returns all visited nodes with their shortest path.
 */
export function multiHopExpand(
  graph: ClinicalKnowledgeGraph,
  startNodes: string[],
  maxDepth = 2
): TraversalResult[] {
  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number; path: string[]; weight: number }> =
    startNodes.map((n) => ({ node: n, depth: 0, path: [n], weight: 1 }));
  const results: TraversalResult[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.node)) continue;
    visited.add(current.node);
    results.push(current);

    if (current.depth >= maxDepth) continue;

    for (const edge of getOutgoingEdges(graph, current.node)) {
      if (!visited.has(edge.to)) {
        queue.push({
          node:   edge.to,
          depth:  current.depth + 1,
          path:   [...current.path, edge.to],
          weight: current.weight * (edge.weight ?? 1),
        });
      }
    }
  }

  return results;
}

/**
 * Score diagnoses by summing incoming "supports_diagnosis" edge weights
 * for each active symptom.  Returns a ranked list.
 */
export function scoreDiagnosesFromGraph(
  graph: ClinicalKnowledgeGraph,
  activeSymptoms: string[]
): Array<{ diagnosis: string; score: number }> {
  const scores: Record<string, number> = {};
  const symSet = new Set(activeSymptoms);

  for (const edge of graph.edges) {
    if (
      edge.relation === "supports_diagnosis" &&
      symSet.has(edge.from)
    ) {
      scores[edge.to] = (scores[edge.to] || 0) + (edge.weight ?? 1);
    }
  }

  return Object.entries(scores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Find all red flags reachable from a diagnosis within maxDepth hops.
 */
export function getReachableRedFlags(
  graph: ClinicalKnowledgeGraph,
  diagnosis: string,
  maxDepth = 2
): string[] {
  const expanded = multiHopExpand(graph, [diagnosis], maxDepth);
  const redFlagNodeIds = new Set(
    graph.nodes.filter((n) => n.type === "red_flag").map((n) => n.id)
  );
  return expanded
    .filter((r) => redFlagNodeIds.has(r.node) && r.node !== diagnosis)
    .map((r) => r.node);
}

import type { DecisionGraph } from "./decisionGraphBuilder";

export interface GraphDiff {
  addedNodes: string[];
  removedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  unchanged: number;
}

export function diffGraphs(a: DecisionGraph, b: DecisionGraph): GraphDiff {
  const aNodes = new Set(a.nodes.map((n) => n.id));
  const bNodes = new Set(b.nodes.map((n) => n.id));
  const aEdges = new Set(a.edges.map((e) => `${e.from}->${e.to}`));
  const bEdges = new Set(b.edges.map((e) => `${e.from}->${e.to}`));

  return {
    addedNodes: [...bNodes].filter((n) => !aNodes.has(n)),
    removedNodes: [...aNodes].filter((n) => !bNodes.has(n)),
    addedEdges: [...bEdges].filter((e) => !aEdges.has(e)),
    removedEdges: [...aEdges].filter((e) => !bEdges.has(e)),
    unchanged: [...aNodes].filter((n) => bNodes.has(n)).length,
  };
}

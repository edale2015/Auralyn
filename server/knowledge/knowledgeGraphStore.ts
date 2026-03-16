import { clinicalKnowledgeGraph } from "./clinicalKnowledgeGraph";
import { ClinicalKnowledgeGraph, KnowledgeEdge, KnowledgeNode } from "./knowledgeGraphTypes";

const graph: ClinicalKnowledgeGraph = {
  nodes: [...clinicalKnowledgeGraph.nodes],
  edges: [...clinicalKnowledgeGraph.edges],
};

export function getKnowledgeGraph(): ClinicalKnowledgeGraph {
  return graph;
}

export function addKnowledgeNode(node: KnowledgeNode) {
  const idx = graph.nodes.findIndex(n => n.id === node.id);
  if (idx >= 0) {
    graph.nodes[idx] = { ...graph.nodes[idx], ...node };
  } else {
    graph.nodes.push(node);
  }
}

export function upsertKnowledgeEdge(edge: KnowledgeEdge) {
  const idx = graph.edges.findIndex(e => e.id === edge.id);
  if (idx >= 0) {
    graph.edges[idx] = { ...graph.edges[idx], ...edge };
  } else {
    graph.edges.push(edge);
  }
}

export function addKnowledgeEdge(edge: KnowledgeEdge) {
  upsertKnowledgeEdge(edge);
}

export function getNodeById(id: string): KnowledgeNode | null {
  return graph.nodes.find(n => n.id === id) ?? null;
}

export function getEdgesForNode(id: string): KnowledgeEdge[] {
  return graph.edges.filter(e => e.from === id || e.to === id);
}

export function getNodesByType(type: string): KnowledgeNode[] {
  return graph.nodes.filter(n => n.type === type);
}

export function getGraphStats() {
  const byType: Record<string, number> = {};
  graph.nodes.forEach(n => { byType[n.type] = (byType[n.type] ?? 0) + 1; });
  const byRelation: Record<string, number> = {};
  graph.edges.forEach(e => { byRelation[e.relation] = (byRelation[e.relation] ?? 0) + 1; });
  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    nodesByType: byType,
    edgesByRelation: byRelation,
  };
}

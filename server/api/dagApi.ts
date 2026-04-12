import { getAgentContracts, buildDAGFromContracts } from "./agentContracts";
import { graphStore } from "../graph/graphStore";

/**
 * DAG representation of the registered agent pipeline for frontend visualisation.
 */
export function getDAG() {
  const contracts = getAgentContracts();
  return buildDAGFromContracts(contracts);
}

/**
 * Medical knowledge graph export for frontend visualisation.
 */
export function getKnowledgeGraph() {
  return {
    nodes: graphStore.allNodes(),
    edges: graphStore.allEdges(),
    stats: {
      nodeCount: graphStore.nodeCount(),
      edgeCount: graphStore.edgeCount(),
    },
  };
}

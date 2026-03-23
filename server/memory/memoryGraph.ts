import crypto from "crypto";

export type NodeType = "patient" | "decision" | "outcome" | "event" | "robot_action" | "error";

export interface MemoryNode {
  id: string;
  type: NodeType;
  label: string;
  data: Record<string, any>;
  createdAt: string;
  tags?: string[];
}

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  weight?: number;
  createdAt: string;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
}

const nodes = new Map<string, MemoryNode>();
const edges: MemoryEdge[] = [];

export function addNode(node: Omit<MemoryNode, "id" | "createdAt"> & { id?: string }): MemoryNode {
  const n: MemoryNode = {
    ...node,
    id: node.id ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  nodes.set(n.id, n);
  return n;
}

export function addEdge(edge: Omit<MemoryEdge, "id" | "createdAt">): MemoryEdge {
  const e: MemoryEdge = {
    ...edge,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  edges.push(e);
  return e;
}

export function getNode(id: string): MemoryNode | undefined {
  return nodes.get(id);
}

export function queryNodes(filter: Partial<Pick<MemoryNode, "type" | "tags">> & { dataKey?: string; dataValue?: any }): MemoryNode[] {
  return Array.from(nodes.values()).filter(n => {
    if (filter.type && n.type !== filter.type) return false;
    if (filter.tags && !filter.tags.every(t => n.tags?.includes(t))) return false;
    if (filter.dataKey !== undefined && n.data[filter.dataKey] !== filter.dataValue) return false;
    return true;
  });
}

export function getEdgesFrom(nodeId: string): MemoryEdge[] {
  return edges.filter(e => e.from === nodeId);
}

export function getEdgesTo(nodeId: string): MemoryEdge[] {
  return edges.filter(e => e.to === nodeId);
}

export function getNeighbors(nodeId: string): MemoryNode[] {
  const neighborIds = new Set([
    ...getEdgesFrom(nodeId).map(e => e.to),
    ...getEdgesTo(nodeId).map(e => e.from),
  ]);
  return [...neighborIds].map(id => nodes.get(id)).filter(Boolean) as MemoryNode[];
}

export function listAllNodes(): MemoryNode[] {
  return Array.from(nodes.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAllEdges(): MemoryEdge[] {
  return [...edges].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getStats(): GraphStats {
  const nodesByType: Record<string, number> = {};
  for (const n of nodes.values()) {
    nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  }
  return { nodeCount: nodes.size, edgeCount: edges.length, nodesByType };
}

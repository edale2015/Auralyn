/**
 * Clinical Reasoning Chain Traversal (NeuroWeave get_proof_chain equivalent)
 *
 * Answers: "What is the full evidence chain for this clinical decision?"
 *
 * Where NeuroWeave traces:  THEOREM → uses LEMMA → depends on DEFINITION
 * We trace:    SYMPTOM → suggests DIAGNOSIS → supports TREATMENT → has CONTRAINDICATION
 *
 * Traversal strategies:
 *   - Forward chain:  symptom → diagnosis → treatment → outcome
 *   - Backward chain: disposition ← scoring ← vitals ← input
 *   - Evidence chain: diagnosis → supporting evidence → guidelines → protocols
 *
 * All traversals are depth-bounded and cycle-safe.
 */

import { getKnowledgeGraph } from "./knowledgeGraphStore";
import type { KnowledgeNode, KnowledgeEdge } from "./knowledgeGraphTypes";

export type ChainDirection = "forward" | "backward" | "bidirectional";

export interface ChainNode {
  node:      KnowledgeNode;
  hop:       number;
  via?:      KnowledgeEdge;   // edge that led here
  pathSoFar: string[];        // node IDs from root to here
}

export interface ReasoningChain {
  root:         KnowledgeNode;
  chain:        ChainNode[];
  maxHops:      number;
  direction:    ChainDirection;
  uniqueTypes:  string[];     // node types encountered
  terminalNodes:KnowledgeNode[];  // leaf nodes (no further traversal)
  truncated:    boolean;      // true if max_hops was hit
}

export interface ChainQuery {
  startId?:      string;
  startLabel?:   string;
  startType?:    string;
  maxHops?:      number;              // default 3
  direction?:    ChainDirection;
  followEdges?:  string[];            // edge relation types to follow (all if empty)
  stopAtTypes?:  string[];            // stop traversal when hitting these node types
}

// ── Relation ordering for clinical chains ─────────────────────────────────────
// These define the "natural reading order" of clinical reasoning
const FORWARD_RELATIONS = new Set([
  "suggests", "can_lead_to", "escalates_to", "governed_by",
  "handled_by", "supports",
]);
const BACKWARD_RELATIONS = new Set([
  "requires", "asks", "governed_by",
]);

function shouldFollow(
  edge:      KnowledgeEdge,
  direction: ChainDirection,
  follow:    string[]
): boolean {
  if (follow.length > 0 && !follow.includes(edge.relation)) return false;
  if (direction === "forward")      return FORWARD_RELATIONS.has(edge.relation);
  if (direction === "backward")     return BACKWARD_RELATIONS.has(edge.relation);
  return true;   // bidirectional follows all
}

export async function getReasoningChain(
  query: ChainQuery
): Promise<ReasoningChain | null> {
  const graph   = getKnowledgeGraph();
  const maxHops = query.maxHops ?? 3;
  const dir     = query.direction ?? "forward";
  const follow  = query.followEdges ?? [];
  const stopAt  = new Set(query.stopAtTypes ?? []);

  // Find starting node
  let root: KnowledgeNode | undefined;
  if (query.startId) {
    root = graph.nodes.find((n) => n.id === query.startId);
  } else if (query.startLabel) {
    const label = query.startLabel.toLowerCase();
    root = graph.nodes.find((n) => n.label.toLowerCase().includes(label));
  } else if (query.startType) {
    root = graph.nodes.find((n) => n.type === query.startType);
  }

  if (!root) return null;

  // BFS traversal
  const chain:      ChainNode[] = [];
  const visited     = new Set<string>([root.id]);
  const queue:      ChainNode[] = [{ node: root, hop: 0, pathSoFar: [root.id] }];
  let   truncated   = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    chain.push(current);

    if (current.hop >= maxHops) { truncated = true; continue; }
    if (stopAt.size > 0 && stopAt.has(current.node.type) && current.hop > 0) continue;

    // Find edges from this node
    const outEdges = graph.edges.filter((e) => {
      if (!shouldFollow(e, dir, follow)) return false;
      if (dir === "backward") return e.to === current.node.id;
      return e.from === current.node.id;
    });

    for (const edge of outEdges) {
      const nextId   = dir === "backward" ? edge.from : edge.to;
      if (visited.has(nextId)) continue;

      const nextNode = graph.nodes.find((n) => n.id === nextId);
      if (!nextNode) continue;

      visited.add(nextId);
      queue.push({
        node:      nextNode,
        hop:       current.hop + 1,
        via:       edge,
        pathSoFar: [...current.pathSoFar, nextId],
      });
    }
  }

  const uniqueTypes    = [...new Set(chain.map((c) => c.node.type))];
  const terminalNodes  = chain
    .filter((c) => !chain.some((other) => other.via?.from === c.node.id))
    .map((c) => c.node);

  return {
    root,
    chain,
    maxHops,
    direction: dir,
    uniqueTypes,
    terminalNodes,
    truncated,
  };
}

/** Summarise a chain into a readable clinical reasoning narrative */
export function summariseChain(chain: ReasoningChain): string {
  if (chain.chain.length === 0) return `No chain found from "${chain.root.label}"`;

  const steps = chain.chain.map((c) => {
    const relation = c.via ? ` [${c.via.relation}]→ ` : "";
    return `${relation}${c.node.type.toUpperCase()}(${c.node.label})`;
  });

  return `Chain from ${chain.root.type.toUpperCase()}(${chain.root.label}):\n${steps.join("\n")}`;
}

/** Find all chains between two node labels — useful for "how does X relate to Y?" */
export async function findChainsConnecting(
  fromLabel: string,
  toLabel:   string,
  maxHops    = 4
): Promise<ReasoningChain[]> {
  const graph = getKnowledgeGraph();
  const toNode = graph.nodes.find((n) => n.label.toLowerCase().includes(toLabel.toLowerCase()));
  if (!toNode) return [];

  const fromNodes = graph.nodes.filter((n) =>
    n.label.toLowerCase().includes(fromLabel.toLowerCase())
  );

  const chains: ReasoningChain[] = [];
  for (const from of fromNodes) {
    const chain = await getReasoningChain({
      startId:   from.id,
      maxHops,
      direction: "bidirectional",
    });
    if (chain && chain.chain.some((c) => c.node.id === toNode.id)) {
      chains.push(chain);
    }
  }
  return chains;
}

/** Get the evidence lineage for a disposition — useful for FDA audit */
export async function getDispositionLineage(
  dispositionLabel: string
): Promise<ReasoningChain | null> {
  return getReasoningChain({
    startLabel: dispositionLabel,
    startType:  "disposition",
    direction:  "backward",
    maxHops:    5,
  });
}

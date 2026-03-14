export type GraphNode = {
  id: string;
  type: "symptom" | "diagnosis" | "complaint" | "red_flag" | "question" | "medication" | "disposition" | "test" | "unknown";
  label?: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  relation: string;
  weight: number;
};

export type DiagnosisScore = { diagnosis: string; score: number };

export class ClinicalGraph {
  nodes: Map<string, GraphNode> = new Map();
  edges: GraphEdge[] = [];

  addNode(id: string, type: GraphNode["type"] = "unknown", label?: string): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, type, label });
    }
  }

  addEdge(from: string, to: string, relation: string, weight = 1): void {
    this.addNode(from);
    this.addNode(to);
    this.edges.push({ from, to, relation, weight });
  }

  /**
   * Returns the IDs of all nodes reachable from `nodeId` via edges with the given relation.
   * If `relation` is omitted, returns all outbound neighbours.
   */
  getNeighbors(nodeId: string, relation?: string): string[] {
    return this.edges
      .filter((e) => e.from === nodeId && (!relation || e.relation === relation))
      .map((e) => e.to);
  }

  /**
   * Returns edges pointing TO `nodeId` (incoming).
   */
  getIncoming(nodeId: string, relation?: string): GraphEdge[] {
    return this.edges.filter(
      (e) => e.to === nodeId && (!relation || e.relation === relation)
    );
  }

  /**
   * Multi-hop traversal — follows `supports` edges up to `maxDepth` hops.
   * Returns a map of nodeId → accumulated weight.
   */
  traverse(startIds: string[], relation: string, maxDepth = 2): Map<string, number> {
    const visited = new Map<string, number>();
    const queue: Array<{ id: string; depth: number; weight: number }> = startIds.map((id) => ({
      id,
      depth: 0,
      weight: 1,
    }));

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      for (const edge of this.edges) {
        if (edge.from !== item.id || (relation && edge.relation !== relation)) continue;
        const next = edge.to;
        const acc = (visited.get(next) || 0) + item.weight * edge.weight;
        visited.set(next, acc);
        queue.push({ id: next, depth: item.depth + 1, weight: item.weight * edge.weight * 0.5 });
      }
    }

    return visited;
  }

  /**
   * Primary scoring function: given a list of active symptoms, scores all
   * reachable diagnoses via "supports" edges (direct + multi-hop).
   */
  scoreDiagnoses(symptoms: string[]): DiagnosisScore[] {
    const scores: Record<string, number> = {};

    for (const sym of symptoms) {
      const direct = this.edges.filter((e) => e.from === sym && e.relation === "supports");
      for (const edge of direct) {
        scores[edge.to] = (scores[edge.to] || 0) + edge.weight;
      }
    }

    // Multi-hop boost (complaint → symptom → diagnosis)
    const hopMap = this.traverse(symptoms, "supports", 2);
    for (const [node, weight] of hopMap.entries()) {
      if (!Object.keys(scores).includes(node)) {
        scores[node] = weight * 0.3;
      }
    }

    return Object.entries(scores)
      .map(([diagnosis, score]) => ({ diagnosis, score }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Returns red-flag nodes reachable from a diagnosis via "danger" edges.
   */
  getRedFlags(diagnosis: string): string[] {
    return this.getNeighbors(diagnosis, "danger");
  }

  /**
   * Returns confirmatory questions for a diagnosis via "confirm" edges.
   */
  getConfirmQuestions(diagnosis: string): string[] {
    return this.getNeighbors(diagnosis, "confirm");
  }

  /**
   * Returns tests recommended for a diagnosis via "test" edges.
   */
  getTests(diagnosis: string): string[] {
    return this.getNeighbors(diagnosis, "test");
  }

  /**
   * Returns treatment options for a diagnosis via "treatment" edges.
   */
  getTreatments(diagnosis: string): string[] {
    return this.getNeighbors(diagnosis, "treatment");
  }

  /**
   * Serialise to a plain object so it can be saved as JSON.
   */
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return { nodes: Array.from(this.nodes.values()), edges: this.edges };
  }

  /**
   * Restore a ClinicalGraph from a plain JSON object.
   */
  static fromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): ClinicalGraph {
    const g = new ClinicalGraph();
    for (const n of data.nodes || []) g.nodes.set(n.id, n);
    g.edges = data.edges || [];
    return g;
  }

  get nodeCount(): number { return this.nodes.size; }
  get edgeCount(): number { return this.edges.length; }
}

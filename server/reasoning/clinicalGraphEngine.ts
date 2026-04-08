export interface ClinicalNode {
  id: string;
  type: "symptom" | "finding" | "diagnosis" | "test" | "treatment" | "disposition";
  label: string;
}

export interface ClinicalEdge {
  from: string;
  to: string;
  condition?: (ctx: any) => boolean;
  likelihood?: number;
  risk?: number;
}

export interface TraversalState {
  visited: Set<string>;
  path: string[];
  score: number;
  riskAccum: number;
}

export class ClinicalGraphEngine {
  private nodes = new Map<string, ClinicalNode>();
  private edges: ClinicalEdge[] = [];

  addNode(node: ClinicalNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: ClinicalEdge): void {
    this.edges.push(edge);
  }

  getOutgoing(nodeId: string): ClinicalEdge[] {
    return this.edges.filter(e => e.from === nodeId);
  }

  traverse(startNodes: string[], context: any): TraversalState[] {
    const results: TraversalState[] = [];

    const dfs = (state: TraversalState) => {
      const current = state.path[state.path.length - 1];
      const outgoing = this.getOutgoing(current);

      if (!outgoing.length) {
        results.push(state);
        return;
      }

      for (const edge of outgoing) {
        if (edge.condition && !edge.condition(context)) continue;
        if (state.visited.has(edge.to)) continue;

        dfs({
          visited: new Set([...state.visited, edge.to]),
          path: [...state.path, edge.to],
          score: state.score + (edge.likelihood || 0),
          riskAccum: state.riskAccum + (edge.risk || 0),
        });
      }
    };

    for (const start of startNodes) {
      dfs({
        visited: new Set([start]),
        path: [start],
        score: 0,
        riskAccum: 0,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }
}

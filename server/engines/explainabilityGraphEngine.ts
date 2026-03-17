export interface TraceNode {
  id: string;
  label: string;
  type: "input" | "engine" | "decision" | "output" | "safety";
  duration?: number;
}

export interface TraceEdge {
  source: string;
  target: string;
  label?: string;
}

export interface ExplainabilityGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
  totalSteps: number;
  totalDuration: number;
}

export class ExplainabilityGraphEngine {
  build(trace: { layer: string; durationMs: number }[]): ExplainabilityGraph {
    const nodes: TraceNode[] = [];
    const edges: TraceEdge[] = [];

    const typeMap: Record<string, TraceNode["type"]> = {
      interface: "input", normalization: "input", state: "engine",
      knowledge: "engine", safety: "safety", reasoning: "engine",
      decision: "decision",
    };

    trace.forEach((step, i) => {
      nodes.push({ id: step.layer, label: step.layer.charAt(0).toUpperCase() + step.layer.slice(1), type: typeMap[step.layer] || "engine", duration: step.durationMs });
      if (i > 0) edges.push({ source: trace[i - 1].layer, target: step.layer, label: `${step.durationMs}ms` });
    });

    return { nodes, edges, totalSteps: trace.length, totalDuration: trace.reduce((s, t) => s + t.durationMs, 0) };
  }

  buildFromSteps(steps: string[]): ExplainabilityGraph {
    return this.build(steps.map((s) => ({ layer: s, durationMs: 0 })));
  }
}

export const explainabilityGraphEngine = new ExplainabilityGraphEngine();

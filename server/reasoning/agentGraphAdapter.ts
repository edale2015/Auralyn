import { ClinicalGraphEngine } from "./clinicalGraphEngine";

export interface AdapterAgentOutput {
  confidence: number;
  [key: string]: any;
}

export class AgentGraphAdapter {
  constructor(
    private graph: ClinicalGraphEngine,
    private startNodes: (ctx: any) => string[],
  ) {}

  buildPaths(outputs: AdapterAgentOutput[], context: any) {
    const starts = this.startNodes(context);
    const paths = this.graph.traverse(starts, context);
    const confidenceBonus = outputs.reduce((s, o) => s + o.confidence * 0.05, 0);
    return paths.map(p => ({ ...p, score: p.score + confidenceBonus })).slice(0, 3);
  }
}

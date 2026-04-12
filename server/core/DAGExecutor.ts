import type { FlowContext } from "./FlowContext";
import type { MedicalAgent } from "./MedicalAgent";

export class DAGExecutor {
  constructor(private readonly agents: MedicalAgent[]) {}

  /** Validates that every `consumes` key is provided by some agent (or the initial context). */
  validate(availableKeys: string[] = []): void {
    const provided = new Set<string>([...availableKeys]);

    for (const agent of this.agents) {
      const missing = agent.meta.consumes.filter((c) => !provided.has(c));
      if (missing.length > 0) {
        throw new Error(
          `DAGExecutor: agent "${agent.meta.name}" requires missing keys: [${missing.join(", ")}]`
        );
      }
      for (const p of agent.meta.provides) provided.add(p);
    }
  }

  /** Run agents sequentially, merging each output into the shared context. */
  async run(ctx: FlowContext): Promise<FlowContext> {
    this.validate(Object.keys(ctx.dump()));

    for (const agent of this.agents) {
      const result = await agent.run(ctx);
      ctx.merge(result);
    }

    return ctx;
  }

  /**
   * Run layers of agents in parallel (agents within each layer run concurrently,
   * layers are executed sequentially).
   */
  async runParallel(layers: MedicalAgent[][], ctx: FlowContext): Promise<FlowContext> {
    for (const layer of layers) {
      const clones  = layer.map(() => ctx.clone());
      const results = await Promise.all(layer.map((agent, i) => agent.run(clones[i])));
      for (const result of results) ctx.merge(result);
    }
    return ctx;
  }
}

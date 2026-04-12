import type { FlowContext } from "./FlowContext";

export interface AgentMeta {
  name:     string;
  consumes: string[];
  provides: string[];
}

export abstract class MedicalAgent {
  readonly meta: AgentMeta;

  constructor(meta: AgentMeta) {
    this.meta = meta;
  }

  abstract run(ctx: FlowContext): Promise<FlowContext>;
}

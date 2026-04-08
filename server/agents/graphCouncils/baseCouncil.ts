import type { AgentInput, AgentOutput, CouncilName, CouncilRunResult } from "./types";
import { graphDebateEngine } from "./debateEngine";
import { graphConsensusEngine } from "./consensusEngine";
import type { AgentGraphAdapter } from "../../reasoning/agentGraphAdapter";

export type SpecialistAgent = (input: AgentInput) => Promise<AgentOutput>;

export abstract class BaseCouncil {
  constructor(
    public readonly council: CouncilName,
    protected readonly agents: SpecialistAgent[],
    protected readonly graphAdapter: AgentGraphAdapter,
  ) {}

  async run(input: AgentInput): Promise<CouncilRunResult> {
    let outputs = await Promise.all(this.agents.map(fn => fn({ ...input, council: this.council })));

    const debate = graphDebateEngine.generateCritiques(outputs);
    outputs = graphDebateEngine.apply(debate, outputs);

    const consensus = graphConsensusEngine.compute(outputs);
    const reasoningPaths = this.graphAdapter.buildPaths(outputs, input.patient);
    const finalDecision = this.finalize(consensus, outputs, input);

    return {
      council: this.council,
      outputs,
      debate,
      consensus,
      reasoningPaths,
      finalDecision,
    };
  }

  protected abstract finalize(
    consensus: CouncilRunResult["consensus"],
    outputs: AgentOutput[],
    input: AgentInput,
  ): Record<string, unknown>;
}

import { FlowContext } from "../core/FlowContext";
import { getAgent } from "../registry";
import type { FlowStep, PipelineConfig } from "./loader";

export interface YamlRunResult {
  pipelineName: string;
  steps:        number;
  context:      Record<string, unknown>;
  durationMs:   number;
}

export async function runYamlPipeline(
  config: PipelineConfig,
  input:  Record<string, unknown>
): Promise<YamlRunResult> {
  const ctx   = new FlowContext(input);
  const start = Date.now();
  let steps   = 0;

  for (const step of config.flow) {
    if (step.parallel && step.parallel.length > 0) {
      const agents  = step.parallel.map(getAgent);
      const clones  = agents.map(() => ctx.clone());
      const results = await Promise.all(agents.map((a, i) => a.run(clones[i])));
      for (const r of results) ctx.merge(r);
      steps += step.parallel.length;
    }

    if (step.sequential && step.sequential.length > 0) {
      for (const name of step.sequential) {
        const result = await getAgent(name).run(ctx);
        ctx.merge(result);
        steps++;
      }
    }
  }

  return {
    pipelineName: config.name,
    steps,
    context:    ctx.dump(),
    durationMs: Date.now() - start,
  };
}

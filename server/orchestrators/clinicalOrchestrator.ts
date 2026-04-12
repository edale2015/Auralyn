import { FlowContext } from "../core/FlowContext";
import { DAGExecutor } from "../core/DAGExecutor";
import { RedFlagAgent } from "../agents/redFlagAgent";

export async function runClinicalPipeline(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const ctx = new FlowContext(input);

  // Ensure required keys exist with defaults so DAG validation passes
  if (!ctx.has("vitals"))   ctx.set("vitals",   {});
  if (!ctx.has("symptoms")) ctx.set("symptoms", {});

  const executor = new DAGExecutor([new RedFlagAgent()]);

  const resultCtx = await executor.run(ctx);
  return resultCtx.dump();
}

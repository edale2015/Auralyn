import { getStep } from "./registry";

export interface WorkflowDef {
  steps: Array<{ name: string; config?: Record<string, any> }>;
}

export async function runStepWorkflow(def: WorkflowDef, input: Record<string, any>): Promise<Record<string, any>> {
  let ctx: Record<string, any> = { ...input };
  for (const s of def.steps) {
    const fn = getStep(s.name);
    if (!fn) throw new Error(`Missing workflow step: ${s.name}`);
    ctx = await fn({ ...ctx, config: s.config });
  }
  return ctx;
}

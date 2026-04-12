/**
 * Sub-Workflow Engine (n8n Sub-workflow + Error Output concept)
 *
 * Article — n8n:
 *   "Sub-workflow: A workflow that gets called from inside another workflow.
 *   Lets you build reusable chunks of automation — like functions in programming."
 *
 *   "Error Handling: Right-click any node → Add Error Output. Connect the error
 *   output to a Slack node that notifies you when something fails. Never let a
 *   broken workflow silently fail."
 *
 * What's already present:
 *   - clinicalWorkflowEngine.ts  — sequential 8-step pipeline (throws on error)
 *   - branchRunner.ts            — conditional if/else branching
 *   - runner.ts                  — plain step sequencing
 *   - registry.ts                — step function registry
 *
 * What's missing:
 *   1. No step can invoke another WorkflowDef (sub-workflow composition).
 *      Existing runner processes steps A→B→C but step B cannot internally
 *      run a full workflow D→E→F.
 *   2. On step failure, existing engine throws — crashing the entire encounter.
 *      n8n routes the failure to a dedicated error handler (recovery step),
 *      never silently failing and never aborting the entire pipeline.
 *
 * Clinical use:
 *   Triage Master Workflow:
 *     step 1: sub:vitals_triage          (sub-workflow with its own steps)
 *     step 2: sub:sepsis_screen          (only if fever flag set)
 *     step 3: sub:disposition_planning   (sub-workflow)
 *     errorHandler: "notify_physician"   (route to notification, not crash)
 */

import { getStep, registerStep } from "./registry";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepType = "step" | "sub" | "branch";

export interface WorkflowStep {
  id:           string;
  type:         StepType;
  name:         string;         // step name from registry (if type === "step")
  subWorkflow?: SubWorkflowDef; // inline sub-workflow definition (if type === "sub")
  condition?:   StepCondition;  // if set, step only runs when condition is true
  errorHandler?:string;         // step name to run on error (instead of throwing)
  config?:      Record<string, unknown>;
  timeoutMs?:   number;         // per-step timeout
  retries?:     number;         // 0 = no retry, 1 = retry once, etc.
}

export interface StepCondition {
  field:    string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "exists" | "truthy";
  value?:   unknown;
}

export interface SubWorkflowDef {
  name:  string;
  steps: WorkflowStep[];
}

export interface ComposedWorkflowDef {
  id:          string;
  name:        string;
  steps:       WorkflowStep[];
  errorHandler?:string;   // workflow-level fallback step name
}

export interface StepResult {
  stepId:      string;
  stepName:    string;
  type:        StepType;
  success:     boolean;
  output:      Record<string, unknown>;
  error?:      string;
  durationMs:  number;
  skipped:     boolean;
  skipReason?: string;
  subResults?: StepResult[];  // nested results for sub-workflows
  retryCount:  number;
}

export interface WorkflowRunResult {
  runId:        string;
  workflowId:   string;
  workflowName: string;
  success:      boolean;
  stepResults:  StepResult[];
  finalOutput:  Record<string, unknown>;
  totalMs:      number;
  errorCount:   number;
  skippedCount: number;
  startedAt:    string;
  completedAt:  string;
}

// ── Condition evaluator ───────────────────────────────────────────────────────

function evaluateCondition(ctx: Record<string, unknown>, cond: StepCondition): boolean {
  const val = ctx[cond.field];
  switch (cond.operator) {
    case "eq":     return val === cond.value;
    case "ne":     return val !== cond.value;
    case "gt":     return Number(val) > Number(cond.value);
    case "lt":     return Number(val) < Number(cond.value);
    case "gte":    return Number(val) >= Number(cond.value);
    case "lte":    return Number(val) <= Number(cond.value);
    case "exists": return val !== undefined && val !== null;
    case "truthy": return !!val;
    default:       return true;
  }
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function runSingleStep(
  step:    WorkflowStep,
  ctx:     Record<string, unknown>,
  depth:   number = 0
): Promise<{ result: StepResult; ctx: Record<string, unknown> }> {
  const start = Date.now();

  // Check condition
  if (step.condition && !evaluateCondition(ctx, step.condition)) {
    return {
      result: {
        stepId:      step.id,
        stepName:    step.name,
        type:        step.type,
        success:     true,
        output:      {},
        durationMs:  0,
        skipped:     true,
        skipReason:  `Condition ${step.condition.field} ${step.condition.operator} ${step.condition.value} not met`,
        retryCount:  0,
      },
      ctx,
    };
  }

  // Sub-workflow: recursively run nested steps
  if (step.type === "sub" && step.subWorkflow) {
    let subCtx = { ...ctx };
    const subResults: StepResult[] = [];
    let subSuccess = true;

    for (const subStep of step.subWorkflow.steps) {
      const { result: subResult, ctx: nextCtx } = await runSingleStep(subStep, subCtx, depth + 1);
      subResults.push(subResult);
      subCtx = nextCtx;
      if (!subResult.success && !subResult.skipped) {
        subSuccess = false;
        break;
      }
    }

    return {
      result: {
        stepId:     step.id,
        stepName:   step.subWorkflow.name,
        type:       "sub",
        success:    subSuccess,
        output:     subCtx,
        durationMs: Date.now() - start,
        skipped:    false,
        subResults,
        retryCount: 0,
      },
      ctx: subCtx,
    };
  }

  // Regular step: execute from registry with retry
  const maxAttempts = 1 + (step.retries ?? 0);
  let lastError = "";
  let attempt   = 0;
  let output: Record<string, unknown> = {};

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const fn = getStep(step.name);
      if (!fn) throw new Error(`Step not registered: ${step.name}`);

      const stepInput = { ...ctx, ...(step.config ?? {}) };

      // Apply timeout
      let result: Record<string, unknown>;
      if (step.timeoutMs) {
        result = await Promise.race([
          fn(stepInput) as Promise<Record<string, unknown>>,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Step "${step.name}" timed out after ${step.timeoutMs}ms`)), step.timeoutMs!)
          ),
        ]);
      } else {
        result = await (fn(stepInput) as Promise<Record<string, unknown>>);
      }

      output = result ?? {};
      const newCtx = { ...ctx, ...output };

      return {
        result: {
          stepId:    step.id,
          stepName:  step.name,
          type:      step.type,
          success:   true,
          output,
          durationMs:Date.now() - start,
          skipped:   false,
          retryCount:attempt - 1,
        },
        ctx: newCtx,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 50 * attempt)); // backoff
      }
    }
  }

  // All retries exhausted — route to error handler step if configured
  if (step.errorHandler) {
    const handlerFn = getStep(step.errorHandler);
    if (handlerFn) {
      try {
        const errorCtx = { ...ctx, stepError: lastError, failedStep: step.name };
        const recovered = await (handlerFn(errorCtx) as Promise<Record<string, unknown>>);
        const newCtx = { ...ctx, ...recovered, stepErrorHandled: true };
        return {
          result: {
            stepId:    step.id,
            stepName:  step.name,
            type:      step.type,
            success:   true,   // error was handled
            output:    recovered ?? {},
            error:     `Recovered: ${lastError}`,
            durationMs:Date.now() - start,
            skipped:   false,
            retryCount:attempt - 1,
          },
          ctx: newCtx,
        };
      } catch {
        // Error handler itself failed — fall through to failure result
      }
    }
  }

  return {
    result: {
      stepId:    step.id,
      stepName:  step.name,
      type:      step.type,
      success:   false,
      output:    {},
      error:     lastError,
      durationMs:Date.now() - start,
      skipped:   false,
      retryCount:attempt - 1,
    },
    ctx,  // context unchanged on unrecovered failure
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Execute a ComposedWorkflowDef — the n8n model where:
 *   - steps can embed full sub-workflows (recursive composition)
 *   - each step can have an errorHandler (route on failure, don't crash)
 *   - conditions skip steps based on live context
 *   - retries with exponential backoff per step
 */
export async function runComposedWorkflow(
  def:   ComposedWorkflowDef,
  input: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const startedAt  = new Date().toISOString();
  const tStart     = Date.now();
  const runId      = randomUUID().slice(0, 8);
  const stepResults: StepResult[] = [];
  let ctx          = { ...input };
  let errorCount   = 0;
  let skippedCount = 0;

  for (const step of def.steps) {
    const { result, ctx: nextCtx } = await runSingleStep(step, ctx);
    stepResults.push(result);
    ctx = nextCtx;

    if (result.skipped)         skippedCount++;
    if (!result.success)        errorCount++;
  }

  // Workflow-level error handler if any step failed
  if (errorCount > 0 && def.errorHandler) {
    const handlerFn = getStep(def.errorHandler);
    if (handlerFn) {
      try {
        await (handlerFn({ ...ctx, workflowError: true, errorCount }) as Promise<unknown>);
      } catch {
        // workflow-level handler failure is non-fatal
      }
    }
  }

  return {
    runId,
    workflowId:   def.id,
    workflowName: def.name,
    success:      errorCount === 0,
    stepResults,
    finalOutput:  ctx,
    totalMs:      Date.now() - tStart,
    errorCount,
    skippedCount,
    startedAt,
    completedAt:  new Date().toISOString(),
  };
}

/** Register a named sub-workflow as a single reusable step in the registry. */
export function registerSubWorkflowAsStep(subDef: SubWorkflowDef): void {
  registerStep(subDef.name, async (input: Record<string, unknown>) => {
    let ctx = { ...input };
    for (const step of subDef.steps) {
      const { ctx: nextCtx } = await runSingleStep(step, ctx);
      ctx = nextCtx;
    }
    return ctx;
  });
}

/** Summarize a workflow run for logging/UI. */
export function summarizeRun(result: WorkflowRunResult): string {
  const steps = result.stepResults.length;
  const ok    = result.stepResults.filter((s) => s.success && !s.skipped).length;
  const skip  = result.skippedCount;
  const fail  = result.errorCount;
  return [
    `Workflow "${result.workflowName}" (${result.runId}) — ${result.totalMs}ms`,
    `  Steps: ${ok} succeeded, ${skip} skipped, ${fail} failed of ${steps} total`,
    ...result.stepResults.map((s) => {
      const icon = s.skipped ? "⤵" : s.success ? "✓" : "✗";
      const sub  = s.subResults ? ` [sub: ${s.subResults.length} steps]` : "";
      const err  = s.error ? ` — ${s.error.slice(0, 60)}` : "";
      return `  ${icon} ${s.stepName}${sub} (${s.durationMs}ms)${err}`;
    }),
  ].join("\n");
}

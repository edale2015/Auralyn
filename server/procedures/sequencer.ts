/**
 * FIX (Independent Review — Code Injection):
 *   evaluateCondition() previously used `new Function(...keys, condition)` to evaluate
 *   step conditions. Fixed: replaced with vm.runInNewContext() sandbox — no access
 *   to process, require, or global. Conditions currently come from a static workflow
 *   file but this hardens the path for future dynamic workflow loading.
 */
import vm from "vm";
import { ProcedureStep } from "./workflows/strep";
import { logMetric } from "../monitoring/metrics";
import { auditLog } from "../security/auditLogger";

export interface StepResult {
  step: string;
  status: "completed" | "skipped" | "failed";
  output?: any;
  durationMs: number;
}

export interface ProcedureResult {
  workflowName: string;
  patientId: string;
  steps: StepResult[];
  totalDurationMs: number;
  completedAt: string;
  outcome: "success" | "partial" | "failed";
}

async function moveArm(params: { tool: string; position: string }): Promise<void> {
  console.log(`[Sequencer] Robot arm: tool=${params.tool} → position=${params.position}`);
  await new Promise(r => setTimeout(r, 30));
}

async function runLabTest(testName: string): Promise<{ result: string; confidence: number }> {
  await new Promise(r => setTimeout(r, 20));
  return { result: "negative", confidence: 0.95 };
}

function evaluateCondition(condition: string | undefined, context: Record<string, any>): boolean {
  if (!condition) return true;
  try {
    // Sandbox: only expose plain value keys — no prototype chain, no globals
    const sandbox = Object.create(null);
    for (const [k, v] of Object.entries(context)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
        sandbox[k] = v;
      }
    }
    const script = new vm.Script(`!!(${condition})`, { filename: "step-condition" });
    return script.runInNewContext(sandbox, { timeout: 50 });
  } catch {
    return true;
  }
}

export async function executeStep(
  step: ProcedureStep,
  patient: any,
  context: Record<string, any> = {}
): Promise<StepResult> {
  const start = Date.now();

  if (!evaluateCondition(step.condition, { ...patient, ...context })) {
    return { step: step.step, status: "skipped", durationMs: Date.now() - start };
  }

  try {
    let output: any;

    if (step.tool && step.position) {
      await moveArm({ tool: step.tool, position: step.position });
      output = { moved: true, tool: step.tool, position: step.position };
    }

    if (step.labTest) {
      const labResult = await runLabTest(step.labTest);
      output = labResult;
      context[step.labTest.replace(/_/g, "_")] = labResult.result;
      context["rapid_test"] = labResult.result;
    }

    if (step.medication && !step.condition) {
      output = { prescribed: step.medication, notes: step.notes };
    }

    return { step: step.step, status: "completed", output, durationMs: Date.now() - start };
  } catch (err: any) {
    return { step: step.step, status: "failed", output: { error: err.message }, durationMs: Date.now() - start };
  }
}

export async function runProcedure(
  workflow: ProcedureStep[],
  patient: any,
  workflowName = "unnamed"
): Promise<ProcedureResult> {
  const start = Date.now();
  const context: Record<string, any> = {};
  const steps: StepResult[] = [];

  auditLog({ actor: "sequencer", action: `procedure_start:${workflowName}`, patientId: patient.patientId });

  for (const step of workflow) {
    const result = await executeStep(step, patient, context);
    steps.push(result);

    if (result.output) {
      Object.assign(context, result.output);
    }

    if (result.status === "failed") {
      console.warn(`[Sequencer] Step failed: ${step.step}`);
    }
  }

  const failed = steps.filter(s => s.status === "failed").length;
  const completed = steps.filter(s => s.status === "completed").length;
  const outcome = failed > 0 ? "partial" : completed > 0 ? "success" : "failed";
  const totalDurationMs = Date.now() - start;

  logMetric(`procedure.${workflowName}.duration`, totalDurationMs, "latency", { workflow: workflowName });

  return {
    workflowName,
    patientId: patient.patientId ?? "unknown",
    steps,
    totalDurationMs,
    completedAt: new Date().toISOString(),
    outcome,
  };
}

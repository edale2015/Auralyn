import { runBrowserTask, BrowserTaskInput } from "../rpa/browserAgent";
import { analyzeScreenshot } from "../vision/visionEngine";
import { withRetry } from "../utils/withRetry";

export interface ExecutionStep {
  type: "rpa" | "vision";
  task?: BrowserTaskInput;
  image?: string;
  timeoutMs?: number;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export interface ExecutionResult {
  type: "rpa" | "vision";
  result: any;
  success: boolean;
  error?: string;
  durationMs: number;
}

async function runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function executeActions(plan: ExecutionPlan): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const step of plan.steps ?? []) {
    const stepStart = Date.now();

    if (step.type === "rpa" && step.task) {
      try {
        const timeout = step.timeoutMs ?? 15_000;
        const result = await withRetry(
          () => runWithTimeout(runBrowserTask(step.task!), timeout),
          2
        );
        results.push({ type: "rpa", result, success: result.success, durationMs: Date.now() - stepStart });
      } catch (e: any) {
        results.push({ type: "rpa", result: null, success: false, error: e?.message, durationMs: Date.now() - stepStart });
      }
    }

    if (step.type === "vision" && step.image) {
      try {
        const result = await withRetry(() => analyzeScreenshot(step.image!), 2);
        results.push({ type: "vision", result, success: true, durationMs: Date.now() - stepStart });
      } catch (e: any) {
        results.push({ type: "vision", result: null, success: false, error: e?.message, durationMs: Date.now() - stepStart });
      }
    }
  }

  return results;
}

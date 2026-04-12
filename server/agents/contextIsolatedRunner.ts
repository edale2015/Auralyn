/**
 * Context-Isolated Clinical Task Runner (GSD-style)
 * Every task executes in a fresh, UUID-tagged context with zero memory carryover.
 * Prevents context drift across long reasoning chains.
 *
 * Design principle:
 *   - Each task gets its own contextId + clean memory object
 *   - All tasks run in parallel via Promise.all (wave execution)
 *   - Failures in one task do not crash the wave — errors are captured per-task
 */

import { randomUUID } from "crypto";

export interface ClinicalTask<T = any> {
  name:    string;
  input?:  any;
  execute: (ctx: IsolatedContext) => Promise<T>;
}

export interface IsolatedContext {
  contextId:  string;
  startedAt:  number;
  memory:     Record<string, any>;   // always empty — zero carryover
}

export interface TaskResult<T = any> {
  name:       string;
  contextId:  string;
  status:     "success" | "error";
  result?:    T;
  error?:     string;
  durationMs: number;
}

export interface WaveResult {
  tasks:      Record<string, TaskResult>;
  waveId:     string;
  startedAt:  string;
  durationMs: number;
  allPassed:  boolean;
}

export async function runClinicalWave(tasks: ClinicalTask[]): Promise<WaveResult> {
  const waveId   = randomUUID();
  const waveStart= Date.now();

  const taskResults = await Promise.all(
    tasks.map(async (task): Promise<TaskResult> => {
      const contextId = randomUUID();
      const taskStart = Date.now();

      const freshContext: IsolatedContext = {
        contextId,
        startedAt: taskStart,
        memory:    {},              // strictly isolated — no shared memory
      };

      try {
        const result = await task.execute(freshContext);
        return {
          name:       task.name,
          contextId,
          status:     "success",
          result,
          durationMs: Date.now() - taskStart,
        };
      } catch (err: any) {
        return {
          name:       task.name,
          contextId,
          status:     "error",
          error:      err?.message ?? String(err),
          durationMs: Date.now() - taskStart,
        };
      }
    })
  );

  const taskMap: Record<string, TaskResult> = {};
  for (const t of taskResults) taskMap[t.name] = t;

  return {
    tasks:      taskMap,
    waveId,
    startedAt:  new Date(waveStart).toISOString(),
    durationMs: Date.now() - waveStart,
    allPassed:  taskResults.every((t) => t.status === "success"),
  };
}

/** Convenience: extract result values only (throws if any task errored) */
export function extractResults<T extends Record<string, any>>(wave: WaveResult): T {
  const out: Record<string, any> = {};
  for (const [name, task] of Object.entries(wave.tasks)) {
    if (task.status === "error") throw new Error(`Task "${name}" failed: ${task.error}`);
    out[name] = task.result;
  }
  return out as T;
}
